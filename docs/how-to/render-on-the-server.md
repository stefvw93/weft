---
title: Server-Side Rendering
order: 2
section: how-to
description: Serve a router app with the weft() Vite plugin, plus the renderToString / streaming renderers, hydrate, and the server/client split.
---

# Server-Side Rendering

Weft renders on the server and hydrates on the client: the server produces HTML, and the browser adopts that existing DOM in place instead of re-creating it.

For a router app, the `@weftui/vite` plugin runs that loop for you in dev and in production. Your server entry default-exports one routes Layer, and `weft()` serves it.

```typescript
// vite.config.ts
import { weft } from "@weftui/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [weft()] });
```

[`Boundary.rpc`](../reference/core.md#boundaryrpc) extends this to **rpc-backed server data**: resolve an rpc on the server, serialize its result into the HTML, and replay it on the client without a second request. The region then stays live for refetch.

## Set up the Vite plugin

Install the plugin and the router, plus `@effect/platform-node` if you run the built server on Node.

```bash
npm install -D @weftui/vite vite
npm install @weftui/core @weftui/dom @weftui/router effect @effect/platform-node
```

With no options, `weft()` uses `src/entry-server.ts`, `src/entry-client.ts` and an optional `src/main.ts`. Override each path with `weft({ server, client, main })`. See the [`@weftui/vite` reference](../reference/vite.md).

Add the type reference for the `virtual:weft/assets` module once.

```typescript
// src/env.d.ts
/// <reference types="@weftui/vite/virtual" />
```

The complete file set for a one-page app follows. `app.ts` is shared by both entries.

```typescript
// src/app.ts
import { h } from "@weftui/core";
import { Router } from "@weftui/router";

const home = Router.route("", { component: () => h.h1("Hello from the server") });

export const App = Router.router(home, { notFound: () => h.h1("Not found") });
```

The server entry exports the routes Layer. `ClientAssets()` renders the script and stylesheet tags for the current mode, so the shell never names a file.

```typescript
// src/entry-server.ts
import { Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { RouterServer } from "@weftui/router/server";
import { ClientAssets } from "virtual:weft/assets";
import { App } from "./app";

const documentShell = Component.gen(function* () {
  const app = yield* Router.Outlet;
  return yield* h.html({ lang: "en" }, [
    h.head([h.meta({ charset: "utf-8" }), h.title("My app"), ClientAssets()]),
    h.body([h.div({ id: "root" }, [app])]),
  ]);
});

export default RouterServer.layer(App, { document: documentShell });
```

The client entry hydrates the server markup.

```typescript
// src/entry-client.ts
import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { App } from "./app";

const root = document.getElementById("root")!;
const app = WeftApp.make(RouterLive(App));
void Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), root));
```

The production launcher merges the routes with `StaticAssets`, the built files in `dist/client`. The plugin bundles it into the server build and never runs it in dev.

```typescript
// src/main.ts
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter } from "effect/http";
import { createServer } from "node:http";
import { StaticAssets } from "virtual:weft/assets";
import routes from "./entry-server";

const Server = HttpRouter.serve(Layer.mergeAll(routes, StaticAssets)).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
);

NodeRuntime.runMain(Layer.launch(Server));
```

`NodeHttpServer.layer` supplies the HTTP server and the file services `StaticAssets` needs. Without `main.ts`, the server build emits the routes Layer only.

### Run it

```bash
vite dev                   # server-rendered, streaming, with HMR
vite build                 # dist/client and dist/server
node dist/server/main.js   # production server
```

In a Weft workspace, use `vp dev` and `vp build`. [`examples/router-ssr`](../../examples/router-ssr) wraps them as tasks.

### What to expect

- In dev, one Layer serves all requests. When a server module changes, the old Layer is disposed and a new one is built.
- Editing a server module while a response is still streaming can cut that response short.
- Import CSS from the client entry's module graph. CSS imported only by server code is not linked in dev.
- Runtimes other than Node need their own launcher in place of `main.ts`.

## Prerender routes

A route renders ahead of time when it declares `prerender`. The build renders each page once and writes it as HTML.

```typescript
// src/app.ts
import { h } from "@weftui/core";
import { Router } from "@weftui/router";

export const about = Router.route("about", {
  component: () => h.h1("About"),
  prerender: true,
});
```

### Routes with params

A route with path params lists the values to render. Pass an array, or an Effect that yields one.

```typescript
import { Context, Effect, Schema } from "effect";

class Posts extends Context.Service<Posts, { readonly slugs: ReadonlyArray<string> }>()(
  "app/Posts",
) {}

export const post = Router.route("blog/:slug", {
  path: { slug: Schema.String },
  component: ({ path }) => h.h1(path.slug),
  prerender: Effect.map(Posts, (posts) => posts.slugs.map((slug) => ({ slug }))),
});
```

The params are type-checked against the route's `path` fields. Declare a param in `path` before listing values for it. `prerender: true` on a param route is a compile error.

The Effect's requirements are needed only by the routes Layer. Provide them there. The client entry never has to provide a service that only a `prerender` Effect reads.

```typescript
import { Layer } from "effect";

const PostsLive = Layer.succeed(Posts, { slugs: ["hello", "weft"] });

export default RouterServer.layer(App, { document: documentShell }).pipe(Layer.provide(PostsLive));
```

Use `prerender: false` to leave a route out. An empty array is valid and renders no pages.

### Choose an output

`weft({ output })` sets the default for the build. Dev ignores it and always renders live.

```typescript
export default defineConfig({ plugins: [weft({ output: "static" })] });
```

| Output               | Prerenders                                                                       | Result                                        |
| -------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| `"server"` (default) | Only routes that declare `prerender`.                                            | `dist/client` and `dist/server`.              |
| `"static"`           | Every route without params unless `prerender: false`, and declared param routes. | The same, plus `dist/static`, a site to host. |

With `"server"`, the build writes each page into `dist/client` as `{path}/index.html`. `StaticAssets` answers those exact paths from the files, ahead of the live routes. Every other path renders live, including the not-found page.

With `"static"`, a param route must declare its params or set `prerender: false`. Otherwise the build fails and names the route.

`dist/static` holds the client files (without the Vite manifest directory), one `{path}/index.html` per path, and `404.html` from the app's not-found page. Any static file host serves it with no server.

### Failures

The build fails and writes nothing when:

- a page responds with status 400 or higher
- a `prerender` Effect fails, or a param does not encode into the path
- a path segment decodes to `.`, `..` or contains a path separator
- in `"static"` output, the not-found page does not return 404, or the server entry's Layer is not a router Layer

### Limits

- **The declaration ships to the client.** The client bundle imports route files too, so `prerender` cannot be tree-shaken. Read data through a service tag and provide the service on the server. Never import a server-only module (a database client) into a route file for it.
- **Pages are frozen at build time.** Do not prerender a route that reads per-request data.
- **A prerendered path matches regardless of query string.** Do not prerender a route whose markup depends on its query.
- **`"static"` has no server.** A `Boundary.rpc` resolves at build time and replays on hydrate. A later refetch has nothing to call.
- **The build evaluates the server entry.** Module-level side effects in server code run at build time. With `"server"`, the app's Layer is built only when some route declares `prerender`. `"static"` always builds it.

See the [`prerender` option](../reference/router.md#prerender) and the [`output` option](../reference/vite.md#weftoptions) for the full contract. [`website/`](../../website) is a complete `"static"` site, and [`examples/router-ssr`](../../examples/router-ssr) prerenders its landing page under the default output.

## Rendering without the plugin

The plugin builds on the renderers in `@weftui/dom/server`. Use them directly for a router-less app, or when you bring your own server and bundler. This server entry renders a hand-built tree to a string:

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

Launch with Effect's `HttpRouter.serve` and a platform HTTP server Layer. `NodeHttpServer` comes from `@effect/platform-node`. Weft's packages do not depend on it, so your app adds it.

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
- The Layer does not serve static assets or bridge Vite. Use the [Vite plugin](#set-up-the-vite-plugin) and its `StaticAssets` Layer for both.

`RouterServer.render`, `toWebHandler` and `toStreamingWebHandler` remain and are built on this Layer. Their `context` and `rpc.handlers` Layers are built once per memoized handler, not per render, and are never released. See the [`RouterServer` reference](../reference/router.md#routerserver).

## When to use

- **`Boundary.rpc`**: data that must be resolved on the server (behind a server-only service, credential, or private network) and rendered into the initial HTML, then **refreshable** on the client (refetch / client-first SPA mount) over the same rpc.
- **`Boundary.suspend`**: async data that loads on the client (or streams the shell then fills); see the [Boundary API](../reference/core.md#boundarysuspend).

## See also

- [`@weftui/vite` reference](../reference/vite.md): `weft()`, its options and errors, and `virtual:weft/assets`
- [`RouterServer.Prerender`](../reference/router.md#routerserverprerender): the paths a build renders
- [rpc data boundaries guide](./load-data-with-rpc.md): the full `Boundary.rpc` walkthrough, covering the contract/handler split, router wiring, the four lifecycles, and typed-failure replay
- [Routing](./add-routing.md): `@weftui/router` builds on this SSR + hydration model for full-page nested routing
- [`Boundary.rpc` API reference](../reference/core.md#boundaryrpc)
- [`ServerTag` API reference](../reference/core.md#servertag)
- [examples/router-ssr](../../examples/router-ssr): a runnable shop with an SSR-replayed, refetchable live-stock `Boundary.rpc`
- [examples/ssr-hydration](../../examples/ssr-hydration): SSR + hydration without server data loading
