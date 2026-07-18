# Diffing Model — Spec & Plan

> Companion checklist: [`diffing-model.checklist.md`](./diffing-model.checklist.md)
> Branch: `perf/diffing-model`

## Context

Weft has no diffing today. Every reactive **child region** is destroyed and
rebuilt on each stream emission: `handleStreamChild` → on each value closes the
entire content scope (killing all nested subscription fibers) → `updateStreamChild`
→ `removeNodesBetweenMarkers` + `renderNode` + re-insert (`packages/dom/src/client/render.ts:938`,
`:1014`, `:1050`). Reactive _props/attributes/styles/events_ already patch in place
(`render.ts:126-411`); only child content rebuilds wholesale.

Consequences: lost DOM state on every update (focus, uncontrolled values, scroll,
in-flight transitions), no element identity for animation, restarted per-item
subscriptions (the Example 6 counters reset), and cost that scales with
list-size × update-frequency.

This change introduces a diffing model in two parts:

- **Part A — scalar same-type patching** in the generic reactive region: when an
  emission has the same shape as what's already there, patch in place instead of
  rebuild.
- **Part B — `List.each`, a keyed list combinator** that owns per-item identity and
  **per-item scopes that survive parent re-emits**, so a persisted key keeps both its
  DOM nodes _and_ its running subscriptions.

Hydration is covered at the spec level; its implementation is phased after the
client path.

### Decisions (confirmed)

1. Reconciliation is **opt-in via an explicit `List.each` combinator** (not an
   implicit diff of arbitrary emitted arrays). Fits "components run once / fine-grained
   / no VDOM" and lets the combinator own item scopes and identity.
2. A persisted key preserves **DOM nodes + running subscription fibers**.
3. **Scalar same-type patching is in scope** (text→text, same-tag element reuse).
4. **Hydration is specified now, implemented in a later phase.**
5. **One unified `by` knob** (React/Vue `key` pragmatism) instead of separate
   identity/index variants. `by: t => t.id` is identity; `by: (_, i) => i` is positional.
6. **Default identity uses Effect `Equal`/`Hash`** (zero-config for `Data` items;
   reference identity for plain objects). `by` is the performance lever, not a
   correctness fix.

### Critical semantic to document

Because components run **once**, a persisted key's `render` is **never re-invoked**.
Reconciliation only decides DOM reuse/move/insert/remove — it never refreshes a kept
node's _content_; that is the job of streams threaded inside the item. So:

- `by: t => t.id` (identity) is the natural mode: same entity → keep node + live subscriptions.
- `by: (_, i) => i` (index) reuses nodes positionally and will show **stale content on
  reorder/replace** unless the item is reactive — the classic index-key footgun, sharper
  here than in React (no re-render to refresh props). This must be warned in the spec.

### Non-goals (v1)

A separate positional `List.index` variant (subsumed by `by`), animation/FLIP hooks.
Note as future work. Move algorithm is LIS-based minimal moves.

---

## Part A — Scalar same-type patching

Rework `updateStreamChild` (`render.ts:1014`) from unconditional teardown into a
reconcile against the nodes currently between the markers. The new value's shape is
read from its **descriptor** (`getElementDescriptor`) / primitive type _before_
rendering, so we patch instead of creating throwaway nodes + subscriptions.

- **SP1 — text→text**: region currently holds exactly one `Text` node and the new
  value is `string`/`number`/`bigint`. **Then** set `.data` in place only if it
  differs; node identity preserved; no scope rotation (no fibers involved).
- **SP2 — nothing changed**: identical text value → no DOM mutation at all.
- **SP3 — same-tag element reuse**: region holds one `Element`, the new value's
  descriptor is `type === <sameTag>` (string tag). **Then** reuse the element node,
  close the prior content scope, re-apply props under the fresh scope
  (`setElementProps` — re-subscribes reactive props), and recurse this patch on its
  children by position.
- **SP4 — fallback**: any other shape change (text↔element, different tag, multi-node,
  fragment/array) → current behavior: close scope, `removeNodesBetweenMarkers`,
  `renderNode`, insert.

Dominant real-world win is SP1 (reactive text). SP3 is the secondary structural win.
Update `dom.specs.md` AC20 ("Text nodes replaced entirely") to reflect SP1. ✅ done.

---

## Part B — `List.each` keyed list combinator

### API (core)

New file `packages/core/src/combinator/list.ts`, mirroring `fragment.ts` + `element.ts`
(uses `elementNode`; detected via `getElementDescriptor` like `h.fragment`):

```ts
export const LIST = Symbol("@weftui/core/list");

export namespace List {
  export function each<T, E, R, CE, CR, K = T>(
    options: {
      readonly of: Source.Source<Iterable<T>, E, R>;
      readonly by?: (item: T, index: number) => K;
    },
    render: (item: T, index: number) => Renderable, // typically Node<CE, CR>
  ): Node<E | CE, R | CR>;
}
```

- `of: Source.Source<Iterable<T>, E, R>` — accepts a static `Iterable<T>` (Array, Map,
  Set, …), `Effect`, `Stream`, or `Subscribable`. Normalized via `Source.toSubscribable`
  (`packages/core/src/source/source.ts:51`); the reconciler subscribes to `.changes`.
  Each emission's `Iterable` is materialized to an array to fix order.
- `by?` projects an item to a key compared via Effect `Equal`. Omitted → identity via
  `Equal`/`Hash` on the item itself.
- `render` runs **once per key** (item passed as a static value; per-item reactivity is
  threaded by the user as streams inside `render`).
- Returns `elementNode({ type: LIST, props: { of, by, render } })`.
- E/R propagate from `of` (Source `E`/`R`) and from `render`'s returned `Node`
  (`CE`/`CR`), mirroring the function-children extraction in `combinator/types.ts` /
  `component.ts`. Export `List`, `LIST` from `combinator/index.ts`.

### Renderer (dom)

Special-case `descriptor.type === LIST` in `renderNode` (`render.ts:689` block, beside
`FRAGMENT`/`SUSPENSE_BOUNDARY`/`FAILURE_BOUNDARY`) → `renderList`. This path does **not**
use `handleStreamChild`'s close-all scope rotation; it keeps persistent reconciler state
across emissions:

- Region bracketed by the existing stream markers (`streamStartText`/`streamEndText`).
- Each item bracketed by **per-item markers** — add `listItemStartText(id)/listItemEndText(id)`
  to `shared.ts`/`utilities.ts` (same `MARKER_PATTERN` family, ids from
  `RenderContext.streamIdCounter`), so multi-node items move as a unit and the server can
  emit adoptable boundaries.
- Reconciler state keyed via Effect **`HashMap<K, ItemRecord>`** (hash-based, so default
  `Equal`/`Hash` identity is O(n), not O(n²); `by` lowers the per-item hash/eq constant by
  projecting to a cheap key). `ItemRecord = { key; scope: Scope.CloseableScope; startMarker;
endMarker; nodes }`; each `scope = Scope.fork(regionScope)` **persists across emissions**.

Reconcile per `.changes` emission (`reconcileList`), Vue 3 / Solid `<For>`-style:

- **KR1 — duplicate keys**: two items hash-equal in one emission → fail `RenderError`
  (descriptive context).
- **KR2 — insert**: new key → `render(item, index)` under a fresh per-key forked scope,
  bracket with item markers, insert at the correct position.
- **KR3 — reuse**: persisted key → keep DOM nodes and scope untouched (subscriptions keep
  running; `render` is **not** re-invoked).
- **KR4 — remove**: dropped key → close its scope (cancels its subscriptions) + remove its
  node range.
- **KR5 — move**: order changed → longest-increasing-subsequence over retained keys'
  previous indices; `insertBefore` only items **not** in the LIS (minimal DOM moves).
- **SC1 — subscription preservation**: a persisted key's per-item streams/timers continue
  without restart across re-emits (verified by an Example-6-style counter surviving a reorder).
- **SC2 — focus/state preservation**: reorder/insert never recreates retained items, so
  focus, uncontrolled input values, and scroll survive.

### Hydration (spec now, impl phased)

- **HY1 — server markers**: the hydratable server renderer emits the `List` region and
  per-item markers identically to the client, so the DOM is adoptable.
- **HY2 — adopt**: a client `hydrateList` walks the region, parses per-item markers, builds
  the key→record `HashMap` from server DOM (adopting each item's nodes, forking a scope per
  item), then subscribes to `of`. The **first** emission reconciles against adopted records —
  flash-free when keys and order match (mirrors `hydrateFirstEmission`, `render.ts:1468`);
  later emissions reconcile normally. Divergence → patch + `console.error`, as today.

---

## Files

**Core**

- `packages/core/src/combinator/list.ts` _(new)_ — `LIST` symbol, `List.each`, types.
- `packages/core/src/combinator/index.ts` — export `List`, `LIST`.
- `packages/core/src/combinator/list.specs.md` _(new)_ — API + E/R typing + identity ACs.
- `packages/core/src/combinator/__type-tests__/list.tst.ts` _(new)_ — E/R propagation, `by`/`render` typing.

**DOM (client)**

- `packages/dom/src/client/render.ts` — Part A patching in `updateStreamChild`; `renderList`
  - `reconcileList` + `ItemRecord`; `LIST` case in `renderNode`; `hydrateList` (phased) in
    `hydrateNode`.
- `packages/dom/src/shared.ts` + `packages/dom/src/utilities.ts` — `listItemStartText`/
  `listItemEndText` + parse, reusing the marker counter.
- `packages/dom/src/client/list.specs.md` _(new)_ — reconciliation ACs (KR/SC/HY) + render-once warning.
- `packages/dom/src/client/dom.specs.md` — amend AC20 for SP1. ✅ done.

**DOM (server, phased with hydration)**

- `packages/dom/src/server/*` — emit `LIST` region + per-item markers in the hydratable renderer.

**Tests** (JSDOM + `Effect.runPromise` + `waitForStream`, per `dom.test.ts`)

- `packages/dom/src/client/list.test.ts` _(new)_ — insert/remove/move/reuse, duplicate keys,
  default `Equal` identity vs `by`, subscription preservation (counter survives reorder), focus preservation.
- `packages/dom/src/client/dom.test.ts` — SP1/SP3 patching tests.

**Playground**

- `playground/recipes/keyed-list/keyed-list.ts` + `keyed-list.readme.md` _(new)_ — a reorderable
  list with focused inputs and running per-item counters that survive reorder.

---

## Phasing

1. **Part A** (scalar patching) — self-contained, immediate win, no API change.
2. **`List.each` core API + types** — combinator, exports, type tests.
3. **Client `renderList` + `reconcileList`** — mount + update, per-key scopes, LIS moves.
4. **Hydration** — server markers + `hydrateList`.

---

## Verification

- `vp test` — list reconciliation, scalar patching, subscription & focus preservation.
- `vp run check` — `List.each` E/R propagation type tests.
- `vp check --fix` — format/lint/typecheck.
- Manual: run the `keyed-list` playground recipe; confirm (a) reordering keeps focus in an
  edited input, (b) per-item counters keep counting through a reorder (no reset), (c) only
  moved rows change position (inspect via marker/node identity).

---

## Spec workflow note

Per `CLAUDE.md`, the two new `*.specs.md` files (full Overview / Purpose / Acceptance Criteria
in Given-When-Then, matching `dom.specs.md`) are authored and reviewed **before** implementation,
and mocks (`declare` `List.each` signature, `ItemRecord`, `reconcileList`) precede real code. The
AC stubs above (SP/KR/SC/HY) seed those spec files. The render-once / index-key footgun must be an
explicit warning in `list.specs.md` and the recipe README.
