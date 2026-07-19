# Boundary — DOM Renderer Spec

## Overview

The DOM renderer handles failure `Boundary` descriptors (identified by `type === FAILURE_BOUNDARY`) by intercepting rendering-path errors in the subtree and swapping the DOM to a fallback when an error is caught. The renderer adds a `BoundaryContext` service (parallel to `SuspenseContext`) that is provided to children during rendering and receives error reports from stream fibers within the boundary's scope.

Errors are reported via a `Cause<unknown>` so that `catchCause` can access defects, not just typed failures.

---

## Acceptance Criteria

### What is caught

1. **Construction-time errors** — if `renderNode` fails while rendering the boundary's children, the error is caught and handled synchronously before the boundary's comment markers are inserted.
2. **Post-mount stream errors** — if a stream running inside `subscribeToStream` within the boundary's subtree fails, the cause is reported to `BoundaryContext` and the boundary performs a DOM swap to the fallback.
3. **Event handler errors are NOT caught** — event handlers are run via `context.runtime.runFork` in detached fibers outside the render path. They must not be reported to `BoundaryContext`.

### `BoundaryContext` service

4. `BoundaryContext` is an optional `Context.Service` (like `SuspenseContext`) with a single method: `reportError: (cause: Cause.Cause<unknown>) => Effect.Effect<void>`.
5. `BoundaryContext` is provided to children using `Effect.provideService` during `renderBoundary`, so inner boundaries shadow outer ones — children always report to the innermost boundary.
6. Nested boundaries: when the inner boundary's `match` returns `null` (error not handled), the inner boundary calls its parent `BoundaryContext`'s `reportError` with the same cause. A `parent` reference is stored in the boundary service for this purpose.

### `subscribeToStream` modification

7. The stream subscription fiber is forked via `Effect.forkIn` and supervised: a watcher fiber (`Fiber.await` on the subscription fiber, itself forked into the same scope) observes its exit.
8. Before forking, check for `BoundaryContext` via `Effect.serviceOption`. If present, the watcher routes any failure exit to `ctx.reportError(cause)`. If absent, the watcher reports the failure **explicitly** — Effect 4 removed the unhandled-error-log-level `FiberRef`, so nothing is deferred to the runtime: _(amended by weft-app.specs.md WA10)_ the cause is published to the owning app's unhandled-error hub via `RenderContext.reportUnhandled(cause, region)` with the region/prop identifier (e.g. `attribute:<name>`, `child:stream-<id>`, `list:stream-<id>`); with no `WeftApp.errors` subscribers this falls back to `Effect.logError(cause)` annotated with `weft.region`, so both typed failures and defects surface exactly once. Interruption-only causes (unmount teardown) stay silent (`Cause.hasInterruptsOnly` guard).
9. This modification applies only to the subscription fiber — not to the synchronous stream setup path.

### `renderBoundary` — construction-time path

10. `renderBoundary` renders the children inside a fresh child scope forked from `context.scope`. This child scope is the **subtree scope** — it owns all fibers spawned during the subtree's lifetime.
11. If `renderNode` fails during child construction, `renderBoundary` immediately calls `props.match(Cause.fail(error))`:
    - If `match` returns a `Node`: render the fallback and insert it between the boundary's comment markers. The subtree scope is closed. The boundary's output `E` is `never` for that error.
    - If `match` returns `null`: re-raise the error to the parent (propagates out of `renderBoundary` as an Effect failure).
12. If child construction succeeds, the rendered child DOM nodes are inserted between comment markers and the post-mount error fiber is set up (see below).

### `renderBoundary` — post-mount path

13. A `BoundaryContext` service is created with a `Deferred<Cause.Cause<unknown>>` as its error signal. `reportError` completes this Deferred.
14. Children are rendered with this `BoundaryContext` provided via `Effect.provideService`.
15. A recovery fiber is forked into `context.scope` (the enclosing scope, not the subtree scope). It awaits the error Deferred, then:
    a. Closes the subtree scope — cancels all child fibers and prop pumps within the boundary.
    b. Calls `props.match(cause)`:
    - If `match` returns a `Node`: remove all DOM nodes between the boundary markers, render the fallback in a fresh scope, insert it between the markers.
    - If `match` returns `null`: call the parent `BoundaryContext`'s `reportError` with the same cause (propagate to nearest parent boundary). If no parent exists, the cause is surfaced as an **unhandled boundary failure** — _(amended by weft-app.specs.md WA11)_ the recovery fiber publishes it to the app's unhandled-error hub with region `boundary:outermost` (default `Effect.logError` fallback when unsubscribed), so it is observable rather than silently swallowed. Unlike the construction-time path (AC11), this cannot reject the `mount` Effect, which has already resolved by the time a post-mount error occurs; logging is the terminal surfacing mechanism.

> **Sync vs. async surfacing of unhandled errors.** When the outermost boundary cannot handle an error and has no parent:
>
> - **Construction-time (synchronous, AC11):** the error occurs before `mount` resolves, so it re-raises out of `renderBoundary` as an Effect failure and **rejects** the `mount` Effect.
> - **Post-mount (asynchronous stream failure, AC15):** the error occurs after `mount` has resolved, so it is **published to the app's unhandled-error hub** as `boundary:outermost` (logged via the default fallback when the hub has no subscribers).
>
> Both apply equally whether the error arose synchronously at construction or asynchronously while consuming a stream — the renderer routes stream-fiber failures to the nearest `BoundaryContext` (AC7–9), so a boundary catches async stream errors in its subtree exactly as it catches construction-time errors.

### DOM structure

16. A boundary wraps its content in comment markers: `<!-- boundary-start-N -->` … `<!-- boundary-end-N -->`, where `N` is a monotonically increasing boundary ID (separate counter from stream IDs).
17. On construction success: child nodes are placed between the markers.
18. On error (construction or post-mount): child nodes between the markers are removed and fallback nodes are inserted.
19. Comment markers remain in the DOM after a swap — the fallback occupies the same bracketed region.

### Shared abstraction with `Suspense`

20. The DOM-swap primitive (`removeNodesBetweenMarkers` + insert before end marker) is already shared. No new shared abstraction is required there.
21. Boundary introduces a new shared pattern: **scoped subtree rendering** — fork a child scope, render children into it, return the scope handle for later cleanup. Extract a `renderInChildScope` helper used by both `renderSuspenseBoundary` and `renderBoundary` if the duplication is material; otherwise leave it inline.

### Server rendering — `renderToString` / `renderToStream` (non-hydratable)

22. The server attempts to render the boundary's children as HTML. If rendering fails, it calls `props.match(Cause.fail(error))`:
    - If `match` returns a `Node`: render the fallback HTML inline. No comment markers are emitted — same as how Suspense with `ctx = null` emits its fallback directly.
    - If `match` returns `null`: propagate the error as a `Stream` failure to the caller.
23. No boundary markers, no patch scripts, no error serialization — non-hydratable output has no client-side lifecycle.

### Server rendering — `renderToStreamHydratable` (hydratable)

24. On success (children render without error): boundary is **transparent** — children are rendered directly with no markers. There is nothing for the client boundary to recover from.
25. On error — `match` returns a `Node`:
    a. Emit `<!-- boundary-start-N errored -->` (the `errored` attribute distinguishes this from a successful boundary).
    b. Emit an inline `<script>` that stores the serialized error in `window.__efb[N]`. Serialization is best-effort JSON; if the error is not JSON-serializable, the slot is set to `null`.
    c. Emit the fallback HTML.
    d. Emit `<!-- boundary-end-N -->`.
26. On error — `match` returns `null`: propagate the error as a `Stream` failure (same as non-hydratable).
27. A monotonic boundary ID counter (separate from stream and suspense ID counters) is used for `N`.

### Hydration

28. During `hydrate`, the hydrator inspects the comment marker when it encounters a `Boundary` descriptor in the component tree:
    - **No marker present** (boundary rendered without error on server): the boundary is transparent — children are hydrated directly against the existing DOM. The client boundary is then set up normally for future post-mount errors.
    - **`errored` marker present**: the hydrator must NOT attempt to hydrate the success children against the fallback DOM. Instead:
      a. Read the serialized error from `window.__efb[N]` (may be `null` if serialization failed).
      b. Reconstruct a `Cause` from the serialized value (a typed failure if data is present, a `Cause.empty` if `null`).
      c. Call `props.match(reconstructedCause)` to obtain the fallback `Node`.
      d. Hydrate the fallback `Node` against the DOM between the boundary markers.
      e. Set up the client boundary normally (recovery fiber, `BoundaryContext`) so future post-mount errors are handled.
29. **Constraint**: for accurate hydration of error-displaying fallbacks (e.g. `(e) => h.div({}, e.message)`), errors should be JSON-serializable. Non-serializable errors produce a `null` cause on the client, which may result in a hydration mismatch for fallbacks that render error details — a console warning should be emitted in this case.

### Hydration — `Boundary.rpc` typed-failure replay

> Distinct from AC24–29 above (which concern a failure boundary catching errors
> from its _own_ rendered subtree). This section covers a failure boundary
> **replaying** a typed rpc failure that a nested `Boundary.rpc` encoded on the
> server. The server emit half is in
> `packages/dom/src/server/server-boundary-ssr.specs.md` (AC-7…AC-9); the shared
> index walk is in `packages/dom/src/boundary-replay.specs.md`.

30. **No failure payload at the cursor** — the failure boundary is transparent: its
    children are hydrated directly from the cursor (the server-success path,
    unchanged).
31. **`<script type="application/json" data-weft-boundary-failure>` at the cursor** —
    the boundary replays the typed failure instead of hydrating its children:
    a. Parse `{ index, error }` from the script.
    b. Locate the `index`-th statically-reachable `Boundary.rpc` in
    `props.children` via the shared `collectServerBoundaries` walk.
    c. `Schema.decodeUnknown(owner.errorSchema)(error)` → the typed rpc error.
    d. `Cause.fail(decoded)` → `props.match(cause)` → the **same** fallback `Node`
    the server rendered. The rpc is **never** re-called on the client.
    e. Hydrate the fallback at `script.nextSibling`, remove the script, and return
    the following cursor so the surrounding walk stays aligned.
32. **Recoverable miss**: a malformed payload, an un-locatable boundary at `index`,
    a decode failure, or a `match` that declines the rebuilt cause is a
    `HydrationMismatchError` (logged), consistent with `hydrateServerBoundary` —
    never a defect.
33. **Replay, never retry**: as with success replay, the client does not re-call the
    rpc; it reproduces the server-rendered fallback DOM flash-free.

---

type-tests: not applicable — `forkSupervised` (AC8 unobserved-exit supervision) is a non-exported module-internal helper in `render.ts`, unreachable from `__type-tests__`; its generics are plain pass-through with no overloads or conditional types, fully enforced by the main typecheck at its call sites.

e2e: not applicable — AC8 no-boundary failure reporting is an explicit `reportUnhandled` publish (default-log fallback) inside `forkSupervised` (a watcher fiber observing the subscription fiber's exit), not browser-observable behavior beyond what jsdom reproduces faithfully; DOM effects (markers, adopted content standing) are covered by the jsdom unit tests, and the existing browser suite was run green as a renderer regression check.
