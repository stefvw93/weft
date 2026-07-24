# List.each monotonic-append reconcile fast path

> Behavior invariants live in [`./list.specs.md`](./list.specs.md) (MR / KR / SC / ID / ER).
> This spec covers a **behavior-preserving performance optimization** of the update path.
> Tracking issue: [#171](https://github.com/stefvw93/weft/issues/171) (residual of #168).
> Follow-up to the Loom render scheduler ([`./loom.specs.md`](./loom.specs.md), PR #170).

> Requirements were locked by the delegated task brief (no interactive Q&A):
> internal fast path, no new public API, identical post-reconcile state, extend
> the perf backlog guard with an append-cost bound. Design decisions are recorded
> under Technical Requirements below.

## Overview & Purpose

`List.each` reconciliation (`reconcileList`, `render.ts`) handles every non-first
emission the same way: project keys, build a previous-index map, diff the key set,
and run a `longestIncreasingSubsequence` over the retained items' previous indices
to compute minimal moves. That is correct for arbitrary reorders, but the most
common list mutation is a **pure append**: the new snapshot is the previous order,
unchanged and in order, followed by one or more brand-new keys at the tail.

For an append, all that machinery is wasted. Nothing moves, nothing is removed,
and the LIS of the retained prefix is trivially the whole prefix. The Loom
scheduler (#170) already conflates queued snapshots so only the latest reconciles,
but each surviving reconcile still pays the full O(n log n) diff+LIS walk over the
entire list even when only the tail grew (the #168 residual).

This feature adds a **monotonic-append fast path**: detect that the emission is the
previous order plus a new suffix, then skip the previous-index build, the drop-set
walk, and the LIS entirely. The unchanged prefix is reused in place, the appended
items are rendered and inserted in one pass before the region end marker, and the
next `ListState` is built as `prev.records` plus the tail. The post-reconcile state
is identical to the general path, so later reconciles behave the same.

## Acceptance Criteria

- [x] **AP1 (append detected):** Given current keys `[a, b, c]`, an emission
      `[a, b, c, d, e]` (same prefix, in order, plus new keys `d, e`) is recognized
      as a pure append and takes the fast path.
- [x] **AP2 (DOM parity):** For that append, `render` runs once for `d` and once
      for `e` (never for `a, b, c`), `d` then `e`'s ranges are inserted in order
      immediately before the region end marker, and `a, b, c` keep their exact DOM
      nodes and positions (no moves, no re-render). The result is identical to the
      general path (KR2 for the tail, KR3 for the prefix).
- [x] **AP3 (record-state parity → later reconciles unchanged):** After an append
      fast path, a subsequent arbitrary emission (reorder, mid-insert, remove)
      reconciles exactly as it does today, proving the fast path built the same
      `HashMap<K, ItemRecord>` identity map (`prev.records` + tail) and `order`.
- [x] **AP4 (non-append falls through):** Snapshots that are not a pure suffix
      append take the unchanged general path: a reorder (`[a, b] → [b, a]`), a
      mid-insert (`[a, c] → [a, b, c]`), a removal (`[a, b, c] → [a, c]`), a
      same-length change, and any snapshot whose first `prev.order.length` keys do
      not match `prev.order` in order.
- [x] **AP5 (duplicate guard preserved):** A snapshot whose "tail" duplicates a
      prefix key or another tail key (e.g. `[a, b] → [a, b, a]`) still fails with
      the same descriptive `RenderError` (KR1). The fast path never bypasses the
      duplicate guard.
- [x] **AP6 (subscription preservation):** Appending items does not close or
      restart any existing item's scope; a prefix item's running per-item stream
      keeps counting across appends (SC1 holds through the fast path).
- [x] **AP7 (append-cost guard, permanent):** Appending `K` rows to an `N`-row
      list inserts exactly the `K` new item ranges before the end marker and moves
      none of the `N` existing rows, under a generous timing cap. It also asserts
      the fast-path **insertion signature**: every tail range is inserted before
      the single region end marker (one distinct anchor). The behavior-identical
      general LIS path anchors each new item to the next (one anchor per item), so
      a single distinct anchor is what proves the fast path ran, and fails if it
      is removed. Added to (or alongside) `perf-list-backlog.browser.test.ts`.

## Technical Requirements

- **Trigger (design decision):** a branch inside `reconcileList`, after
  `projectKeys` (so the duplicate guard and key projection run exactly as today),
  taken when **all** hold:
  1. `prev.order.length > 0` (there is a non-empty prefix to append onto; the
     empty-previous-state / mount case is out of scope, left to the general path
     and to Feature A's mount fast path when merged).
  2. `keys.length > prev.order.length` (strictly grew).
  3. For every `i` in `[0, prev.order.length)`, `Equal.equals(keys[i],
prev.order[i])` (the prefix is unchanged and in order).
- **Why the tail is guaranteed new:** `projectKeys` already proved every key in
  `keys` is globally unique (KR1). Combined with the prefix equalling `prev.order`,
  every tail key differs from every prefix key, so no tail key is in `prev.records`.
  No extra membership check is needed; correctness follows from projection +
  prefix match.
- **Fast-path body:** reuse `prev.records`' entries for the prefix untouched
  (their DOM and scopes are already correct and positioned). For each tail key,
  `renderItem` under a fresh per-item scope (identical to KR2). Insert each tail
  range `[startMarker, ...nodes, endMarker]` in order, once, before the region end
  marker (single pass). Build the next state: `records = prev.records` extended
  with the tail entries (`HashMap.set` per tail item, O(tail)), `order = keys`.
- **Output parity:** the returned `ListState` is identical to what the general
  path yields for the same append, so every MR/KR/SC/ID/ER guarantee is preserved
  and later reconciles are unaffected.
- **Cost:** removes the `prevIndex` build, the drop-set `HashSet` walk, the
  `longestIncreasingSubsequence`, the per-prefix `HashMap.get` reuse lookups, and
  the full `nextRecords` rebuild. `projectKeys` (one pass, the duplicate guard)
  and an O(prefix) `Equal.equals` scan remain; DOM work is O(tail). The general
  path already produced O(tail) DOM ops for appends (LIS keeps the prefix), so the
  win is CPU, not DOM-op count.
- **New import:** `Equal` from `effect` (for the positional prefix comparison),
  consistent with the `Equal`/`Hash` keying used throughout the list path.
- **Merge note (Feature A):** Feature A (issue #178) adds an empty-previous-state
  branch checked first. This feature's `prev.order.length > 0` guard keeps the two
  disjoint: empty prev → Feature A's mount path; non-empty append → this path;
  everything else → the general path.

## Dependencies & Integrations (workflow-step applicability)

- **`/mock`: not applicable, no new public API surface.** The change is a private
  branch inside `reconcileList` (optionally a private helper); no exported
  function, type, or value is added or changed. Recorded skip.
- **`/type-tests`: not applicable, no type-level surface.** `reconcileList`'s
  signature is unchanged; no new generics, constraints, or inference. Recorded
  skip. (Canonical: `type-tests: not applicable, reconcileList signature
unchanged; internal-only optimization with no new type surface`.)
- **`/unit-test`: applies, mostly as equivalence guards plus one path-selection
  guard.** AP1–AP6 are behavior-preserving equivalence guards: they are already
  true under the general path, so they cannot fail before implementation, but a
  broken append detection (a false positive on a reorder, or a mishandled
  prefix/tail boundary) would fail them, and `list.test.ts`'s existing KR/SC suite
  must stay green. Crucially, the append fast path is **DOM-op-identical** to the
  general path (for a suffix append the general LIS keeps the whole prefix and
  inserts only the tail), so no equivalence test can detect the optimization
  being removed. The dedicated **insertion-signature** guard closes that gap: the
  fast path inserts every tail range before the single region end marker (one
  distinct anchor), whereas the general path anchors each new item to the next
  (one anchor per item). Asserting a single distinct anchor is a genuine red→green
  signal that fails if the fast path is disabled, and runs at both the node level
  (`list-append-fast-path.test.ts`) and the browser level (AP7).
- **`/e2e`: applies.** Extend `perf-list-backlog.browser.test.ts` (or add a
  sibling guard) with the AP7 append-cost bound.
- **`/document`: applies.** Add a brief note to `list.specs.md` that a
  behavior-preserving monotonic-append fast path exists. No public-API docs
  change (nothing user-facing changed).

## Expected Behavior & Edge Cases

- Append of a single key, and of many keys at once (one conflated snapshot that
  grew by K): both take the fast path.
- Append onto a list of size 1: `prev.order.length === 1 > 0`, prefix `[x]`
  compared, tail inserted. Handled.
- A snapshot equal to `prev.order` (no growth): `keys.length === prev.order.length`
  fails condition 2 → general path (a pure reuse/reorder; correct there).
- A "tail" key that reuses a prefix key: caught as a duplicate by `projectKeys`
  (AP5), which runs before the branch; never reaches the fast-path body.
- Reorder or mid-insert with the same length or growth but a changed prefix:
  condition 3 fails → general path (AP4).
- Source/reconcile failures during a tail render route to the nearest
  `BoundaryContext` exactly as today (ER1), since the branch runs inside the same
  cell commit; a render failure inserts nothing (all tail renders precede any
  insertion, as in the general path).
