# Suspense Boundary — Client Specification

## Overview

The suspense boundary coordinates a shared loading state across multiple async
children. While any child function component inside the boundary is still pending
(has not emitted its first value), the boundary shows a `fallback` Renderable in the
DOM. When **all** pending children have settled — emitted at least one value — the
boundary performs a single atomic DOM swap: the fallback is removed and all resolved
children are inserted in its place.

The boundary is constructed with `Boundary.suspend(props, children)`, exported from
`@weftui/core`. The rendering implementation lives in `@weftui/dom`. The
boundary is recognised by the renderer via its `SUSPENSE_BOUNDARY` symbol type tag
(`type === SUSPENSE_BOUNDARY`).

## Purpose

Eliminate the per-component `Stream.concat(loading, data)` boilerplate and provide
a single, shared fallback for sibling async subtrees. Mirrors the subtree-coordinated
Suspense model from SolidJS and React.

## Acceptance Criteria

### AC1: Synchronous children — no fallback rendered

- **Given** a `Boundary.suspend({}, children)` whose `children` are all synchronous
  Renderables (no function component returning `Effect` or `Stream`)
- **When** mounted
- **Then**:
  - The fallback is never inserted into the DOM
  - Children are rendered and inserted directly, without suspense comment markers
  - No background swap fiber is forked

### AC2: Single async child — fallback shown, then swap

- **Given** a `Boundary.suspend({ fallback: F }, [C])` containing one function
  component `C` that returns `Effect<Renderable>` or `Stream<Renderable>`
- **When** mounted
- **Then**:
  - Fallback `F` is inserted into the DOM between `<!-- suspense-start-N -->` and
    `<!-- suspense-end-N -->` comment markers
  - While `C`'s Effect/Stream has not emitted: the fallback is visible, `C`'s
    resolved DOM is not present
  - After `C` emits its first value: fallback and comment markers are removed, `C`'s
    resolved children are inserted at the boundary's position
  - Subsequent emissions from any stream within `C`'s resolved subtree continue to
    update via the normal reactive stream-child mechanism

### AC3: Multiple async siblings — shared fallback, single swap

- **Given** a `Boundary.suspend({ fallback: F }, children)` containing N ≥ 2 async sibling components
- **When** mounted
- **Then**:
  - A single fallback `F` is shown while **any** sibling is still pending
  - The swap does not occur until **all** siblings have settled
  - The swap is atomic: all resolved children appear simultaneously
  - A faster sibling settling does not cause a partial or premature swap

### AC4: Nested `Boundary.suspend` — independent boundaries

- **Given** an outer `Boundary.suspend({ fallback: Outer }, [...])` containing an inner
  `Boundary.suspend({ fallback: Inner }, [...])`, each with their own async children
- **When** mounted
- **Then**:
  - Inner async children register with the **inner** boundary only (the inner
    `Boundary.suspend` overrides the outer's `SuspenseContext` for its subtree)
  - The inner boundary resolves independently of the outer
  - The outer boundary's fallback is driven only by its own direct async children
  - Resolving the inner boundary does not affect the outer boundary's pending count

### AC5: Fallback renders nothing while pending

- **Given** `Boundary.suspend({ fallback: null }, children)` (or any falsy `Renderable` fallback)
- **When** mounted with pending async children
- **Then**:
  - The DOM contains only the `<!-- suspense-start-N -->` and
    `<!-- suspense-end-N -->` markers while pending — no visible content
  - The swap still occurs correctly when all children settle

### AC6: Function component returning `Effect<Renderable>` triggers suspension

- **Given** a function component `C = () => Effect.gen(function* () { … })` rendered
  inside a `Boundary.suspend` boundary
- **When** the renderer calls `renderComponent(C, props)`
- **Then**:
  - `SuspenseContext.register` is called before the Effect is forked
  - `SuspenseContext.settle` is called exactly once, after the Effect's first
    emission is **committed** to the DOM _(amended by loom.specs.md LM15: the
    settle hook rides the region cell's first successful commit)_
  - All subsequent emissions from the same component do not call `settle` again

### AC7: Function component returning `Stream<Renderable>` triggers suspension

- **Given** a function component `C = () => someStream` rendered inside a `Boundary.suspend`
- **When** the renderer processes the stream
- **Then**:
  - `SuspenseContext.register` is called before the stream is subscribed
  - `SuspenseContext.settle` is called exactly once, when the stream's **first**
    value is committed _(amended by loom.specs.md LM15)_
  - _(amended by loom.specs.md LM15)_ A stream that **completes without ever
    emitting** (e.g. `Stream.empty`) now settles via the silent-exit route: the
    fallback resolves instead of hanging. A stream that never emits **and**
    never completes still leaves the fallback shown indefinitely (expected;
    timeouts are user-land concerns). A region discarded before its first
    commit also settles.

### AC8: Non-component reactive values do not trigger suspension

- **Given** a `Boundary.suspend` subtree that contains reactive values as **props** or
  as **inline stream children** within an element (e.g. `<div>{count.changes}</div>`,
  `<div class={classStream}>`)
- **When** rendered
- **Then**:
  - These reactive values do **not** call `SuspenseContext.register` or `settle`
  - The boundary may resolve while these reactive regions have not yet emitted their
    first value — they update via the normal stream-child mechanism post-swap
  - Only function components returning `Effect` or `Stream` participate in suspension

### AC9: Scope close while pending — clean interruption

- **Given** a `Boundary.suspend` with pending children
- **When** `unmount()` is called (the render scope is closed)
- **Then**:
  - The swap fiber (forked in the render scope via `Effect.forkIn`) is interrupted
    automatically as part of scope closure
  - All child stream subscriptions (also forked in scope) are interrupted
  - No error is thrown or logged as a result of the interruption
  - The fallback DOM nodes are left in place (DOM cleanup is the caller's
    responsibility, consistent with the rest of the renderer)

### AC10: Sentinel prevents premature settlement

- **Given** a `Boundary.suspend` with multiple async children where some resolve very
  quickly (within the same fiber scheduling round as the render)
- **When** mounted
- **Then**:
  - The `pendingCount` ref is initialised to `1` (the "render in progress" sentinel)
  - The sentinel is decremented **after** all children have been walked and
    registered, not before
  - A fast-resolving child cannot cause the boundary to swap before all siblings
    have had a chance to register

## Technical Requirements

### `SuspenseContext` service

Provided by each `Boundary.suspend` boundary via `Effect.provideService` to its
children's render. Inner `Boundary.suspend` boundaries shadow the outer service for
their subtree.

```typescript
class SuspenseContext extends Context.Service<
  SuspenseContext,
  {
    readonly register: Effect.Effect<void>; // increment pending count
    readonly settle: Effect.Effect<void>; // decrement; triggers swap at 0
  }
>()("SuspenseContext") {}
```

### Sentinel pattern

`pendingRef` starts at `1`. The sentinel is released (decremented) after
`renderChildren` completes, ensuring no child can trigger `allSettled` while the
render loop is still registering siblings.

### Settle-on-first-emission wrapper

The stream passed to `handleStreamChild` is wrapped so that `settle` is called for
the first element only:

```typescript
Stream.zipWithIndex(stream).pipe(
  Stream.flatMap(([value, index]) =>
    index === 0 ? Stream.fromEffect(Effect.as(suspenseCtx.settle, value)) : Stream.make(value),
  ),
);
```

### Comment marker vocabulary

Defined in `markers.ts` alongside the existing `stream-start-N` vocabulary:

```
<!-- suspense-start-N -->   opening boundary marker
<!-- suspense-end-N -->     closing boundary marker
```

IDs are drawn from the same monotonic counter as stream region IDs (`streamIdCounter`
on `RenderContext`) — they only need to be unique within a single render tree.

### DOM swap

When `allSettled` fires in the swap fiber:

1. Walk siblings between `startMarker` and `endMarker` and remove them
2. Insert all resolved `childNodes` before `endMarker`
3. Remove `startMarker` and `endMarker` (they serve no purpose post-swap)

## Constraints

- Error handling is out of scope here; the failure boundaries (`Boundary.catch`,
  `Boundary.catchTag`, etc.) cover failures in child Effects
- No timeout mechanism — hanging Effects keep the fallback visible indefinitely
- `Boundary.suspend` is not a valid SSR streaming component by itself; see
  `suspense-ssr.specs.md` for server behaviour
