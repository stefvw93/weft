# List.each first-emission bulk mount fast path

> Behavior invariants live in [`./list.specs.md`](./list.specs.md) (MR / KR / SC / ID / ER).
> This spec covers a **behavior-preserving performance optimization** of the mount path.
> Tracking issue: [#178](https://github.com/stefvw93/weft/issues/178). Follow-up to the
> Loom render scheduler ([`./loom.specs.md`](./loom.specs.md), PR #170 / v0.31.0).

> Requirements were locked by the delegated task brief (no interactive Q&A):
> internal fast path, no new public API, identical post-mount state, permanent
> perf guard, docs guidance. Design decisions are recorded under Technical
> Requirements below.

## Overview & Purpose

A `List.each` region's **first** emission has no previous state, yet today it pays
the full keyed-reconciliation machinery designed for updates (`reconcileList`,
`render.ts`): per-item key projection into an immutable `HashSet` (duplicate
guard) and `HashMap` (identity map), a `prevIndex` build, a drop-set diff, and a
`longestIncreasingSubsequence` pass over an all-`-1` `sources` array. For a large
static list (e.g. 10,000 rows) this makes first render materially slower than the
same items rendered as plain array children, even though the list never changes.

This feature adds a **bulk mount fast path**: when a reconcile runs against empty
previous state, build the region in a single pass (Effect-`Equal`-aware duplicate
guard, no move computation, single-pass insert before the region end marker) and
produce the **exact same** post-mount `ListState` the general path would. Every
later reconcile then behaves identically.

The fast path triggers on **empty previous state**, not literally "first emission".
This also covers a region that emptied and refilled (`[a,b] → [] → [c,d]`): after
the empty emission the region has empty state and empty DOM, so a bulk insert is
correct there too.

## Acceptance Criteria

- [x] **FE1 (DOM parity):** For a first emission `[a, b, c]`, the mounted DOM is
      structurally identical to today's reconcile output: `stream-start`, then per
      item its `list-item-start`, rendered nodes, `list-item-end`, then
      `stream-end`, in item order (MR1). `render` runs exactly once per key under
      its own forked per-item scope (MR2).
- [x] **FE2 (record-state parity → later reconciles unchanged):** After a
      fast-path mount of `[a, b, c]`, a subsequent emission reconciles exactly as
      it does today: `[c, a, d]` reuses `a`/`c` nodes without re-rendering (KR3),
      inserts `d` once (KR2), removes `b`'s range and closes its scope (KR4), and
      moves via LIS (KR5). This proves the fast path built the same
      `HashMap<K, ItemRecord>` identity map and `order`.
- [x] **FE3 (duplicate guard preserved):** A first emission with two items that
      project to `Equal` keys fails with the same descriptive `RenderError`
      (naming the duplicate key) before any DOM is touched (KR1). The fast path
      uses Effect `Equal`/`Hash`, not native reference identity.
- [x] **FE4 (empty first emission):** A first emission of `[]` mounts only the
      `stream-start`/`stream-end` markers (no item nodes); a later non-empty
      emission inserts items between them (MR3).
- [x] **FE5 (subscription preservation across the boundary):** An item whose
      `render` starts a self-incrementing per-item stream keeps running when the
      list is later reordered or has items inserted/removed (SC1): the fast path
      forks the same persistent per-item scopes the general path does.
- [x] **FE6 (empty→refill uses the fast path):** `[a, b] → [] → [c, d]` renders
      `c`, `d` correctly (fresh nodes inserted before the end marker), confirming
      the trigger is empty previous state, not a one-shot first-emission flag.
- [x] **FE7 (perf guard, permanent):** A first render of 10,000 static rows is
      structurally correct (10,000 `list-item-start` markers, correct order) and
      completes within a generous timing cap, in a permanent
      `perf-list-mount.browser.test.ts` styled after the existing
      `perf-*.browser.test.ts` files (structural assertions primary). The bulk
      path brings 10k first-render materially closer to plain array children.

## Technical Requirements

- **Trigger (design decision):** a branch at the top of `reconcileList` taken when
  previous state is empty (`HashMap.isEmpty(prev.records)` and
  `prev.order.length === 0`). No call-site changes: `renderList` and `hydrateList`
  still call `reconcileList`. Every caller that passes an empty `prev` hits the
  branch: `renderList`'s fresh commits, post-empty refills, and `hydrateList`'s
  HY2 divergence recovery (below).
- **Hydration (verified, reachable but harmless):** `hydrateList`'s flash-free
  first-emission _adoption_ runs in `hydrateFirstListEmission`, not `reconcileList`,
  so it is unaffected. But that function's **HY2 region-level divergence recovery**
  (`render.ts`, server item count != first-emission key count) discards the adopted
  DOM and calls `reconcileList(items, by, render, { records: HashMap.empty(),
order: [] }, …)` with an explicitly empty `prev` — so it now takes the fast path.
  This is safe: the fast path is behavior-equivalent to the general path for empty
  `prev`, so the fresh rebuild is identical (just faster), and the adopted DOM was
  already removed before the call. Covered by the existing HY2 divergence test in
  `list.hydrate.test.ts` (mismatched server/emission item counts), which stays
  green. Later hydration emissions still reconcile against non-empty state.
- **Duplicate detection:** keeps Effect `Equal`/`Hash` semantics (ID1, KR1). A
  native `Map`/`Set` keyed by reference would misidentify structurally-equal `Data`
  keys, so the guard stays `Equal`-aware (reuse `projectKeys` or an equivalent
  `Equal`-aware dedup). Exact structure is an `/implement` concern.
- **Output parity:** the returned `ListState.records` is the same
  `HashMap<K, ItemRecord>` shape the general path yields (so later
  `HashMap.get(prev.records, key)` lookups behave identically), and `order` is the
  projected key list. Built in bulk (single pass), skipping `prevIndex`, the
  drop-set walk, and `longestIncreasingSubsequence` (all no-ops against empty
  state).
- **DOM insertion:** each item's `[startMarker, ...nodes, endMarker]` range is
  inserted once, in order, before the region end marker (single pass), instead of
  the general path's right-to-left anchored re-insert.
- **Equivalence obligation:** the fast path must be provably equivalent to the
  general path for the empty-previous-state case; any snapshot with non-empty
  previous state falls through to today's code unchanged.

## Dependencies & Integrations (workflow-step applicability)

- **`/mock`: not applicable, no new public API surface.** The change is a private
  branch inside `reconcileList`; no exported function, type, or value is added or
  changed. Recorded skip.
- **`/type-tests`: not applicable, no type-level surface.** `reconcileList`'s
  signature is unchanged; no new generics, constraints, or inference. Recorded
  skip. (Canonical: `type-tests: not applicable, reconcileList signature
unchanged; internal-only optimization with no new type surface`.)
- **`/unit-test`: applies, but as equivalence/regression guards (no red phase).**
  This is a behavior-preserving optimization: the observable ACs (FE1–FE6) are
  already true under the general path, so they cannot fail before implementation.
  Two facts make the guards meaningful anyway: (1) `list.test.ts` already mounts
  from a non-empty `SubscriptionRef`, so its whole MR/KR/SC/ID/ER suite already
  exercises the empty-previous-state branch (mount → reconcile) and must stay
  green; (2) `list-mount-fast-path.test.ts` adds the cases that suite omits —
  FE6 (populated→empty→refill re-entry) and fast-path record-state parity at
  non-trivial scale (FE2) — which a broken empty-prev detection or bulk insert
  would fail. The genuine red→green signal for this feature is the `/e2e` perf
  guard (FE7), not a unit test.
- **`/e2e`: applies.** Permanent `perf-list-mount.browser.test.ts` (FE7); existing
  list browser behavior must stay green.
- **`/document`: applies.** `docs/how-to/render-keyed-lists.md` guidance (static
  lists → plain array children; `by: index` defeats reconciliation) and a brief
  internal note in `list.specs.md` that a behavior-preserving mount fast path
  exists.

## Expected Behavior & Edge Cases

- Empty `items` against empty state: empty `ListState`, no DOM beyond region
  markers (MR3).
- Empty previous state reached via prior removal (`empty → refill`): fast path,
  correct fresh insert (FE6).
- Duplicate keys: `RenderError`, no partial DOM (FE3).
- Non-empty previous state: never takes the fast path; general reconcile runs
  unchanged (this preserves KR2/KR3/KR4/KR5 for all updates).
- Source/reconcile failures on the first emission route to the nearest
  `BoundaryContext` exactly as today (ER1/ER2), since the branch runs inside the
  same cell commit.
