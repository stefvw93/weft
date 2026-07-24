# Client List Reconciliation — `renderList` / `reconcileList`

> Core combinator spec: [`../../../core/src/combinator/list.specs.md`](../../../core/src/combinator/list.specs.md)
> Plan: [`./diffing-model.plan.md`](./diffing-model.plan.md)

## Overview

The client renderer special-cases `List.each` nodes (descriptor `type === LIST`) into
a **keyed reactive region** that reconciles its children across emissions instead of
rebuilding them wholesale. This is the structural counterpart to Part A's scalar
patching: where Part A patches a single same-shaped child in place, a `List` region
keeps a **per-item identity map** so that, across re-emits, each surviving key keeps its
DOM nodes **and** its running subscription fibers, while only added/removed/moved items
touch the DOM.

This file specs the **client** behaviour (Part B2: mount + update) and the **hydration
contract** (Part B3: spec now, implement later). The combinator surface, item/`E`/`R`
typing, and the `by`/render-once semantics are specified in the core spec above.

## Background — how a `List` region differs from a generic stream child

A generic reactive child (`handleStreamChild` → `updateStreamChild`) rotates a single
content scope: on each emission it (optionally patches, else) closes the prior scope —
cancelling every nested subscription fiber — and rebuilds. A `List` region does **not**
use that close-all rotation. Instead:

- The region is bracketed by the existing reactive-region markers
  (`streamStartText(id)` / `streamEndText(id)`), located on each emission exactly like
  a stream child.
- Each item is bracketed by **per-item markers** `listItemStartText(itemId)` /
  `listItemEndText(itemId)` (new, same `MARKER_PATTERN` family, ids from
  `RenderContext.streamIdCounter`) so a multi-node item moves and is removed as a unit.
- The region holds a persistent **`HashMap<K, ItemRecord>`** across emissions. Each
  `ItemRecord` owns a `scope = Scope.fork(regionScope)` that **persists** until the item
  is removed or the region is torn down — never rotated per emission. This is what keeps
  per-item subscriptions alive.

## Data model

```ts
interface ItemRecord {
  /** The reconciliation key (compared via Effect Equal / hashed via Hash). */
  readonly key: unknown;
  /** Per-item scope, forked from the region scope; persists across emissions. */
  readonly scope: Scope.CloseableScope;
  /** This item's opening comment marker (` list-item-start-<id> `). */
  readonly startMarker: Comment;
  /** This item's closing comment marker (` list-item-end-<id> `). */
  readonly endMarker: Comment;
  /** The DOM nodes rendered for this item, between (exclusive) its markers. */
  readonly nodes: readonly Node[];
}
```

Region state: `HashMap<K, ItemRecord>` keyed by the projected key (`by`), or the item
itself under `Equal`/`Hash` when `by` is omitted.

## Acceptance criteria

Format: Given / When / Then. `waitForStream` and `Effect.runPromise` drive async
assertions, per `dom.test.ts`.

### Mount (MR)

- **MR1 — region + item markers.** Given a `List.each` whose `of` first emits
  `[a, b, c]`, When the region mounts, Then the DOM contains, in order: the
  `stream-start` marker, then for each item its `list-item-start` marker, the item's
  rendered nodes, and its `list-item-end` marker, then the `stream-end` marker.
- **MR2 — render once per key.** Given items `[a, b]`, When the region mounts, Then
  `render` is invoked exactly once per key (twice total), each under its own forked
  per-item scope.
- **MR3 — empty.** Given `of` emits `[]`, When the region mounts, Then only the
  `stream-start`/`stream-end` markers are present (no item nodes), and a later non-empty
  emission inserts items between them.

### Keyed reconciliation (KR)

- **KR1 — duplicate keys.** Given an emission containing two items that project to
  `Equal` keys, When reconciled, Then the region fails with a descriptive `RenderError`
  (naming the duplicate key) rather than producing two records for one key.
- **KR2 — insert.** Given current keys `[a, b]` and a new emission `[a, x, b]`, When
  reconciled, Then `render(x)` runs once under a fresh forked scope and `x`'s nodes are
  inserted before `b`'s `list-item-start` marker; `a` and `b` are untouched.
- **KR3 — reuse.** Given current keys `[a, b]` and a new emission with the same keys
  (any order), When reconciled, Then no `render` is re-invoked and no item scope is
  closed (subscriptions keep running); only DOM position may change (see KR5).
- **KR4 — remove.** Given current keys `[a, b, c]` and a new emission `[a, c]`, When
  reconciled, Then `b`'s scope is closed (its subscription fibers are interrupted) and
  the DOM nodes from `b`'s `list-item-start` through `list-item-end` (inclusive) are
  removed; `a` and `c` are untouched.
- **KR5 — minimal moves (LIS).** Given a reorder from `[a, b, c, d]` to `[a, c, b, d]`,
  When reconciled, Then the renderer computes a longest-increasing-subsequence over the
  retained keys' previous indices and issues `insertBefore` only for the items **not**
  in the LIS (here: only `b` or only `c` moves, not both). Items in the LIS are not
  re-inserted.
- **KR6 — order materialization.** Given `of` emits a non-array `Iterable` (e.g. a
  `Set` or `Map`), When reconciled, Then the iterable is materialized to an array first
  so iteration order is fixed for that emission.

### Scope & state preservation (SC)

- **SC1 — subscription preservation.** Given an item whose `render` started a
  self-incrementing per-item counter stream (Example-6 style), When the list is
  reordered or other items are inserted/removed, Then that item's counter continues
  without resetting (its scope was never closed, its fiber never restarted).
- **SC2 — focus / DOM-state preservation.** Given a retained item containing a focused
  `<input>` with an uncontrolled value, When the list is reordered, Then focus and the
  input value survive (the element node is moved, not recreated).
- **SC3 — teardown.** Given a mounted region, When the enclosing render scope closes,
  Then every `ItemRecord` scope is closed (the region scope is their parent) and all
  item subscriptions are interrupted.

### Identity (ID)

- **ID1 — default identity.** Given `by` omitted and items that are Effect `Data`
  values, When two emissions carry structurally equal items, Then they reconcile as the
  same key (structural `Equal`); plain (non-`Data`) objects reconcile by reference.
- **ID2 — `by` projection.** Given `by: t => t.id`, When two emissions carry items with
  the same `id` but different other fields, Then the node is reused (same key) and its
  content is **not** refreshed by reconciliation (render-once) — only streams inside the
  item update it.
- **ID3 — index key footgun (warning).** Given `by: (_, i) => i`, When items are
  reordered or replaced, Then nodes are reused positionally and show stale content
  unless internally reactive. This is a documented footgun, not a bug; the recipe README
  and the core spec warn against it. (No automated AC — documentation requirement.)

### Errors (ER)

- **ER1 — render failure.** Given `render(item)` fails (its node's `E`), When that item
  is first inserted, Then the failure propagates on the region's error channel and is
  catchable by an enclosing `Boundary` (consistent with other reactive children).
- **ER2 — source failure.** Given `of` fails after the first emission, Then the region
  surfaces the failure like any stream child (no partial reconcile is committed for the
  failed emission).

### Hydration contract (HY) — Part B3

- **HY1 — server markers.** The hydratable server renderer (`renderToStreamHydratable` /
  `renderToStringHydratable`) renders only the **first** emission of `of`, bracketing the
  region with the same `stream-start`/`stream-end` markers and each item with
  `list-item-start`/`-end` markers as the client, so the server DOM is adoptable. Region
  and item ids come from the shared region counter. Plain `renderToString` (non-hydrated)
  emits the items inline with **no** markers.
- **HY2 — adopt + flash-free first emission.** A client `hydrateList` pairs the region's
  `stream-start`/`stream-end` markers, collects the server item ranges positionally
  (`collectAdoptedItems`, depth-aware so nested lists don't terminate an item early), then
  subscribes to `of`. The **first** emission is adopted: its projected keys are paired
  positionally with the server ranges, and each item's `render` output is hydrated against
  its adopted DOM (attaching event handlers / reactive subscriptions, preserving node
  identity — flash-free), building the persistent `HashMap<K, ItemRecord>`. `render` runs
  once per key during hydration (and once on the server), consistent with mount. Later
  emissions reconcile normally via the shared `reconcileList`.
  - **Divergence (recoverable, logged via `console.error`):** if the server item count
    differs from the first emission's count, the region diverged — the adopted DOM is
    discarded and the emission is rendered fresh (`reconcileList` against empty state). If
    a single item's interior diverges, that item's scope is re-forked and it is rendered
    fresh into its preserved marker range (mirrors `hydrateFirstEmission`).

## Markers (shared protocol additions)

Add to `shared.ts` (and parse support to wherever `parseStreamMarker` is consumed):

```ts
/** Opening per-item marker, e.g. " list-item-start-7 ". */
export function listItemStartText(id: number): string;
/** Closing per-item marker, e.g. " list-item-end-7 ". */
export function listItemEndText(id: number): string;

export interface ListItemMarker {
  readonly kind: "start" | "end";
  readonly id: number;
}
/** Recognises a comment as a per-item list marker, or null. */
export function parseListItemMarker(comment: Comment): ListItemMarker | null;
```

IDs are drawn from the same `RenderContext.streamIdCounter` as stream/suspense markers,
keeping them globally unique within one render tree.

## Non-goals (v1)

Animation / FLIP move hooks; a dedicated positional `List.index` variant (subsumed by
`by`); nested-list–specific optimizations beyond what recursion already provides.

## Amendments

_(amended by loom.specs.md LM24)_ The `of` source is consumed via
`Source.changes(of)` directly: the `toSubscribable` hop (SubscriptionRef +
first-value latch + pump fiber per list) is gone. Reconciliation runs as the
region cell's commit on the app's flush fiber, so snapshot bursts conflate to
the newest snapshot (latest-value-wins) instead of reconciling every queued
one. Sequential-snapshot ordering holds by construction: a single pump writes
the cell and a single flush fiber commits it.
