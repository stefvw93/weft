---
title: Server-Side Rendering
order: 2
section: how-to
description: renderToString / renderToStringHydratable / streaming variants, hydrate, and the server/client split.
---

# Server-Side Rendering

Weft renders on the server and hydrates on the client: the server produces HTML, and the browser adopts that existing DOM in place instead of re-creating it.

[`Boundary.rpc`](../reference/core.md#boundaryrpc) extends this to **rpc-backed server data**: resolve an rpc on the server, serialize its result into the HTML, and replay it on the client without a second request. The region then stays live for refetch.

```typescript
// entry-server.ts
import { AppRpcClientTag } from "@weftui/core";
import { renderToStringHydratable } from "@weftui/dom/server";
import { Effect, Layer } from "effect";
import { App } from "./app";

// Every SSR render fn requires an AppRpcClientTag in context unconditionally,
// even when the tree has no Boundary.rpc. Discharge it with a no-op when unused.
const NoRpc = Layer.succeed(AppRpcClientTag, {
  call: () => Effect.die(new Error("no rpc in this app")),
});

export const render = (): Promise<string> =>
  Effect.runPromise(Effect.provide(renderToStringHydratable(App()), NoRpc));
```

```typescript
// entry-client.ts
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App } from "./app";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root not found");
}

const app = WeftApp.make();
void Effect.runPromise(WeftApp.hydrate(app, App(), root));
```

Both entries import the same side-effect-free `App`. Splice the server HTML into your template's outlet, ship it, and let the client entry hydrate it.

When `App` renders a real `Boundary.rpc`, replace `NoRpc` with the Layer `@weftui/router`'s `RouterServer` provides (see [Loading server data with `Boundary.rpc`](#loading-server-data-with-boundaryrpc) below). `NoRpc` only exists to satisfy the type when the tree has no rpc boundaries to resolve.

## The four renderers

`@weftui/dom/server` exports four renderers:

|                                        | String                     | Stream                     |
| -------------------------------------- | -------------------------- | -------------------------- |
| **Plain** (no JS / no hydration)       | `renderToString`           | `renderToStream`           |
| **Hydratable** (emits inline payloads) | `renderToStringHydratable` | `renderToStreamHydratable` |

```typescript
import {
  renderToStream,
  renderToStreamHydratable,
  renderToString,
  renderToStringHydratable,
} from "@weftui/dom/server";
```

Use a hydratable renderer whenever the client will call `hydrate`. The plain renderers produce complete, JS-free HTML with no payload scripts, so use them for pages that never run client JS.

All four share the same requirement channel: `Effect.Effect<string, Error, AppRpcClientTag>` for the string variants, `Stream.Stream<string, Error, AppRpcClientTag>` for the stream variants.

## Full example

The complete file set for an isomorphic counter: a shared `app.ts`, an SSR entry, and a hydrating client entry. This is the same shape `examples/ssr-hydration` runs; see that example for the dev server (`server.ts`) and `index.html` that bridge `entry-server.ts` into a request.

```typescript
// src/app.ts
/**
 * Shared isomorphic App. Rendered to hydratable HTML on the server and
 * hydrated in the browser from that same markup. The `SubscriptionRef`
 * region is flash-free: the server's first emission matches the client's
 * first emission, so `hydrate` adopts the existing node in place.
 */
import { h } from "@weftui/core";
import { Effect, SubscriptionRef } from "effect";

export const App = (props: { initialValue: number }) =>
  Effect.gen(function* () {
    const count = yield* SubscriptionRef.make(props.initialValue);
    const increment = () => SubscriptionRef.update(count, (n) => n + 1);
    const decrement = () => SubscriptionRef.update(count, (n) => n - 1);

    return yield* h.div([
      h.h1("SSR + Hydration"),
      h.div({ class: "count" }, [SubscriptionRef.changes(count)]),
      h.button({ type: "button", onclick: () => decrement() }, "-"),
      h.button({ type: "button", onclick: () => increment() }, "+"),
    ]);
  });
```

```typescript
// src/entry-server.ts
import { AppRpcClientTag } from "@weftui/core";
import { renderToStringHydratable } from "@weftui/dom/server";
import { Effect, Layer } from "effect";
import { App } from "./app";

// This app has no Boundary.rpc, but the SSR render fns require an
// AppRpcClientTag in context unconditionally, so discharge it with a no-op.
const NoRpc = Layer.succeed(AppRpcClientTag, {
  call: () => Effect.die(new Error("no rpc in this example")),
});

/** Renders the app to a hydratable HTML string. */
export const render = (): Promise<string> =>
  Effect.runPromise(Effect.provide(renderToStringHydratable(App({ initialValue: 3 })), NoRpc));
```

```typescript
// src/entry-client.ts
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App } from "./app";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root not found");
}

const app = WeftApp.make();
void Effect.runPromise(WeftApp.hydrate(app, App({ initialValue: 3 }), root));
```

`renderToStringHydratable` wraps the `SubscriptionRef.changes(count)` region in `<!-- stream-start-N -->` / `<!-- stream-end-N -->` markers around its first emission (`3`). `WeftApp.hydrate` locates that region via the markers, adopts the existing DOM node, and resumes the stream in place: no flash, no re-render.

## Loading server data with `Boundary.rpc`

`Boundary.rpc` resolves an rpc **on the server**, serializes the result into the same HTML this page produces, and replays it on the client during `hydrate`. There is no second request and no fallback flash, and the region stays live for `refetch`.

It follows the same server/client split: the rpc **contract** (pure Schema) is shared, while its **handler** lives in a server-only Layer the client never imports.

```typescript
import { Boundary, h, Subscribable } from "@weftui/core";
import { Stream } from "effect";
import { GetStock } from "./data/inventory";

const StockPanel = (productId: number) =>
  Boundary.rpc(
    GetStock,
    () => ({ id: productId }), // a fresh typed payload per call (SSR / refetch / mount)
    (resource) =>
      h.p([
        "in stock: ",
        h.span([Stream.map(Subscribable.changes(resource.value), (stock) => String(stock.units))]),
        h.button({ type: "button", onclick: () => resource.refetch }, "Refresh"),
      ]),
    { fallback: h.p("loading stock…") }, // shown only on a client-first SPA mount
  );
```

Under SSR the server resolves the rpc in-process, `successSchema`-encodes the result inline as `<script type="application/json">`, and renders in place; `hydrate` reads that payload positionally, seeds the `Resource`, and adopts the DOM **without re-calling the rpc** (replay, never retry). The full model lives in one place, the [RPC Data Boundaries guide](./load-data-with-rpc.md): the contract/handler split, router wiring, the four lifecycles, the `Resource` handle, and typed-failure replay. This page does not repeat it.

`Boundary.rpc` resolves through the ambient [`AppRpcClientTag`](../reference/core.md#apprpcclienttag) seam, which `@weftui/router` provides on both sides:

```typescript
// client (RouterLive): network rpc client over the shared group
const app = WeftApp.make(RouterLive(App, { rpc: { group: StockRpcs } }));

// server (RouterServer): same group, plus its handler Layer
const rpc = { group: StockRpcs, handlers: StockLive };
export const handler = RouterServer.toWebHandler(App, { document: documentShell, rpc });
```

In a router-less mount (like the `NoRpc` layer above) there is no seam, so the boundary resolves to a descriptive "needs router/rpc" error, not a defect.

## Serving a router app as a Layer

`RouterServer.layer` registers the page routes, an HTML not-found fallback, and (with `rpc`) `POST /_eui/rpc` into Effect's ambient `HttpRouter`. Merge it with your own routes and launch it like any Effect HTTP app.

```typescript
import { RouterServer } from "@weftui/router/server";
import { Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { App, documentShell } from "./app";
import { StockRpcs } from "./data/inventory";

const Pages = RouterServer.layer(App, { document: documentShell, rpc: StockRpcs });

const Health = HttpRouter.add("GET", "/health", HttpServerResponse.text("ok"));

export const Routes = Layer.mergeAll(Pages, Health);
```

`rpc` takes the `RpcGroup` contract only. Handlers and app services are requirements of the Layer, so discharge them with `Layer.provide`.

```typescript
// Continues the file above: `Routes` is the merged Layer.
import { Context, Effect, Layer } from "effect";
import { StockRpcs } from "./data/inventory";

class Database extends Context.Service<Database, { readonly units: (id: number) => number }>()(
  "app/Database",
) {}

const DatabaseLive = Layer.succeed(Database, { units: (id) => id * 10 });

const StockLive = StockRpcs.toLayer({
  GetStock: ({ id }) =>
    Effect.gen(function* () {
      const db = yield* Database;
      return { units: db.units(id) };
    }),
});

export const Server = Routes.pipe(Layer.provide(StockLive), Layer.provide(DatabaseLive));
```

Both Layers are built once per server and shared by every request. A page, layout or the document shell reads `Database` the same way the handler does.

### Launching on Node

Launch with Effect's `HttpRouter.serve` and a platform HTTP server Layer. `NodeHttpServer` comes from `@effect/platform-node`, which Weft does not install. See Effect's documentation for that package.

```typescript
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter } from "effect/http";
import { createServer } from "node:http";
import { Server } from "./server";

const Main = HttpRouter.serve(Server).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
);

NodeRuntime.runMain(Layer.launch(Main));
```

### Launching on fetch-style runtimes

`HttpRouter.toWebHandler` turns the same Layer into a `(Request) => Promise<Response>` handler. Call `dispose` to release the Layers on shutdown.

```typescript
import { HttpRouter } from "effect/http";
import { Server } from "./server";

export const { handler, dispose } = HttpRouter.toWebHandler(Server);
```

### Streaming and routing order

- Responses stream by default. Pass `streaming: false` to buffer the whole body.
- User routes outrank the HTML not-found fallback. A prefix catch-all such as `/api/*` also wins, so an unmatched `/api/missing` reaches your handler.
- The fallback claims only GET. Other unmatched methods get the platform's default 404.

### Limits

- Two `RouterServer.layer` instances in one `HttpRouter` are unsupported.
- A captured app service takes precedence over a same-key service in the request context.
- Per-request services (for example a session read from the request) are not supported.
- The rpc path is fixed at `/_eui/rpc`.
- Static assets and the Vite dev bridge are not served by the Layer.

`RouterServer.render`, `toWebHandler` and `toStreamingWebHandler` remain and are built on this Layer. Their `context` and `rpc.handlers` Layers are built once per memoized handler, not per render, and are never released. See the [`RouterServer` reference](../reference/router.md#routerserver).

## When to use

- **`Boundary.rpc`**: data that must be resolved on the server (behind a server-only service, credential, or private network) and rendered into the initial HTML, then **refreshable** on the client (refetch / client-first SPA mount) over the same rpc.
- **`Boundary.suspend`**: async data that loads on the client (or streams the shell then fills); see the [Boundary API](../reference/core.md#boundarysuspend).

## See also

- [rpc data boundaries guide](./load-data-with-rpc.md): the full `Boundary.rpc` walkthrough, covering the contract/handler split, router wiring, the four lifecycles, and typed-failure replay
- [Routing](./add-routing.md): `@weftui/router` builds on this SSR + hydration model for full-page nested routing
- [`Boundary.rpc` API reference](../reference/core.md#boundaryrpc)
- [`ServerTag` API reference](../reference/core.md#servertag)
- [examples/router-ssr](../../examples/router-ssr): a runnable shop with an SSR-replayed, refetchable live-stock `Boundary.rpc`
- [examples/ssr-hydration](../../examples/ssr-hydration): SSR + hydration without server data loading
