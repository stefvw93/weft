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
| `dist/client` | Hashed client assets and the Vite manifest, plus prerendered pages in `"server"` output.   |
| `dist/server` | The `main` bundle (`main.js`) when `main` exists, otherwise the routes Layer entry bundle. |
| `dist/static` | `"static"` output only: a complete static site. See [Prerendering](#prerendering).         |

Neither build output deletes the other. With `main` present, `node dist/server/main.js` serves pages and static assets with no Vite in the process.

### Prerendering

After the server build, the plugin loads the built routes Layer once and reads [`RouterServer.Prerender`](./router.md#routerserverprerender). It renders each path through the app's own request handling and logs each path it writes.

Each page is the full response body of a GET for its path, including streamed Suspense patches. It references the hashed client entry and stylesheets.

`output: "server"` (default):

- Only routes that declare [`prerender`](./router.md#prerender) are rendered.
- Each page is written into `dist/client` as `{path}/index.html` (`/` is `index.html`).
- `StaticAssets` answers a GET for such a path from its file as `text/html`, ahead of the live routes. The route's component does not run. A trailing slash and a query string do not change the match.
- Every other path, including the not-found page, renders live.
- When no route declares `prerender`, the build writes no HTML and never builds the app's Layer.

`output: "static"`:

- Every route without path params is rendered unless it sets `prerender: false`.
- A route with path params must declare its params or set `prerender: false`.
- The build also emits `dist/static`: the files of `dist/client` without the manifest directory, one `{path}/index.html` per path, and `404.html`, the app's not-found page rendered from a path no route claims.
- `dist/static` is emptied at the start of each build. Any static file host serves it, and the pages hydrate.
- The app's Layer is always built.
- `dist/client` and `dist/server` are still emitted.

The build fails, writing nothing, when:

- a page responds with status 400 or higher (the error names the path and status)
- a `prerender` Effect fails, or a param does not encode into its path ([`PrerenderPathsError`](./router.md#prerenderpathserror))
- a route with path params has no declaration in `"static"` output ([`PrerenderUndeclaredError`](./router.md#prerenderundeclarederror))
- a path segment decodes to `.`, `..` or contains a path separator
- in `"static"` output, the not-found page does not return 404
- in `"static"` output, the server entry's Layer does not provide `RouterServer.Prerender`. In `"server"` output such a Layer prerenders nothing.

## `WeftOptions`

```typescript
interface WeftOptions {
  readonly server?: string;
  readonly client?: string;
  readonly main?: string;
  readonly output?: "server" | "static";
}
```

`server`, `client` and `main` are paths. Each resolves from the Vite root and overrides its default independently.

| Option   | Default               | Meaning                                                                                             |
| -------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `server` | `src/entry-server.ts` | Module whose default export is the app's routes Layer.                                              |
| `client` | `src/entry-client.ts` | Module that hydrates the app in the browser.                                                        |
| `main`   | `src/main.ts`         | Production launcher. Optional: when the file is absent, the server build emits the Layer only.      |
| `output` | `"server"`            | What a build prerenders. `"server"`: only routes that declare `prerender`. `"static"`: a full site. |

`output` affects builds only. Dev always renders live.

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

- A prerendered page is frozen at build time. Do not prerender a route that reads per-request data.
- A prerendered path matches regardless of query string. Do not prerender a route whose markup depends on its query.
- With `"static"`, there is no server. A `Boundary.rpc` resolves at build time and replays on hydrate, but a later refetch has nothing to call.
- The build evaluates the server entry module, so module-level side effects in server code run at build time.
- A route's `prerender` declaration ships in the client bundle. Read data through a service tag, not a server-only import.
- The router is required: the server entry is a `RouterServer.layer` Layer.
- CSS imported only by server code is not linked in dev. Import styles from the client entry's module graph.
- In dev, a response the previous Layer is still streaming when a server module reloads is cut short.
- The production launcher is user code. Non-Node runtimes need their own.

## See also

- [Render on the server](../how-to/render-on-the-server.md): setup, launching and the Layer model
- [`RouterServer.layer`](./router.md#routerserver): the Layer the server entry exports
- [Prerender routes](../how-to/render-on-the-server.md#prerender-routes): declaring and building prerendered pages
- [`website/`](../../website): a complete `output: "static"` site
- [examples/router-ssr](../../examples/router-ssr): a complete app on the plugin
