---
title: RPC Data Boundaries
order: 3
section: how-to
description: Boundary.rpc, server-resolved and client-refreshable data; the contract/handler split and the Resource handle's four lifecycles.
---

# RPC Data Boundaries

`Boundary.rpc` is Weft's primitive for **server-resolved, client-refreshable** data. One [`Rpc`](https://github.com/Effect-TS/effect/tree/main/packages/rpc) from the app's merged `RpcGroup` backs a single render boundary across four lifecycles: server-side render, hydrate-replay, client refetch, and client-first SPA mount.

## Quick example

```typescript
import { Boundary, h, Subscribable } from "@weftui/core";
import { Stream } from "effect";
import { GetStock } from "./data/inventory";

Boundary.rpc(
  GetStock, // the rpc: its _tag + schemas drive the boundary
  () => ({ id: product.id }), // payload thunk: a fresh typed input per call
  (
    resource, // render: receives a reactive Resource, not a bare value
  ) =>
    h.p([
      "in stock: ",
      h.span([Stream.map(Subscribable.changes(resource.value), (s) => String(s.units))]),
      h.button({ type: "button", onclick: () => resource.refetch }, "Refresh"),
    ]),
  { fallback: h.p("loading stock…") }, // shown only on a client-first mount
);
```

`render` receives a reactive [`Resource`](../reference/core.md#resourcea), resolved through the ambient [`AppRpcClientTag`](../reference/core.md#apprpcclienttag) seam that `@weftui/router` provides. The same rpc serves every lifecycle, so SSR-replay, refetch, and client-first mount are one mechanism, not three.

## The contract / handler split

The rpc **contract** (pure Schema) is shared with the client. The rpc **handler**, the only code that touches server-only services, lives in a Layer the client never imports. Tree-shaking keeps it and its transitive imports out of the browser bundle:

```typescript
// data/inventory.ts
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Context, Effect, Layer, Schema } from "effect";

// --- Contract (shareable with the client) ---
export const Stock = Schema.Struct({ units: Schema.Number });
export const StockKey = Schema.Struct({ id: Schema.Number });

// `_tag` ("GetStock") = the stable boundary id; payload schema = the typed input.
export const GetStock = Rpc.make("GetStock", { payload: StockKey, success: Stock });

// The app's merged RpcGroup: shared by both the client and server router wiring.
export const StockRpcs = RpcGroup.make(GetStock);

// --- Handler (server-only; the client never imports this) ---
class Inventory extends Context.Service<
  Inventory,
  { readonly stockFor: (id: number) => Effect.Effect<typeof Stock.Type> }
>()("Inventory") {}

const InventoryLive = Layer.succeed(Inventory, {
  stockFor: (id) => Effect.succeed({ units: 7 + (id % 5) }),
});

// `toLayer` binds each rpc to its handler; `Layer.provide` discharges its deps so R = never.
export const StockLive = StockRpcs.toLayer({
  GetStock: (payload) => Effect.flatMap(Inventory, (inv) => inv.stockFor(payload.id)),
}).pipe(Layer.provide(InventoryLive));
```

The split is enforced structurally by which files each entry imports, not by a bundler plugin. Declare server-only services with [`ServerTag`](../reference/core.md#servertag) (not `Context.Service`) when they might be referenced from universal code: the brand makes a leak into `render` a compile error at the `hydrate` call site, rather than a runtime surprise.

## Wiring the router

Pass the **merged group** to both sides, plus the **handler Layer** on the server:

```typescript
// entry-server.ts: in-process client over the handlers + POST /_eui/rpc endpoint
import { RouterServer } from "@weftui/router/server";
import { StockLive, StockRpcs } from "./data/inventory";

const rpc = { group: StockRpcs, handlers: StockLive } as const;

export const handler = RouterServer.toWebHandler(App, { document: documentShell, rpc });
export const render = (url: string) =>
  Effect.runPromise(RouterServer.render(App, { document: documentShell, rpc, url }));
```

```typescript
// entry-client.ts: network client posting to /_eui/rpc
import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { StockRpcs } from "./data/inventory";

const app = WeftApp.make(RouterLive(App, { rpc: { group: StockRpcs } }));
void Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), root));
```

- **Server** ([`RouterServer`](../reference/router.md#routerserver)) mounts the handler Layer at `POST /_eui/rpc`, so a client refetch re-runs it on the server. It also exposes an in-process client over the same handlers for SSR resolution, never a network hop.
- **Client** ([`RouterLive`](../reference/router.md#routerlive)) provides a network flat rpc client over the merged group, posting to `<origin>/_eui/rpc`.

In a **router-less mount** there is no `AppRpcClientTag`, so a `Boundary.rpc` resolves to a typed, descriptive "needs router/rpc" error, not a defect.

## The four lifecycles

| Lifecycle              | Trigger                                 | What happens                                                                                                                                         |
| ---------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SSR**                | server render                           | Resolve the rpc in-process, `successSchema`-encode the result inline as `<script type="application/json">`, render `render(seededResource)` to HTML. |
| **Hydrate**            | `hydrate` on the client                 | Read the inline payload at the cursor, `successSchema`-decode it, seed the `Resource`, adopt the DOM. **Never re-calls the rpc** (replay).           |
| **Refetch**            | `resource.refetch`                      | Call the rpc again over `POST /_eui/rpc` (re-runs the handler on the server), patch the subtree in place (stale-on-error).                           |
| **Client-first mount** | SPA nav into a boundary with no payload | Render `options.fallback`, fork the rpc call, swap in `render(resource)` once it resolves.                                                           |

Because the SSR path seeds `value` await-first, the SSR HTML and the adopted DOM are byte-identical. There is **no fallback flash** on the SSR/hydrate path; `fallback` renders only on a client-first mount:

```typescript
Boundary.rpc(GetStock, () => ({ id: product.id }), render, {
  fallback: h.p("loading stock…"), // unused on SSR/hydrate; shown only client-first
});
```

## The `Resource` handle

`render` receives a [`Resource<A>`](../reference/core.md#resourcea) (`A` = the rpc's decoded success), not a bare value. After hydrate the region is live:

| Field     | What it gives you                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------- |
| `value`   | A `Subscribable` of the current data: seeded with the SSR payload, updated on a successful refetch. |
| `refetch` | An `Effect<void>` that re-resolves the rpc with a fresh `payload()` and pushes the new `value`.     |
| `pending` | A `Subscribable<boolean>`: `true` while a refetch is in flight.                                     |
| `error`   | A `Subscribable<Option<unknown>>`: `Some` with the last refetch error (stale-on-error).             |

```typescript
(resource) =>
  h.section({ class: "product" }, [
    h.span([Stream.map(Subscribable.changes(resource.value), (s) => String(s.units))]),
    h.span([Stream.map(Subscribable.changes(resource.pending), (p) => (p ? "refreshing…" : ""))]),
    h.button({ type: "button", onclick: () => resource.refetch }, "Refresh stock"),
  ]);
```

Wire `refetch` to an event with `onclick: () => resource.refetch`. The handler returns the Effect, which the renderer runs in a detached fiber. A failed refetch leaves the previous `value` intact (stale-on-error): it does **not** unmount the subtree or raise into a failure `Boundary`.

### Channel algebra

```typescript
Boundary.rpc<R extends Rpc.Any, C extends Node<any, any>>(
  rpc: R,
  payload: () => Rpc.Payload<R>,
  render: (resource: Resource<Rpc.Success<R>>) => C,
  options?: { fallback?: Renderable },
): Node<Node.Error<C> | Rpc.Error<R>, Node.Context<C>>;
```

- **Error** = `render`'s error union plus the rpc's typed `Rpc.Error<R>` (`never` for an rpc with no `error` schema).
- **Requirement** = exactly `render`'s `R`, **untouched**: there is no `provide`/`RServer` to discharge (the handler lives in the rpc Layer) and no `Exclude` is applied. A server-only tag leaked into `render` stays in `R`, where `hydrate`'s `AssertNoServerOnly` rejects it.

## Typed-failure replay

Give the rpc an `error` schema and a resolved rpc **error** on the SSR pass is `errorSchema`-encoded into an inline failure payload:

```typescript
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Schema } from "effect";

export class OutOfStock extends Schema.TaggedError<OutOfStock>()("OutOfStock", {
  reason: Schema.String,
}) {}

export const GetStock = Rpc.make("GetStock", {
  payload: StockKey,
  success: Stock,
  error: OutOfStock,
});
```

The nearest enclosing **failure `Boundary`** renders its fallback. On the client, `hydrate` decodes that payload and re-raises the same error into the same boundary, reproducing the identical fallback DOM, flash-free and without re-resolving the rpc (replay, never retry):

```typescript
Boundary.catchTag({ tag: "OutOfStock", fallback: (e) => h.p({ class: "error" }, e.reason) }, [
  Boundary.rpc(
    GetStock,
    () => ({ id: product.id }),
    (resource) => h.p([Stream.map(Subscribable.changes(resource.value), (s) => String(s.units))]),
  ),
]);
```

A transport **defect** (no `Cause.findErrorOption`), or an rpc with no `error` schema, is **not** replayed; it propagates: a server-side fallback and a client mismatch.

## Full example

A `/products/:id` page with a refetchable live-stock `Boundary.rpc`, sealed into a single-route router app. This is the whole file set for the router + rpc parts (drop it alongside a dev server that bridges `entry-server.ts`'s `handler` into Vite or any Web-platform server; see [`examples/router-ssr/server.ts`](../../examples/router-ssr/server.ts) and its co-located [`vite.config.ts`](../../examples/router-ssr/vite.config.ts) for a working one).

```typescript
// src/data/inventory.ts
/**
 * The product's live stock: rpc contract + server-only handler. See "The
 * contract / handler split" above for why this file is safe to import from
 * both `app.ts` (contract only) and `entry-server.ts` (contract + handler).
 */
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Context, Effect, Layer, Schema } from "effect";

export const Stock = Schema.Struct({ units: Schema.Number });
export const StockKey = Schema.Struct({ id: Schema.Number });
export const GetStock = Rpc.make("GetStock", { payload: StockKey, success: Stock });
export const StockRpcs = RpcGroup.make(GetStock);

class Inventory extends Context.Service<
  Inventory,
  { readonly stockFor: (id: number) => Effect.Effect<typeof Stock.Type> }
>()("Inventory") {}

const InventoryLive = Layer.succeed(Inventory, {
  stockFor: (id) => Effect.succeed({ units: 7 + (id % 5) }),
});

export const StockLive = StockRpcs.toLayer({
  GetStock: (payload) => Effect.flatMap(Inventory, (inv) => inv.stockFor(payload.id)),
}).pipe(Layer.provide(InventoryLive));
```

```typescript
// src/app.ts
/**
 * Shared, isomorphic router app: one `/products/:id` page with a refetchable
 * live-stock `Boundary.rpc`. Side-effect-free (no mount/hydrate call), so
 * both entries and any test can import `App` directly.
 */
import { Boundary, Component, h, Subscribable } from "@weftui/core";
import { notFound, Router } from "@weftui/router";
import { Schema, Stream } from "effect";
import { GetStock } from "./data/inventory";

const idParam = { id: Schema.NumberFromString };

const productRoute = Router.route("products/:id", {
  path: idParam,
  component: ({ path }) => {
    if (!Number.isFinite(path.id) || path.id < 0) return notFound();
    return Boundary.rpc(
      GetStock,
      () => ({ id: path.id }),
      (resource) =>
        h.section({ id: "page" }, [
          h.h2(`Product ${path.id}`),
          h.p([
            "in stock: ",
            h.span([Stream.map(Subscribable.changes(resource.value), (s) => String(s.units))]),
          ]),
          h.button({ type: "button", onclick: () => resource.refetch }, "Refresh stock"),
        ]),
      { fallback: h.p("loading stock…") },
    );
  },
});

const Shell = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* h.div({ id: "app" }, [outlet]);
});

export const App = Router.router(Router.layout({ component: Shell }, [productRoute]), {
  notFound: () => h.section({ id: "page" }, [h.h2("404: page not found")]),
});
```

```typescript
// src/entry-server.ts
/**
 * Server entry: renders the matched route to a hydratable HTML document,
 * wiring the rpc's shared group and its server-only handler Layer.
 */
import { Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { RouterServer } from "@weftui/router/server";
import { Effect } from "effect";
import { App } from "./app";
import { StockLive, StockRpcs } from "./data/inventory";

const rpc = { group: StockRpcs, handlers: StockLive } as const;

const documentShell = Component.gen(function* () {
  const app = yield* Router.Outlet;
  return yield* h.html({ lang: "en" }, [
    h.head([h.meta({ charset: "utf-8" }), h.title("Weft shop")]),
    h.body([
      h.div({ id: "root" }, [app]),
      h.script({ type: "module", src: "/src/entry-client.ts" }),
    ]),
  ]);
});

export const render = (url: string): Promise<{ html: string; status: number }> =>
  Effect.runPromise(RouterServer.render(App, { document: documentShell, rpc, url }));

export const handler = RouterServer.toWebHandler(App, { document: documentShell, rpc });
```

```typescript
// src/entry-client.ts
/**
 * Client entry: hydrates the server-rendered markup in `#root`, wiring the
 * rpc's shared group so `resource.refetch` posts to `/_eui/rpc`.
 */
import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { App } from "./app";
import { StockRpcs } from "./data/inventory";

const root = document.getElementById("root")!;

const app = WeftApp.make(RouterLive(App, { rpc: { group: StockRpcs } }));
void Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), root));
```

## When to use

- **`Boundary.rpc`**: data resolved on the server (behind a server-only service, credential, or private network) and rendered into the initial HTML. It stays **refreshable** on the client over the same rpc.
- **`Boundary.suspend`**: async data that loads purely on the client; see the [Boundary API](../reference/core.md#boundarysuspend).

## See also

- [`Boundary.rpc` API reference](../reference/core.md#boundaryrpc): signature, `Resource`, `RpcOptions`, `AppRpcClientTag`
- [Server-Side Rendering](./render-on-the-server.md): the SSR + hydration model this builds on
- [Routing](./add-routing.md): `@weftui/router`, which provides the `AppRpcClientTag` seam
- [examples/router-ssr](../../examples/router-ssr): a runnable shop with an SSR-replayed, refetchable live-stock `Boundary.rpc`
