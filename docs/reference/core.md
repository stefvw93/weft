---
title: "@weftui/core"
order: 1
section: reference
description: "Full API surface for @weftui/core: element builders, components, sources, streams, and boundaries."
---

# @weftui/core API Reference

## Element builders

### `h`

Proxy-based namespace for building HTML and SVG elements. Every property is an element builder for that tag name:

```typescript
import { h } from "@weftui/core";

h.div(props, children)
h.span(props, child: string | number)
h.input(props)
h.ul(children)
// ...any HTML or SVG tag
```

Each builder has these overloads:

| Signature                               | Description                 |
| --------------------------------------- | --------------------------- |
| `h.tag(props, children: Renderable[])`  | Props + array of children   |
| `h.tag(props, child: string \| number)` | Props + single static child |
| `h.tag(props)`                          | Props only, no children     |
| `h.tag(children: Renderable[])`         | Children only, no props     |
| `h.tag(child: string \| number)`        | Single static child only    |
| `h.tag()`                               | No arguments                |

**Return type**: `Node<PropsE<P> | ChildrenE<C>, PropsR<P> | ChildrenR<C>>`

Reactive prop values (Stream, Effect, Subscribable) contribute their `E`/`R` to the node. Static values contribute `never`. Children's channels are unioned with props' channels.

### `h.fragment`

Groups children into a fragment that renders without a wrapper element:

```typescript
import { h } from "@weftui/core";

h.fragment(children: Node[]): Node<ChildrenE, ChildrenR>
```

Use when a component needs to return multiple sibling elements.

### `Component`

Namespace exposing two factories for reusable components with caller-propagating reactive prop types: `Component.gen` (generator body) and `Component.make` (plain-function body). Both return a callable that is generic over the caller's specific `props`/`children`. Reactive prop values and reactive children therefore contribute their `E`/`R` at the call site.

```typescript
import { Component } from "@weftui/core";

Component.gen<BaseProps, C>(
  body: (props: BaseProps, children: C) => Generator<YieldedEffect, ElementDescriptor, never>
): <GenP extends BaseProps, GenC extends C>(
  props: GenP,
  children?: GenC,
) => Node<PropsE<GenP> | ChildrenE<…> | BodyE, PropsR<GenP> | ChildrenR<…> | BodyR>;

Component.make<BaseProps, C>(
  body: (props: BaseProps, children: C) => Effect<ElementDescriptor, E, R>
): /* same call signature as above */;
```

**`Children`**: the optional `children` argument may be either form:

```typescript
type Component.Children<Input = never> =
  | readonly Renderable[]
  | ((input: Input) => readonly Renderable[]);
```

For function-children, `ChildrenE`/`ChildrenR` are extracted from the function's `ReturnType`, not from the function itself. The component's body invokes the function with whatever input it chooses.

**Example: `Component.gen`**

```typescript
interface TextFieldProps {
  value?: Source.Source<string>;
  onChange?: (v: string) => void;
}

const TextField = Component.gen(function* (props: TextFieldProps) {
  const value = yield* Source.toSubscribable(props.value);
  return yield* h.input({
    value,
    oninput: (e) => props.onChange?.(e.currentTarget.value),
  });
});
```

**Example: `Component.make` with function-children**

```typescript
const Labeled = Component.make(
  (props: { label: string }, children: (label: string) => readonly Renderable[]) =>
    h.div({ class: "field" }, children(props.label)),
);

Labeled({ label: "Name" }, (label) => [h.label(label), h.input()]);
```

> For rendering a reactive collection, reach for the built-in [`List.each`](#listeach)
> rather than mapping items by hand. It reconciles by key across emissions instead of
> rebuilding the region.

### `Boundary` namespace

Variants for intercepting rendering-path errors in a subtree, plus `Boundary.suspend` for async fallbacks and `Boundary.rpc` for rpc-backed server data. Each returns a descriptor that the renderer processes via the same `{ type, props }` branch. The catch variants share the same call shape: props first, children array second.

**What is caught:**

- Construction-time failures: the Effect phase of building child nodes
- Post-mount stream failures: streams driving children or prop values that fail after mount

**What is NOT caught:** event handler errors (they run in detached fibers outside the render path).

```typescript
import { Boundary } from "@weftui/core";
```

#### `Boundary.suspend`

Shows a fallback while async children are pending:

```typescript
Boundary.suspend(
  props: { fallback?: Renderable },
  children: Node[]
): Node<ChildrenE, ChildrenR>
```

- Shows `fallback` while any registered child has not yet emitted its first value
- Performs a single atomic DOM swap once all children have settled
- Works on both the server (streaming patch model) and the client
- `hydrate()` sees through `Boundary.suspend` boundaries and adopts resolved DOM in place

#### `Boundary.rpc`

A universal server/client render boundary backed by one `Rpc` from the app's merged `RpcGroup` ([`effect/unstable/rpc`](https://github.com/Effect-TS/effect)). The rpc **`_tag`** is the boundary's stable identity and its **payload schema** the typed input. The handler lives in the server-only rpc Layer (`group.toLayer(...)`), which the client never imports: tree-shaking does the client/server split structurally.

Unlike the catch variants it takes a `render` function, not a children array. That `render` receives a reactive [`Resource`](#resourcea), not a bare value.

```typescript
Boundary.rpc<R extends Rpc.Any, C extends Node<any, any>>(
  rpc: R,                                          // an Rpc from the merged RpcGroup; its _tag + schemas drive the boundary
  payload: () => Rpc.Payload<R>,                   // thunk: a fresh typed payload per call (SSR / refetch / mount)
  render: (resource: Resource<Rpc.Success<R>>) => C, // builds the subtree from a reactive Resource (not a bare value)
  options?: { fallback?: Renderable },             // shown only during a client-first SPA mount
): Node<Node.Error<C> | Rpc.Error<R>, Node.Context<C>>
```

The boundary resolves the rpc through the ambient [`AppRpcClientTag`](#apprpcclienttag) seam, provided by `@weftui/router` (`RouterServer` on the server, `RouterLive` on the client). It has four lifecycles:

- **SSR:** the server resolves the rpc in-process (over the handler Layer), `successSchema`-encodes the result inline as `<script type="application/json">` at the region cursor. It then renders `render(seededResource)` to HTML in place.
- **Hydrate:** `hydrate` reads the inline payload positionally, `successSchema`-decodes it, seeds the `Resource`, and adopts the DOM. It **never re-calls the rpc** (replay, not refetch).
- **Refetch:** `resource.refetch` calls the rpc again over the network (`POST /_eui/rpc`) and patches the subtree in place. **Stale-on-error**: a failed refetch leaves the previous value intact.
- **Client-first mount:** SPA-navigating into a boundary with **no** SSR payload renders `options.fallback`, forks the rpc call, and swaps in `render(resource)` once it resolves.

**Channel algebra:** the output `E` is `render`'s error union plus the rpc's typed `Rpc.Error<R>` (`never` for an rpc with no `error` schema). The output `R` is **exactly** `render`'s `R`, untouched. There is no `provide`/`RServer` to discharge (the handler lives in the rpc Layer) and **no `Exclude`** is applied. A server-only tag accidentally referenced in `render` therefore stays in `R`, where `hydrate`'s `AssertNoServerOnly` rejects it. Brand such services with [`ServerTag`](#servertag).

**Typed-failure replay:** a resolved rpc **error** on the SSR pass is `errorSchema`-encoded and relocated to the nearest enclosing failure `Boundary`. It is then replayed on the client: decoded and re-raised, reproducing the same fallback DOM (never retried). A transport **defect**, or an rpc with no `error` schema, is not replayed; it propagates.

> **Not yet covered:** streamed success (`Rpc.make(..., { stream: true })`) and mutations are on the roadmap, not this pass.

##### `Resource<A>`

The reactive handle `render` receives (`A = Rpc.Success<R>`). After hydrate the region is live: `value` is seeded with the SSR payload. The client can `refetch` the same data on demand, patching the rendered subtree in place.

| Field     | Type                                         | Meaning                                                                                                                                                                                  |
| --------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`   | `Subscribable.Subscribable<A>`               | Current data. Seeded with the SSR `data` (await-first, emits immediately, so SSR HTML and adopted DOM are byte-identical, no fallback flash). A successful refetch pushes the new value. |
| `refetch` | `Effect.Effect<void>`                        | Re-resolves the rpc over the network with a fresh `payload()` and sets `value`. Client only, a no-op on the server.                                                                      |
| `pending` | `Subscribable.Subscribable<boolean>`         | `true` while a refetch is in flight (`false` on the server / before any refetch).                                                                                                        |
| `error`   | `Subscribable.Subscribable<Option<unknown>>` | `Some` with the last refetch error, else `None`. A failed refetch is stale-on-error: it does **not** unmount or raise into a failure `Boundary`.                                         |

##### `RpcOptions`

```typescript
interface RpcOptions {
  readonly fallback?: Renderable; // shown only during a client-first mount; omit/null renders nothing while pending
}
```

##### `SERVER_BOUNDARY`

```typescript
export const SERVER_BOUNDARY: unique symbol;
```

The descriptor `type` every `Boundary.rpc` carries (`{ type: SERVER_BOUNDARY, props }`). Exported for renderers, which detect and handle the boundary synchronously via the `{ type, props }` branch without running the node.

##### `AppRpcClientTag`

```typescript
interface AppRpcClient {
  readonly call: (tag: string, payload: unknown) => Effect.Effect<unknown, unknown>;
}
class AppRpcClientTag extends Context.Service<AppRpcClientTag, AppRpcClient>()(
  "@weftui/core/AppRpcClient",
) {}
```

The ambient, package-neutral seam the renderer resolves a `Boundary.rpc` through: a **flat, untyped** caller `(tag, payload) => Effect<success>`. It lets `@weftui/dom` resolve a boundary without importing `effect/unstable/rpc` or `@weftui/router`. `@weftui/router` provides it: a **network** `RpcClient` (POST `/_eui/rpc`) in the browser, an **in-process** client over the handler Layer on the server.

`call` returns the already-decoded success; the renderer owns `successSchema`/`errorSchema` decoding of the inline SSR payload only. Both `AppRpcClientTag` and the `AppRpcClient` type are re-exported from `@weftui/core`. Absent in a router-less mount, where a `Boundary.rpc` resolves to a descriptive "needs router/rpc" error (not a defect).

See the [rpc data boundaries guide](../how-to/load-data-with-rpc.md) and [examples/router-ssr](../../examples/router-ssr).

#### `Boundary.catch`

Catches all typed failures (`Cause.fail`). Defects (`Cause.die`) are not caught and re-raise. Mirrors Effect 4's `Effect.catch` (renamed from `catchAll` in v3).

```typescript
Boundary.catch<C, FE, FR>(
  props: { fallback: (e: ChildrenE<C>) => Node<FE, FR> },
  children: C,
): Node<FE, ChildrenR<C> | FR>
```

The children's `E` is fully consumed. The output `E` is only the fallback's own error channel.

#### `Boundary.catchCause`

Catches every `Cause` including defects and interruptions. Mirrors Effect 4's `Effect.catchCause` (renamed from `catchAllCause` in v3).

```typescript
Boundary.catchCause<C, FE, FR>(
  props: { fallback: (cause: Cause.Cause<ChildrenE<C>>) => Node<FE, FR> },
  children: C,
): Node<FE, ChildrenR<C> | FR>
```

The fallback receives the full `Cause`, not just the failure value.

#### `Boundary.catchTag`

Catches errors whose `_tag` equals `props.tag`. Unmatched errors re-raise to the nearest parent boundary.

```typescript
Boundary.catchTag<C, Tag, FE, FR>(
  props: {
    tag: Tag;                                                    // must be a key of ChildrenE<C>["_tag"]
    fallback: (e: Extract<ChildrenE<C>, { _tag: Tag }>) => Node<FE, FR>;
  },
  children: C,
): Node<Exclude<ChildrenE<C>, { _tag: Tag }> | FE, ChildrenR<C> | FR>
```

The matched tag is removed from the output `E` union.

#### `Boundary.catchTags`

Catches multiple tags in one call. The handlers record IS the first argument (no wrapping object). Unregistered tags re-raise.

```typescript
Boundary.catchTags<C, Handlers>(
  handlers: {
    [Tag in ChildrenE<C>["_tag"]]?: (e: Extract<ChildrenE<C>, { _tag: Tag }>) => Node<any, any>
  },
  children: C,
): Node<UnhandledE | HandlersE, ChildrenR<C> | HandlersR>
```

#### `Boundary.catchFilter`

Conditionally catches using a `Filter`, run on each typed failure. A `Result.succeed` (pass) recovers via `fallback`, receiving the possibly-narrowed pass value. A `Result.fail` re-raises the error; its `Fail` channel `X` is preserved in the output `E`, since the boundary may not handle any given error.

Takes the `Filter` and `fallback` as **positional** arguments (no wrapping props object). Mirrors Effect 4's `Effect.catchFilter` (renamed from `catchSome`, which took an `Option`-returning function in v3).

```typescript
Boundary.catchFilter<C, EB, X, FE, FR>(
  filter: Filter.Filter<ChildrenE<C>, EB, X>,
  fallback: (matched: EB) => Node<FE, FR>,
  children: C,
): Node<X | FE, ChildrenR<C> | FR>
```

```typescript
import { Boundary } from "@weftui/core";
import { Filter, Result } from "effect";

Boundary.catchFilter(
  Filter.make((e: AppError) => (e._tag === "Net" ? Result.succeed(e) : Result.fail(e))),
  (matched) => h.div({}, matched.message),
  [Widget()],
);
```

#### `Boundary.catchIf`

A predicate gates the fallback. `false` re-raises.

```typescript
Boundary.catchIf<C, FE, FR>(
  props: {
    predicate: (e: ChildrenE<C>) => boolean;
    fallback: (e: ChildrenE<C>) => Node<FE, FR>;
  },
  children: C,
): Node<ChildrenE<C> | FE, ChildrenR<C> | FR>
```

#### Re-raise and nesting

When a boundary's `match` returns `null` (unmatched error), the error propagates to the nearest **parent** `Boundary` via `BoundaryContext`. If there is no parent boundary, the error fails the enclosing mount.

Inner boundaries shadow outer ones for their subtree: the innermost boundary is always tried first.

```typescript
// Inner catches FooError; BarError propagates to outer
Boundary.catch({ fallback: (e) => h.div(`Outer: ${e.message}`) }, [
  Boundary.catchTag({ tag: "Foo", fallback: (e) => h.span(`Foo: ${e.msg}`) }, [
    ChildWithFooOrBarError(),
  ]),
]);
```

---

## ServerTag

A `Context.Service` key whose identifier is branded server-only. Use it exactly like `Context.Service` for services that must only ever be provided on the server (e.g. a database handle read inside an rpc handler Layer). The brand also guards [`Boundary.rpc`](#boundaryrpc): a server-only tag accidentally referenced in `render` stays in the requirement channel, where `hydrate`'s `AssertNoServerOnly` rejects it at compile time.

```typescript
import { ServerTag } from "@weftui/core";
import { Effect } from "effect";

class Database extends ServerTag("Database")<
  Database,
  { readonly getProduct: () => Effect.Effect<Product> }
>() {}
```

- The server-only brand rides along in the requirement channel `R` of any effect that uses the tag.
- An rpc handler Layer (`group.toLayer(...)`) discharges it on the server, where it is provided. It never enters a [`Boundary.rpc`](#boundaryrpc)'s output `R`, since `render` only reads the decoded result.
- If a branded tag ever reaches client code (referenced in `render` and surviving into `hydrate`'s requirement channel), `AssertNoServerOnly` resolves `R` to a compile-error sentinel (`ServerOnlyLeak`). The failure surfaces at the `hydrate` call site, not silently at runtime.

`ServerOnly`, `ServerOnlyLeak`, and `AssertNoServerOnly<R>` are exported alongside `ServerTag` for advanced typing; most code only needs `ServerTag` itself.

---

## Keyed lists

### `List` namespace

The keyed-list combinator. It is the opt-in alternative to wholesale child rebuilds: items are rendered **once per key** and reconciled across emissions. Reordering, inserting, or removing items therefore reuses and moves existing DOM rather than rebuilding the region.

> **Note:** This exported `List` namespace is the built-in, key-reconciling way to
> render collections. Prefer it over hand-rolling a component that maps items into
> elements.

```typescript
import { h, List, Subscribable } from "@weftui/core";

h.ul([List.each({ of: Subscribable.changes(rows), by: (row) => row.id }, (row) => h.li(row.name))]);
```

#### `List.each`

Declares a keyed reactive list region.

```typescript
List.each<S extends Source.Source<Iterable<any>, any, any>, CE, CR, K>(
  options: List.Options<S, K>,
  render: (item: ItemOf<S>, index: number) => Node<CE, CR>,
): Node<Source.Error<S> | CE, Source.Context<S> | CR>
```

`render` runs **once per key**; a persisted key keeps its DOM nodes and its running subscription fibers across re-emits (it is never re-invoked). The returned node's `E`/`R` are the union of the source channels and the channels of the node `render` returns.

> **⚠️ Render-once / index-key footgun:** because `render` runs exactly once per key, reconciliation never refreshes a kept row's content. Refresh a row by threading a `Stream` **inside** it, not by re-running `render`. Keying by index (`by: (_, i) => i`) reuses rows positionally and will show stale content after a reorder. Prefer a stable identity key (`by: (item) => item.id`).

**`List.Options<S, K>`**

```typescript
interface List.Options<S, K> {
  readonly of: S;                                        // static Iterable<T>, or an Effect/Stream/Subscribable of one
  readonly by?: (item: ItemOf<S>, index: number) => K;   // key projection; compared via Effect Equal / Hash
}
```

- **`of`**: the list source. Each emission is materialized to an array to fix order, then reconciled by key.
- **`by`**: projects each item to its reconciliation key. Omitted ⇒ the item itself is the key (structural for `Data`, by reference otherwise).

#### `List.Error<N>` and `List.Context<N>`

Type-level accessors that extract the `E` and `R` channels from a list `Node`. Re-exported from the canonical `Node.Error` / `Node.Context` accessors.

See the `examples/keyed-list` example for a full reconciliation walkthrough (focus, uncontrolled inputs, and per-row counters surviving reorders).

---

## Types

### `Node<E, R>`

```typescript
type Node<E = never, R = never> = Effect.Effect<ElementDescriptor, E, R>;
```

The core tree type. Every element builder and component returns a `Node`. Because `Node` is an alias for `Effect.Effect`, all Effect operators work on nodes directly.

### `Source` namespace

The `Source` namespace contains the reactive prop vocabulary type and its normalization utility:

```typescript
import { Source } from "@weftui/core";

// The type union
type Source.Source<A, E, R> = A | Effect.Effect<A, E, R> | Stream.Stream<A, E, R> | Subscribable<A, E, R>
```

Any prop or child that supports reactivity accepts a `Source.Source`. Static values, Effects, Streams, and Subscribables are all valid.

#### `Source.changes(source)`

Returns the change stream of any `Source`, without normalizing through
`Subscribable` first:

```typescript
Source.changes<A, E, R>(source: Source.Source<A, E, R>): Stream.Stream<A, E, R>
```

Variant mapping:

- **`Subscribable`** → its `changes` stream, by reference
- **`Stream`** → returned as-is (identity, no wrap)
- **`Effect`** → `Stream.fromEffect(source)`, emitting the resolved value once
- **Static value** → `Stream.make(value)`, emitting once

Unlike `Source.toSubscribable`, this allocates no `SubscriptionRef`, latch, or
pump fiber. Use it where only the change stream is needed, e.g. list
reconciliation reading a `Source<Iterable<A>>` directly.

#### `Source.toSubscribable(source, key?)`

Normalizes any `Source.Source` into a hot `Subscribable<A, E | NoPropValue, R>` scoped to the enclosing `Scope`:

```typescript
Source.toSubscribable<A, E, R>(
  source: Source.Source<A, E, R>,
  key?: string
): Effect.Effect<Subscribable<A, E | NoPropValue, R>, never, Scope>
```

Normalization rules:

- **`Subscribable`** → returned by reference, no new ref or fiber
- **Static value** → `get` succeeds immediately; `changes` emits once
- **`Effect`** → memoized via `Effect.cached`; `changes` emits the resolved value once
- **`Stream`** → forks a scoped pump fiber that drains into a `SubscriptionRef`; `get` awaits the first emission

The pump fiber is tied to the enclosing scope via `Effect.forkScoped`. It terminates when the scope closes.

### `NoPropValue`

Tagged error raised when a `Stream` prop ends before emitting a value:

```typescript
class NoPropValue extends Data.TaggedError("NoPropValue")<{
  readonly key?: string;
}> {}
```

The `key` field identifies which prop triggered the error when provided.

### `PropsE<P>` and `PropsR<P>`

Type-level utilities that extract the `E` and `R` channels from a props object:

```typescript
type PropsE<P> = { [K in keyof P]: P[K] extends Stream.Stream<any, infer E, any> ? E : ... }[keyof P]
type PropsR<P> = { [K in keyof P]: P[K] extends Stream.Stream<any, any, infer R> ? R : ... }[keyof P]
```

These are used internally by `h` and `Component` to accumulate channels from props. Reference them directly only when building utilities over the combinator API.

---

## Constants

### `FRAGMENT`

Internal brand used to mark fragment nodes. Not intended for direct use; use `h.fragment` instead.

---

## Utility functions

### `isStream(value)`

Returns `true` if `value` is a `Stream.Stream`:

```typescript
isStream(value: unknown): value is Stream.Stream<unknown, unknown, unknown>
```

### `toStream(value)`

Normalizes a static value, `Effect`, or `Stream` into a `Stream`:

```typescript
toStream<A>(value: A | Effect.Effect<A> | Stream.Stream<A>): Stream.Stream<A>
```

- Static value → `Stream.make(value)` (single emission)
- `Effect` → `Stream.fromEffect(effect)` (one-shot)
- `Stream` → returned as-is

### `isSubscribable(value)`

Returns `true` if `value` implements the `Subscribable` interface (keyed off `Subscribable.TypeId`):

```typescript
isSubscribable(value: unknown): value is Subscribable<unknown, unknown, unknown>
```

## See also

- [The Combinator API](../explanation/combinator-api.md) · [Reactive Primitives](../explanation/reactive-primitives.md) · [Boundaries and Suspense](../explanation/boundaries-and-suspense.md): the concepts behind this surface
- [Author Components](../how-to/author-components.md) · [Render Keyed Lists](../how-to/render-keyed-lists.md): task guides that use it
- [`@weftui/dom` reference](./dom.md) · [`@weftui/router` reference](./router.md)
