---
title: "@weftui/vite"
order: 4
section: reference
description: "Full API surface for @weftui/vite: the weft() Vite plugin, WeftOptions, its two tagged errors, and the virtual:weft/assets module."
---

# @weftui/vite API Reference

The Weft Vite plugin. It serves a router app's routes Layer through Vite in dev and builds the client and server bundles for production. See [Render on the server](../how-to/render-on-the-server.md#set-up-the-vite-plugin) for setup.

Peer dependencies: `vite`, `effect` and `@weftui/core`.

```typescript
import { weft, WeftEntryNotFoundError, WeftServerEntryExportError } from "@weftui/vite";
import type { WeftOptions } from "@weftui/vite";
```

## `weft`

```typescript
function weft(options?: WeftOptions): Plugin;
```

Returns the Vite plugin. Add it to `plugins` in `vite.config.ts`.

```typescript
import { weft } from "@weftui/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [weft()] });
```

The plugin sets `appType: "custom"`, so the app answers every page request itself, including its own 404. A change to the plugin options or `vite.config.ts` restarts the dev server, as for any Vite config change.

### Dev server

- GET requests for page routes return server-rendered HTML with the route's status code (200, or 404 for the not-found page).
- Responses stream. The shell reaches the client before a pending `Boundary.suspend` resolves.
- Vite's own requests (module transforms, `/@vite/client`, HMR, files in `public/`) are served by Vite and never reach the app.
- Non-HTML responses (`POST /_eui/rpc`, user API routes) pass through untouched with their status, headers and body.
- One Layer serves every request. When a module the server entry imports changes, the previous Layer is disposed (its finalizers run) before a new one serves. Closing the dev server disposes it too.
- `main` is never run. Vite owns the HTTP server.
- A server entry that fails to load returns a 500 with a stack trace that points at source files. A failure during render is the app's own response.

### Build

One `vite build` builds the client first, then the server:

| Output        | Contents                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------ |
| `dist/client` | Hashed client assets and the Vite manifest.                                                |
| `dist/server` | The `main` bundle (`main.js`) when `main` exists, otherwise the routes Layer entry bundle. |

Neither build output deletes the other. With `main` present, `node dist/server/main.js` serves pages and static assets with no Vite in the process.

## `WeftOptions`

```typescript
interface WeftOptions {
  readonly server?: string;
  readonly client?: string;
  readonly main?: string;
}
```

Each path resolves from the Vite root and overrides its default independently.

| Option   | Default               | Meaning                                                                                        |
| -------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| `server` | `src/entry-server.ts` | Module whose default export is the app's routes Layer.                                         |
| `client` | `src/entry-client.ts` | Module that hydrates the app in the browser.                                                   |
| `main`   | `src/main.ts`         | Production launcher. Optional: when the file is absent, the server build emits the Layer only. |

## Errors

Both errors extend `Data.TaggedError`. The first fails Vite's startup. The second becomes a plain-text 500 response in dev.

### `WeftEntryNotFoundError`

A required entry file does not exist. Thrown at startup.

| Field   | Type                   | Meaning                                                         |
| ------- | ---------------------- | --------------------------------------------------------------- |
| `entry` | `"server" \| "client"` | Which entry is missing. Also the name of the overriding option. |
| `path`  | `string`               | The absolute path that was looked up.                           |

### `WeftServerEntryExportError`

The server entry's default export is not a Layer. Thrown on the first request.

| Field  | Type     | Meaning                                |
| ------ | -------- | -------------------------------------- |
| `path` | `string` | The absolute path of the server entry. |

## `virtual:weft/assets`

A module the plugin provides. Enable its types once with a reference line, for example in `src/env.d.ts`:

```typescript
/// <reference types="@weftui/vite/virtual" />
```

### `ClientAssets`

```typescript
const ClientAssets: () => Node<never, never>;
```

A component that renders the head tags loading the client. It takes no arguments. Call it in the document shell's `<head>`.

- **Dev**: Vite's client script plus a module script for the client entry source.
- **Build**: a module script for the hashed client entry, plus a stylesheet link for each CSS file the entry needs on first paint (its own and those of every chunk it imports statically).

Rendering it twice in one document emits the tags twice. The plugin does not deduplicate.

### `StaticAssets`

```typescript
const StaticAssets: Layer.Layer<
  never,
  PlatformError.PlatformError,
  HttpRouter.HttpRouter | FileSystem.FileSystem | Path.Path | HttpPlatform.HttpPlatform
>;
```

A Layer that mounts the built client files on the ambient `HttpRouter`. Its type matches Effect's `HttpStaticServer.layer`. Merge it with the routes Layer in the production launcher, and let the platform Layer supply the services.

- **Dev**: registers nothing, since Vite serves the files.
- **Build**: serves `dist/client`. Hashed files under the assets directory get an immutable cache header, and each file gets its `Content-Type`.
- Never serves a path outside `dist/client` and never serves the Vite manifest.
- Mounts on the path part of Vite's `base`. With a full-URL `base` (a CDN), tags use the full URL.

## Limits

- Prerendering is not supported.
- The router is required: the server entry is a `RouterServer.layer` Layer.
- CSS imported only by server code is not linked in dev. Import styles from the client entry's module graph.
- In dev, a response the previous Layer is still streaming when a server module reloads is cut short.
- The production launcher is user code. Non-Node runtimes need their own.

## See also

- [Render on the server](../how-to/render-on-the-server.md): setup, launching and the Layer model
- [`RouterServer.layer`](./router.md#routerserver): the Layer the server entry exports
- [examples/router-ssr](../../examples/router-ssr): a complete app on the plugin
