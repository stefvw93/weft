# List.each mount against empty state

> Behavior invariants live in [`./list.specs.md`](./list.specs.md) (MR / KR / SC / ID / ER).
> This spec covers mounting against empty previous state, plus failed-render cleanup.
> Tracking issue: [#178](https://github.com/stefvw93/weft/issues/178). Follow-up to the
> Loom render scheduler ([`./loom.specs.md`](./loom.specs.md), PR #170 / v0.31.0).

> Requirements were locked by the delegated task brief (no interactive Q&A):
> internal change, no new public API, identical post-mount state, permanent
> perf guard, docs guidance. Design decisions are recorded under Technical
> Requirements below.

## Overview & Purpose

A `List.each` emission with no previous state has nothing to reuse, drop, or move.
`reconcileList` skips the work that only matters for updates and shares one pipeline
for everything else.

Issue #178 attributed slow mounts to keyed bookkeeping. Measurement disproved that.
For 10,000 rows in Chromium, the median of ten in-page mounts was:

- Plain array children: about 445 ms.
- `List.each`, general path: about 925 ms.
- `List.each`, original separate bulk-mount path: about 925 ms, no difference.
- `List.each`, this change: about 900 ms, within a few percent.

Most of that time is idle. Effect's scheduler yields every 2048 operations through
`setTimeout(0)`, which browsers clamp to about 4 ms once nested. A `List.each` mount
yielded about 160 times, and waited roughly 660 ms. With a `MessageChannel` yield
instead, the mounts took about 58 ms (plain) and 200 ms (`List.each`). This change
does not address yielding: [`./scheduler.specs.md`](./scheduler.specs.md) does, with
that `MessageChannel` yield for every app fiber.

## Acceptance Criteria

- [x] **FE1 (DOM parity):** For a first emission `[a, b, c]`, the mounted DOM is: `stream-start`, then per
      item its `list-item-start`, rendered nodes, `list-item-end`, then
      `stream-end`, in item order (MR1). `render` runs exactly once per key under
      its own forked per-item scope (MR2).
- [x] **FE2 (record-state parity → later reconciles unchanged):** After a
      mount of `[a, b, c]`, a subsequent emission reconciles exactly as
      it does today: `[c, a, d]` reuses `a`/`c` nodes without re-rendering (KR3),
      inserts `d` once (KR2), removes `b`'s range and closes its scope (KR4), and
      moves via LIS (KR5). This proves the mount built the same
      `HashMap<K, ItemRecord>` identity map and `order`.
- [x] **FE3 (duplicate guard preserved):** A first emission with two items that
      project to `Equal` keys fails with the same descriptive `RenderError`
      (naming the duplicate key) before any DOM is touched (KR1). The guard
      uses Effect `Equal`/`Hash`, not native reference identity.
- [x] **FE4 (empty first emission):** A first emission of `[]` mounts only the
      `stream-start`/`stream-end` markers (no item nodes); a later non-empty
      emission inserts items between them (MR3).
- [x] **FE5 (subscription preservation across the boundary):** An item whose
      `render` starts a self-incrementing per-item stream keeps running when the
      list is later reordered or has items inserted/removed (SC1): mounts
      fork persistent per-item scopes.
- [x] **FE6 (empty→refill is a mount):** `[a, b] → [] → [c, d]` renders
      `c`, `d` correctly (fresh nodes inserted before the end marker), confirming
      the trigger is empty previous state, not a one-shot first-emission flag.
- [x] **FE7 (scale guard, permanent):** A first render of 10,000 static rows has
      10,000 `list-item-start` markers in order and stays within a loose multiple
      of plain array children (`perf-list-mount.browser.test.ts`). It guards
      against superlinear growth, not against small bookkeeping changes.
- [x] **FE8 (failed render leaks nothing):** When an item's render fails or
      throws, every item scope created by that emission closes and no DOM is
      inserted. Retained items are untouched. Applies to mounts and updates.

## Technical Requirements

- **One pipeline:** no separate mount function. `prev.order.length === 0` skips
  reuse lookups, the drop walk, and LIS.
- **Trigger:** empty previous state. This covers the first emission, empty refills,
  and `hydrateList`'s HY2 divergence recovery. HY1 adoption does not use
  `reconcileList`.
- **Equal semantics:** duplicate and drop checks use `MutableHashSet`, which keeps
  Effect `Equal`/`Hash` semantics (ID1, KR1). The identity map is built with
  `HashMap.mutate`, since `HashMap.fromIterable` path-copies every insert.
- **Failure cleanup:** `renderItem` records each forked scope before rendering.
  `reconcileList` closes them from one handler per emission, not one per item: a
  per-item handler made a 10k mount about 10% slower.

## Dependencies & Integrations (workflow-step applicability)

- `/mock`: not applicable, no new public API surface.
- `/type-tests`: not applicable, `reconcileList` signature unchanged.
- `/unit-test`: applies. FE8 is red before implementation. FE1-FE6 are equivalence
  guards and were already green.
- `/e2e`: applies (FE7).
- `/document`: applies. `docs/how-to/render-keyed-lists.md` and `list.specs.md`.

## Expected Behavior & Edge Cases

- Empty `items` against empty state: empty `ListState`, no DOM beyond region
  markers (MR3).
- Empty previous state reached via prior removal (`empty → refill`): treated as a mount,
  correct fresh insert (FE6).
- Duplicate keys: `RenderError`, no partial DOM (FE3).
- Non-empty previous state: the drop and move passes run as before (KR2-KR5).
- Source/reconcile failures on the first emission route to the nearest
  `BoundaryContext` exactly as today (ER1/ER2), since mounts run inside the
  same cell commit.
