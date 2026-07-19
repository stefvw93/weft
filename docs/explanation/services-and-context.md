---
title: Services and Context
order: 5
section: explanation
description: How Effect services reach components: the requirement channel, discharging R at the mount, the router's render-time context seam, and ServerTag server-only brands.
---

# Services and Context

Weft has no separate dependency-injection system. It uses Effect's. A component that needs a service reads it with `yield* Service`. Because [a node is an Effect](./rendering-model.md), that requirement rides the node's `R` channel up the tree to a single point where you provide it.

This page explains how a service travels from provider to reader, and the two seams that make that work across the server/client boundary.

## R accumulates, then discharges once

When a component does `yield* ThemeService`, `ThemeService` enters that node's requirement channel. It accumulates through every parent: a boundary, a layout, the app node. The whole tree's `R` becomes the union of everything any component needs. You satisfy it in **one** place, at the edge:

```typescript
import { Effect } from "effect";
import { WeftApp } from "@weftui/dom/client";

const app = WeftApp.make(ThemeServiceLive);
const handle = WeftApp.mount(app, App(), document.getElementById("root")!);
```

Provide too little and it is a compile error at `WeftApp.make`: the type of `App()` names exactly which service is missing. This is the same discipline as any Effect program. `R` is a promise the type checker holds you to, discharged at the program's boundary, not sprinkled through the tree.

Services flow **down** from the app's layer to every reader, including across reactive boundaries. A stream woven into a prop carries its own `R`, and a handler that reads a service resolves it from the same context. There is no prop-drilling and no context-provider component: the requirement channel _is_ the wiring.

## Layer lifetime and the app runtime

Under the old `mount`/`hydrate` model this was a real footgun. Each call created its own implicit `ManagedRuntime`. That runtime's effect resolved right after the tree's **initial render**, not when the app stopped running. Streams, event handlers, and forked work kept running on it long after.

`Effect.provide(scopedLayer)` is `acquireUseRelease` sugar: acquire, run the wrapped effect, then release **when that effect completes**. Wrapped directly around `mount`, the release ran at mount-resolve, while the mounted tree was still reading from the now-disposed service:

```typescript
// ❌ (old API) the layer's finalizers ran the instant runPromise settled, while the
// mounted tree kept running: every subscription then read a disposed service
Effect.runPromise(mount(App(), root).pipe(Effect.provide(SomeScopedLayer)));
```

This is exactly what happened with the atom registry layer (`AtomRegistry.layer`, from `effect/unstable/reactivity`) in the [`effect-atom` example](../../examples/effect-atom) (issue #122). Every atom-driven region rendered empty, with no error, because the registry the streams read from had already been disposed.

`WeftApp` closes this gap structurally instead of by convention. An app owns exactly **one** lazy `ManagedRuntime`. `WeftApp.make(layer)` builds the layer on the first `mount`/`hydrate`. It releases only at `WeftApp.dispose(app)`, never when any individual mount's render effect resolves.

A scoped layer (`AtomRegistry.layer`, `RouterLive`) therefore just works passed straight to `WeftApp.make`. There is no `mountScoped`, no `Effect.never`, and no manual `ManagedRuntime` composition to reach for.

See [Provide Services](../how-to/provide-services.md) for the recipes. They cover `memoMap` sharing across apps and the `Effect.acquireRelease(make, dispose)` pattern for binding an app's own lifetime to an external scope. There is deliberately no `makeScoped`.

## The router's render-time context seam

A plain `WeftApp.mount`/`WeftApp.hydrate` discharges `R` once, at `WeftApp.make`. But under `@weftui/router`, the tree does not render in the context of the effect that called `render`.

Each request dispatches through platform's HTTP layer in its own managed context. The reactive outlet drains in the top render context, not in any intermediate node's. Providing a service _ambiently_ around the render would be lost before it reached a route component.

So the router exposes an explicit **`context` seam**, a `Layer` threaded to the document shell and every route, layout, and leaf:

```typescript
class Greeting extends Context.Service<Greeting, { text: string }>()("Greeting") {}

// server entry
RouterServer.render(App, { document, url, context: Layer.succeed(Greeting, { text: "hi" }) });

// client entry: same seam, so the hydrated tree reads the same services
RouterLive(App, { context: DocsLive });
```

The seam is **symmetric** (same shape on both sides) and **type-tracked**. The def's aggregate residual `R` is discharged here, so a missing provide is a compile error rather than a runtime 500. The residual is `AppServices<R>`: the def's `R` minus what the router itself threads (`Router`, `Router.Outlet`, `AppRpcClientTag`). An app with no app-services needs no `context`; a loosely-typed `RouterDef<any, any>` may omit it.

This is how the website provides its `Docs` service to every page. See [Add Routing](../how-to/add-routing.md).

## Server-only services: `ServerTag`

Some services must _never_ run in the browser: a database handle, a private credential, an rpc handler's backing store. Declare those with [`ServerTag`](../reference/core.md#servertag) instead of `Context.Service`. It behaves exactly like `Context.Service`, but its identifier carries a **server-only brand**.

The brand's job is to turn a leak into a **compile error at the `hydrate` call site**. A `Boundary.rpc` handler legitimately reads server-only services on the server, but they must not survive into client code. Since `render` only ever touches the _decoded result_ (never the service), a correctly-written boundary keeps its output `R` free of the brand.

If a branded tag leaks into `render` and reaches the client requirement channel, `hydrate`'s `AssertNoServerOnly` resolves `R` to a compile-error sentinel. You learn at build time, not from a runtime defect.

```typescript
import { ServerTag } from "@weftui/core";

// Only ever provided on the server; a leak into client code fails to compile.
class Db extends ServerTag("Db")<Db, { query: (sql: string) => Effect.Effect<Row[]> }>() {}
```

## The whole picture

- A component reads a service with `yield* Service`; the requirement enters `R`.
- `R` accumulates through the tree and is discharged **once**: at `WeftApp.make`, or through the router's `context` seam.
- The same services flow to the same components on the server and the client, because it is the same tree.
- `ServerTag` brands the services that must stay server-side, enforced at the `hydrate` boundary.

## See also

- [The Rendering Model](./rendering-model.md): why services flow through the tree at all
- [The Combinator API](./combinator-api.md): how `R` accumulates from children and reactive props
- [Provide Services](../how-to/provide-services.md): recipes for app layers, scoped layers, and binding an app's lifetime to an external scope
- [Add Routing](../how-to/add-routing.md): providing app services through the router `context` seam
- [Load Data with RPC](../how-to/load-data-with-rpc.md): where `ServerTag` and the rpc handler Layer meet
- [`ServerTag` API reference](../reference/core.md#servertag)
