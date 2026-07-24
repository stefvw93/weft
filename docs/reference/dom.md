---
title: "@weftui/dom"
order: 2
section: reference
description: Full API surface for @weftui/dom, covering the WeftApp client runtime (make, mount, hydrate, errors, dispose), the server renderer (renderToString and streaming variants), and the Props.merge/Props.cx prop-bag composition utilities.
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
  readonly awaitCommit: Effect.Effect<number>;
  readonly commitGeneration: Effect.Effect<number>;
}
```

Returned by `mount` / `hydrate`. `element` is the DOM element the root was mounted
into. `unmount()` closes **this root's scope only**: it interrupts its stream
subscriptions and any scoped work forked from its event handlers.

It does **not** dispose the app runtime, touch other roots, or remove the rendered
DOM nodes from `element`. Idempotent: teardown side effects fire once.

#### `RootHandle.awaitCommit`

```ts
readonly awaitCommit: Effect.Effect<number>;
```

Resolves when everything dirty at the time you run this effect has committed to
the DOM or been discarded, yielding the commit generation.

- **Immediate when idle.** If nothing is dirty, it resolves right away with the
  current generation; there is no forced tick.
- **Quiescence-scoped, not future-scoped.** It covers only writes already
  delivered to the Loom at call time, not values a descendant pump writes
  later. Stream delivery from a `set` to its region's cell is itself
  asynchronous, so give the pump a beat (or check the DOM, or compare
  `commitGeneration`) before treating one `awaitCommit` as covering that
  specific write.
- **A region's first value may already be painted.** When a woven source
  delivers its first emission synchronously, that content is in the DOM as
  soon as `mount` resolves, before any commit. The "give it a beat" guidance
  above is about a later `set`, not a region's initial content.
- **Resolves across `WeftApp.dispose`.** Interrupting the app's flush fiber
  resolves every outstanding barrier; no caller hangs across app disposal.
- **App-scoped, not root-scoped.** One Loom is shared by every root of a
  `WeftApp`. With multiple mounted roots, `awaitCommit` may also wait on a
  sibling root's pending commits (a documented superset of "this root's
  commits"). Per-root filtering is not implemented.

```ts
yield * SubscriptionRef.set(count, 1);
yield * Effect.sleep("10 millis"); // let the emission reach the region's cell
yield * handle.awaitCommit; // everything delivered so far is now in the DOM
```

#### `RootHandle.commitGeneration`

```ts
readonly commitGeneration: Effect.Effect<number>;
```

The app's current commit generation: a monotonic counter, shared across every
root of the `WeftApp`, incremented once per flush pass that committed at least
one cell. Reading it does not wait for anything in flight; pair it with
`awaitCommit` to observe a specific commit rather than just the latest count.

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

Also re-exports the `Props` namespace, below.

## `Props`

`export * as Props from "@weftui/dom"`. Two functions for reconciling DOM prop
bags: `merge` combines multiple bags into one, `cx` builds a class string.
Both are pure and synchronous; neither subscribes anything. A reactive result
is a `Stream` description, subscribed later by the renderer in the element's
scope.

### `Props.merge`

```ts
function merge<const Bags extends ReadonlyArray<DomProps>>(...bags: Bags): Merged<Bags>;
```

`DomProps` is `object`. `merge` is variadic and left-to-right: `merge()` is
`{}`, `merge(a)` is observationally `a`, and `merge(a, b, c)` folds pairwise
(`merge(merge(a, b), c)`). `{}` is the identity on either side.

The fold is associative per key, with one exception: `style` is not
associative when a non-object form (a string, or a whole-object stream) takes
part. See the `style` rule below.

Keys present on only one side pass through unchanged, by reference. For a key
present on both sides, the merged value depends on the key:

| Key                                                                         | Rule                                                         | Result                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `on*` (event handler, per the renderer's `on` + lowercase-third-char check) | chained: both handler bodies run, left then right            | new handler function                                               |
| `class`                                                                     | concatenated                                                 | `string` if both sides are static, else a derived `Stream<string>` |
| `style`                                                                     | object sides merge per property; any other form is last-wins | plain object, or the right side as-is                              |
| `ref`                                                                       | fanned out                                                   | readonly array of `SubscriptionRef`s                               |
| anything else                                                               | last-wins                                                    | the right side's value, as-is                                      |

**Handlers.** Both handler bodies run synchronously when the merged handler
is invoked, left then right, before either side's returned `Effect` is
awaited. This is what makes `event.preventDefault()` written in either body
observable to the other: two separate DOM listeners would both run during
dispatch, so neither can wait on the other's `Effect` to decide whether the
default action should still happen.

Only the returned Effects are sequenced: left first, then right. Both always
run regardless of whether the other fails. A plain void-returning handler is
lifted to `Effect.void` (or a died `Effect` if it throws). The merged
handler's error channel is the union `E_left | E_right`; if both sides fail,
both causes are aggregated into one, not deduplicated (two equal-looking
failures are still two failures).

`null` or `undefined` on either side means "not provided": the other side
passes through unchanged, whatever shape it has, including a reactive
`Stream`/`Effect`-of-handler value (not chained, since only two plain
functions are chained; see [Accepted limitations](#accepted-limitations)
below). `false` on the **right** means "explicitly disabled" and wins, since
the renderer reads `false` as "no handler." That is how a caller switches a
behavior's handler off. A `false` on the left simply loses to the right side,
like any other last-wins value.
This is the only place `merge` treats a nullish value specially. The generic
rule below explains why every other key does not.

**`class`.** Two static strings concatenate with a single space, no dedupe:
`merge({ class: "a" }, { class: "b" }).class === "a b"`. If either side is
reactive (`Stream`, `Effect`, or `Subscribable`), the result is a derived
`Stream<string>` combining the latest value from each side, space-joined. A
static side contributes immediately; the first emission waits only on the
reactive side(s) (await-first). A reactive side that ends without ever
emitting fails the derived stream with `NoPropValue`, which joins the merged
`E` channel. When both sides contribute nothing (absent, `undefined`, or
empty), the result is `""`, matching `cx` and clsx: it is not normalized to
`undefined`.

The `class` rule for two present sides is exactly `cx(left, right)`; `cx` is
that same engine exposed directly (see below).

**`style`.** Two per-property objects (`style: { color: "red" }`) merge by
key union, right side winning per key; each surviving value, static or
`Source`, passes through by reference. Any other shape on either side (a
`string`, or a whole-object stream) is last-wins: the right side replaces the
left entirely. This is the one case where merge is not associative, since
last-wins discards a side instead of combining it, so grouping the fold
differently changes the result. Upgrading whole-object-stream style merging
to a real per-key merge is additive future work, not a breaking change.

**`ref`.** Both sides concatenate into one readonly array, flattening any
side that is already an array, so associativity holds:
`merge({ ref: [a, b] }, { ref: c }).ref` is `[a, b, c]`. Nullish sides are
dropped, so an optional ref forwarded as `undefined` never enters the array.
Each ref keeps the normal per-ref contract: set once to `Some(element)` when
the element mounts. The renderer's `ref` prop accepts a `SubscriptionRef` or
a `readonly SubscriptionRef[]` directly, so `h.div({ ref: [a, b] })` fans out
without `merge` too.

**Everything else (generic keys).** Plain last-wins, matching object spread:
the right side's value wins as-is, including an explicit `undefined`. There
is no nullish guard on this arm (unlike the handler rule): a guard was tried
and reverted, because it made the runtime return the left value while the
type still said the right value was present, silently dropping the left
side's `E`/`R` channels from the merged type.

#### Type-layer contract

`Merged<Bags>`'s **value** types stay coarse (Source-shaped, not narrowed to
exactly what the runtime returns); its `E`/`R` **channels** stay precise,
because `PropsE`/`PropsR` (the machinery that feeds a merged bag's channels
into `h.*`'s resulting `Node<E, R>`) match `P[K]` against an exact `Stream`
or function shape. A looser value type would fail that match and silently
drop the channel.

Consequences worth knowing:

- A shared key's merged value type is **required**, even when the key is
  optional on both input bags and absent from one side at runtime. Typing it
  optional would fail the `PropsE`/`PropsR` match and drop the channel for
  the common case: a behavior primitive's bag with optional props.
- A handler cell types as callable whenever _either_ side can carry a
  handler, even if that side is `null` at runtime. Narrowing this would
  require unioning the nullish outcome back in, which fails the same match.
- The `ref`-array cell types as `SubscriptionRef<Option<any>>`, not narrowed
  to a specific element type. `SubscriptionRef` is invariant in its value
  type, so a precise union would reject the headline case: fanning a
  behavior's `SubscriptionRef<Option<HTMLElement>>` out alongside a caller's
  `SubscriptionRef<Option<HTMLInputElement>>`. A mistyped ref inside a
  fan-out array is therefore not caught at compile time; the set-once
  contract keeps reads sound regardless.
- A bag typed with core's `HTMLAttributes`/`DOMAttributes` gets `unknown`
  handler channels, because those types declare handlers as returning
  `void | Effect<void, unknown, unknown>`. A behavior primitive that
  declares precise handler signatures keeps precise channels through the
  merge.

#### Accepted limitations

- Reactive handler _values_ (a `Stream`/`Effect` of a handler function, the
  form core's `EventHandler` union allows) are not chained: any non-function
  handler side falls back to last-wins, consistent with the whole-object
  style rule. Their `E`/`R` channels are still collected in the merged type.
- An inline handler written directly inside a `merge` call gets no
  contextual type for its event parameter, because `DomProps` is `object`
  and `merge` cannot know which element it will end up on. Write
  `onclick: (ev: MouseEvent) => …` with an explicit annotation, or give the
  bag its own type.

### `Props.cx`

```ts
function cx<const Inputs extends ReadonlyArray<CxInput>>(...inputs: Inputs): CxResult<Inputs>;

type CxInput =
  | string
  | false
  | null
  | undefined
  | Stream.Stream<string, any, any>
  | Effect.Effect<string, any, any>
  | Subscribable.Subscribable<string, any, any>
  | CxRecord
  | ReadonlyArray<CxInput>;

interface CxRecord {
  readonly [className: string]:
    | boolean
    | Stream.Stream<boolean, any, any>
    | Effect.Effect<boolean, any, any>
    | Subscribable.Subscribable<boolean, any, any>;
}
```

A reactive class-name builder, clsx-compatible plus reactive conditions. Each
input is one of:

- a **string**: kept as a literal class name segment;
- a **falsy value** (`false`, `null`, `undefined`, `""`): skipped;
- a **nested array** of `CxInput`: flattened recursively;
- a **record** (`{ className: condition }`): each key is included when its
  condition is truthy;
- a **reactive value** in place of a string (a `Source<string>`), or as a
  record condition (a `Source<boolean>`).

`cx()` is `""`. All-static inputs join into a plain `string`, space-separated,
no dedupe, no empty segments. Any reactive input (a reactive value, or a
reactive condition in a record) derives a `Stream<string>` that recomputes
the full class string on any emission, combining the latest value from every
reactive input.

A reactive value that resolves to `""` contributes nothing to that emission.
A reactive input that ends without ever emitting fails the stream with
`NoPropValue`, which joins the result's `E` channel along with every
reactive input's own `E`/`R`.

Only a plain record (an object literal, not a class instance, `Date`, or
boxed value like `SubscriptionRef`) is read as a condition map; anything else
is ignored rather than risking a foreign field name leaking in as a class
name.

`merge`'s `class` rule for two present sides is observationally
`cx(left, right)`: one engine behind both names.

## See also

- [Compose Behavior and Markup](../how-to/compose-behavior-and-markup.md): using `Props.merge`/`Props.cx` to combine a behavior's props with the caller's
- [Style Reactively](../how-to/style-reactively.md): the `style` prop's reactive forms
- [Use Element Refs](../how-to/use-element-refs.md): the `ref` prop and its fan-out form
- [Render on the Server](../how-to/render-on-the-server.md): a narrative walkthrough of the server/client split
- [Provide Services](../how-to/provide-services.md): recipes for app layers, scoped layers, and binding an app's lifetime to an external scope
- [The Rendering Model](../explanation/rendering-model.md): hydrate-in-place and why there is no virtual DOM
- [Services and Context](../explanation/services-and-context.md): how services flow from the app layer to every root
- [`@weftui/core` reference](./core.md) · [`@weftui/router` reference](./router.md)
