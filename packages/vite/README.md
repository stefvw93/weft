# @weftui/vite

> The [Weft](https://weftui.dev) Vite plugin: a server-rendered dev loop and a production build for router apps, with no hand-written dev server.

`weft()` serves your app's routes Layer through Vite in dev, with streaming responses and HMR. One `vite build` emits the hashed client bundle and a server bundle you launch with Node.

The server entry is the app's `@weftui/router` routes as an Effect `HttpRouter` Layer, so the router is required.

## Installation

```bash
npm install -D @weftui/vite vite
npm install @weftui/core @weftui/dom @weftui/router effect
```

`vite`, `effect` and `@weftui/core` are peer dependencies. Weft runs on stable Effect 4, and the peer range for `effect` is `^4.1.5`.

To run the built server on Node, add `@effect/platform-node` to your app. `@weftui/vite` does not depend on it.

## Setup

Add the plugin. With no options it uses `src/entry-server.ts`, `src/entry-client.ts` and an optional `src/main.ts`.

```typescript
// vite.config.ts
import { weft } from "@weftui/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [weft()] });
```

Enable the types for the `virtual:weft/assets` module once:

```typescript
// src/env.d.ts
/// <reference types="@weftui/vite/virtual" />
```

The server entry default-exports the routes Layer. The document shell renders `ClientAssets()` in its `<head>`.

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

The production launcher serves the routes and the built client files with Effect's Node platform.

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

## Commands

```bash
vite dev                    # server-rendered dev server with HMR
vite build                  # dist/client and dist/server
node dist/server/main.js    # production server
```

`main` is never run in dev, because Vite owns the HTTP server there.

## Key exports

| Export                       | What it does                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `weft(options?)`             | The Vite plugin. `options.server`, `options.client` and `options.main` override the paths. |
| `WeftEntryNotFoundError`     | Thrown at startup when the server or client entry is missing.                              |
| `WeftServerEntryExportError` | Thrown on the first request when the server entry's default export is not a Layer.         |
| `virtual:weft/assets`        | Exports `ClientAssets()` for the shell `<head>` and the `StaticAssets` Layer.              |

## Limits

- Prerendering is not supported.
- CSS must be imported from the client entry's module graph. CSS imported only by server code is not linked in dev.
- Editing a server module in dev can cut off a response that is still streaming.
- `main.ts` targets Node. Other production runtimes need their own launcher.

## Documentation

- Full docs: **https://weftui.dev**
- `@weftui/vite` API reference: **https://weftui.dev/docs/reference/vite**
- Server rendering guide: **https://weftui.dev/docs/how-to/render-on-the-server**

## License

MIT © Stef van Wijchen
