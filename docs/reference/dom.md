---
title: "@weftui/dom"
order: 2
section: reference
description: Full API surface for @weftui/dom, covering the WeftApp client runtime (make, mount, hydrate, errors, dispose) and the server renderer (renderToString and streaming variants).
---

# @weftui/dom API Reference

The DOM renderer for Weft. It has two entry points: `@weftui/dom/client` for the
browser and `@weftui/dom/server` for Node. A package root re-exports the renderer
error types. See the [Server-Side Rendering guide](../how-to/render-on-the-server.md)
for a narrative walkthrough.

## `@weftui/dom/client`

`WeftApp` is the client entry point's app namespace (`export * as WeftApp from
"./weft-app"`). One `WeftApp` value is one lazily-built `ManagedRuntime` (the app
layer) + one root `Scope` + one unhandled-error hub.

Each `WeftApp.mount` / `WeftApp.hydrate` call creates a child **root scope** under
the app scope. Layer-built services are shared **by reference** across every root
mounted from the same app (layer memoization). This is what makes cross-island
reactive state work (see [examples/shared-state-islands](../../examples/shared-state-islands)).

The barrel also re-exports `MountError`, `HydrateError`, `RootHandle`,
`UnhandledError`, and the `WeftApp` interface's type as `WeftAppType` (renamed on
export to avoid colliding with the `WeftApp` namespace import).

### `WeftApp.make`

```ts
const make: {
  (): WeftApp<never, never>;
  <R, E>(
    layer: Layer.Layer<R, E, never>,
    options?: { readonly memoMap?: Layer.MemoMap },
  ): WeftApp<R, E>;
};
```

Creates a `WeftApp` from an app layer. `make` is synchronous and side-effect-free
with respect to the layer: the layer builds **lazily** on the first `mount` /
`hydrate` (or the first direct `app.runtime` run), per `ManagedRuntime.make`
semantics.

A layer whose construction has an observable side effect shows that effect only
after the first mount, never at `make` time. `options.memoMap` shares layer
memoization across multiple `WeftApp` instances.

There is deliberately no `makeScoped`. To bind an app's lifetime to a scope,
compose it yourself:

```ts
const acquireApp = Effect.acquireRelease(
  Effect.sync(() => WeftApp.make(AppLive)),
  (app) => WeftApp.dispose(app),
);
```

### `WeftApp.mount`

```ts
const mount: <R, E>(
  app: WeftApp<R, E>,
  node: Renderable,
  root: HTMLElement,
) => Effect.Effect<RootHandle, E | MountError>;
```

Mounts `node` into `root` as a new root of `app`. The returned effect is
self-contained: its requirement channel is `never`, so it runs with a bare
`Effect.runPromise`. Services come exclusively from the app layer; an
`Effect.provide` wrapped around this call does not reach components.

Clears `root`'s existing children, renders, appends the result. Completes after
initial render; streams keep running in the background, owned by the root's scope
(a child of the app scope).

The app layer builds lazily here on first mount; its error channel `E` surfaces at
that point. On render failure the root scope is closed before the error propagates;
the app runtime and other roots are untouched. Mounting on a disposed app fails
rather than hanging.

### `WeftApp.hydrate`

```ts
function hydrate<A extends Renderable, R = never, E = never>(
  app: WeftApp<R, E>,
  node: A,
  root: HTMLElement,
): [AssertNoServerOnly<CoreNode.Context<A>>] extends [CoreNode.Context<A>]
  ? Effect.Effect<RootHandle, E | HydrateError>
  : ServerOnlyLeak;
```

Continues, on the client, the DOM produced on the server by
`renderToStringHydratable` / `renderToStreamHydratable`, as a new root of `app`.
Unlike `mount`, does **not** clear `root`: it walks the node tree in lockstep with
the existing server DOM, adopting nodes in place. Error channel is `E |
HydrateError` (adds `HydrationMismatchError` on top of everything `mount` can fail
with).

Preserves the compile-time `AssertNoServerOnly` → `ServerOnlyLeak` guard. A
server-only requirement left in `node`'s context degrades the return type to the
`ServerOnlyLeak` sentinel (compile error at the call site), not a runtime failure.
Hydration mechanics (the readiness barrier, stream-id seeding) are otherwise
unchanged from `mount`.

### `WeftApp.errors`

```ts
const errors: <R, E>(app: WeftApp<R, E>) => Stream.Stream<UnhandledError>;
```

The app's unhandled-error stream. While at least one subscriber exists, the default
`Effect.logError` fallback is suppressed and every `UnhandledError` is delivered to
all subscribers. With zero subscribers, each unhandled error runs the default log
(annotated with `weft.region`) instead.

There is no replay: a subscriber sees only errors published after it subscribed.
Multiple concurrent subscribers each receive every subsequent error. When the last
subscriber unsubscribes, the default log resumes.

### `WeftApp.dispose`

```ts
const dispose: <R, E>(app: WeftApp<R, E>) => Effect.Effect<void>;
```

Disposes the app, in order:

- closes every root scope (in mount order),
- releases the runtime's layers (`runtime.disposeEffect`),
- shuts the error hub down.

Idempotent: teardown effects run once. Subsequent `mount` / `hydrate` calls fail.

### `WeftApp<R, E>` (`WeftAppType`)

```ts
interface WeftApp<in R = never, out E = never> {
  readonly [TypeId]: typeof TypeId;
  readonly runtime: ManagedRuntime.ManagedRuntime<R, E>;
}
```

Re-exported from the barrel as `WeftAppType`. `runtime` is the app's
`ManagedRuntime`, for running app-level effects against the shared layer outside
any root. Examples: `app.runtime.runFork(trackPageviews)` (see
`website/src/entry-client.ts`) and `app.runtime.runPromise(Router.push("/about"))`.

### `RootHandle`

```ts
interface RootHandle {
  readonly element: HTMLElement;
  unmount(): Effect.Effect<void>;
}
```

Returned by `mount` / `hydrate`. `element` is the DOM element the root was mounted
into. `unmount()` closes **this root's scope only**: it interrupts its stream
subscriptions and any scoped work forked from its event handlers.

It does **not** dispose the app runtime, touch other roots, or remove the rendered
DOM nodes from `element`. Idempotent: teardown side effects fire once.

### `UnhandledError`

```ts
interface UnhandledError {
  readonly cause: Cause.Cause<unknown>;
  readonly region: string;
  readonly root: RootHandle;
}
```

An error that escaped every user-level handler and reached the app's
unhandled-error hub, published on `WeftApp.errors(app)`. `region` identifies where
in the render tree the error escaped. Sources (one entry per failing occurrence):

- a rendered stream subscription failing or dying with **no enclosing `Boundary`**
  (region e.g. `"attribute:class"`, `"child:stream-3"`),
- an error escaping the **outermost** `Boundary` recovery (region
  `"boundary:outermost"`),
- an event-handler effect **failing or dying** (region `"event:onClick"`), reported
  in development and production alike (there is no `NODE_ENV`-gated swallow).

Interrupt-only causes are never published. Errors handled by a nested `Boundary`
never reach the hub.

### `MountError`

```ts
type MountError = UnsupportedNodeTypeError | StreamSubscriptionError | RenderError;
```

Errors `mount` can fail with, beyond the app layer's own error channel `E`.

### `HydrateError`

```ts
type HydrateError = MountError | HydrationMismatchError;
```

Everything `MountError` covers, plus `HydrationMismatchError` when the server DOM
and the node tree diverge.

### `TypeId`

```ts
const TypeId: unique symbol; // Symbol.for("@weftui/dom/WeftApp")
```

The unique brand for `WeftApp` values. Internal identity marker; rarely referenced
directly.

## `@weftui/dom/server`

### `renderToString`

```ts
renderToString(node: Renderable): Effect<string, Error, AppRpcClientTag>
```

Renders `node` to a complete HTML string. Use for static, non-hydrated output.

### `renderToStringHydratable`

```ts
renderToStringHydratable(node: Renderable): Effect<string, Error, AppRpcClientTag>
```

Like `renderToString`, but embeds the hydration markers and inline boundary data
that `hydrate` needs on the client. Pair this with `hydrate`.

### `renderToStream` / `renderToStreamHydratable`

```ts
renderToStream(node: Renderable): Stream<string, Error, AppRpcClientTag>
renderToStreamHydratable(node: Renderable): Stream<string, Error, AppRpcClientTag>
```

Streaming variants that emit HTML chunks as the tree resolves, so the browser can
start painting before the whole page is ready. The `Hydratable` variant includes the
hydration markers. These back streaming SSR and suspense.

### `renderToHydratableShell`

```ts
renderToHydratableShell(node: Renderable): Effect<HydratableShell, Error, R>
```

Produces a `HydratableShell` (the document scaffold around the app) for servers
that assemble the response shell separately from the streamed body.

### Suspense failure handling

`SuspenseFailureHandlerTag` is the service tag for a `SuspenseFailureHandler`. The
handler maps a failed suspense boundary to a `SuspenseFailureSubstitute` (fallback
markup) during streaming SSR.

## Package root (`@weftui/dom`)

Re-exports the renderer error types:

- `HydrationMismatchError`: the client tree did not match the server markup.
- `UnsupportedNodeTypeError`: a node type the renderer cannot handle was encountered.
- `RenderError`: a general rendering failure.
- `StreamSubscriptionError`: a reactive stream backing the tree failed to subscribe.

## See also

- [Render on the Server](../how-to/render-on-the-server.md): a narrative walkthrough of the server/client split
- [Provide Services](../how-to/provide-services.md): recipes for app layers, scoped layers, and binding an app's lifetime to an external scope
- [The Rendering Model](../explanation/rendering-model.md): hydrate-in-place and why there is no virtual DOM
- [Services and Context](../explanation/services-and-context.md): how services flow from the app layer to every root
- [`@weftui/core` reference](./core.md) · [`@weftui/router` reference](./router.md)
