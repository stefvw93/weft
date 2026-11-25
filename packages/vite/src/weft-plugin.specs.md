# `weft()` Vite plugin

## Overview & Purpose

`weft()` is the Vite plugin exported by `@weftui/vite`. It gives a Weft app a server-rendered dev loop and a production build without a hand-written `server.ts`.

Today every SSR app carries its own dev server (57 to 232 lines). Each one repeats the Node-to-Web request bridge, Vite middleware mode, `ssrLoadModule`, `transformIndexHtml` and manifest lookup. Dev responses are buffered to inject Vite's client, so streaming is lost.

With the plugin an app has three small files and one config line:

- `src/entry-server.ts` default-exports the app's routes Layer (`RouterServer.layer` merged with user routes, services provided).
- `src/entry-client.ts` hydrates.
- `src/main.ts` launches the Layer for production, as Effect's docs show.
- `vite.config.ts` adds `weft()`.

```ts
// src/main.ts
import { ClientAssets, StaticAssets } from "virtual:weft/assets";
import routes from "./entry-server";

const Server = HttpRouter.serve(Layer.mergeAll(routes, StaticAssets)).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
);
NodeRuntime.runMain(Layer.launch(Server));
```

Decisions behind this spec:

- Vite is a hard requirement. The router is mandatory: the server entry is a router Layer.
- Scope is dev, build and prerender. Routes declare what to prerender (`packages/router/src/prerender.specs.md`); the plugin renders and writes it.
- Client scripts and CSS reach the HTML through a component the plugin provides, not through HTML rewriting.
- Entries follow conventions with overrides.
- The production launcher is user code. The plugin supplies the static-assets Layer it needs.
- `examples/router-ssr` and the website migrate in this spec.

## Acceptance Criteria

### Configuration

- [ ] **V1** `weft()` with no arguments uses `src/entry-server.ts`, `src/entry-client.ts` and `src/main.ts`, resolved from the Vite root.
- [ ] **V2** `weft({ server, client, main })` overrides each path independently.
- [ ] **V2a** `weft({ output })` is `"server"` (default) or `"static"`. It only affects builds. Dev always renders live.
- [ ] **V3** A missing server or client entry fails at startup with an error naming the expected path and the option that overrides it.
- [ ] **V4** A server entry whose default export is not a Layer fails on first request with an error naming the file and the expected export.
- [ ] **V5** `main` is optional. Without it, dev works and the server build emits the routes Layer only.

### Dev server

- [ ] **V6** Under `vp dev`, a GET for a page route returns the server-rendered HTML with the route's status code (200, or 404 for the not-found page).
- [ ] **V7** Vite's own requests (module transforms, `/@vite/client`, HMR, files in `public/`) are served by Vite and never reach the app.
- [ ] **V8** Non-HTML app responses pass through untouched with their status, headers and body. This covers `POST /_eui/rpc` and user API routes, including request bodies.
- [ ] **V9** Dev responses stream: the first chunk (shell) reaches the client before a pending `Boundary.suspend` resolves.
- [ ] **V10** Editing a module the server entry imports is reflected on the next request without restarting the dev server.
- [ ] **V11** One Layer serves every request until the server entry is reloaded. On reload the previous Layer is disposed (its finalizers run) before the new one serves. Closing the dev server disposes it too.
- [ ] **V12** A server entry that fails to load returns a 500 whose stack trace points at source files, not transformed output. A failure during render is the app's own response and passes through (V8).
- [ ] **V13** `main` is never executed in dev. Vite owns the HTTP server.

### Assets module (`virtual:weft/assets`)

- [ ] **V14** `ClientAssets()` is a Weft component returning a fragment of head tags. It takes no arguments.
- [ ] **V15** In dev it renders Vite's client script and a module script for the client entry source path. The page hydrates and HMR connects.
- [ ] **V16** In a build it renders a module script for the hashed client entry and a stylesheet link for each CSS file the entry needs on first paint: its own, plus those of every chunk it imports statically.
- [ ] **V17** `StaticAssets` is a Layer that mounts static files on the ambient `HttpRouter`. Its type matches Effect's `HttpStaticServer.layer`: `Layer<never, PlatformError, HttpRouter | FileSystem | Path | HttpPlatform>`. The app's platform Layer satisfies those services, so Weft imports nothing runtime-specific. In dev it registers nothing.
- [ ] **V18** In a build it serves the files in `dist/client`. Hashed files under the assets directory get an immutable cache header, and each file gets a correct `Content-Type`.
- [ ] **V19** `StaticAssets` never serves a path outside `dist/client` (no `..` traversal) and never serves the Vite manifest.
- [ ] **V20** The package ships type declarations for `virtual:weft/assets`, enabled with one reference line.

### Build

- [ ] **V21** One `vp build` emits `dist/client` (hashed assets and a manifest) and `dist/server`.
- [ ] **V22** With `main` present, `dist/server` contains its bundle, and `node dist/server/main.js` serves pages and static assets with no Vite in the process.
- [ ] **V23** A page rendered from the built server references only files that exist in `dist/client`.
- [ ] **V24** Neither build output deletes the other.

### Prerender: shared

- [ ] **V30** After the server build, the build loads the built routes Layer once, reads `RouterServer.Prerender`, and renders each path through the app's own request handling. No second rendering code path exists.
- [ ] **V31** Each prerendered page is the full response body of a GET for that path, including any streamed Suspense patches. It references the hashed client entry and stylesheets.
- [ ] **V32** A path that responds with status 400 or higher fails the build, naming the path and the status. No partial output is left looking like success.
- [ ] **V33** A failure while enumerating paths (`PrerenderUndeclaredError`, `PrerenderPathsError`) fails the build with that error's message.
- [ ] **V34** The build logs each path it writes.
- [ ] **V35** A server entry whose Layer does not provide `RouterServer.Prerender` (no router Layer in it) prerenders nothing in `"server"` mode and fails the build in `"static"` mode.

### Prerender: `output: "server"`

- [ ] **V36** Each prerendered path is written into `dist/client` as `{path}/index.html` (`/` is `index.html`).
- [ ] **V37** `StaticAssets` answers a GET for a prerendered path from its file, with `text/html`. The route's component does not run for that request. A trailing slash and a query string do not change the match.
- [ ] **V38** Every path that is not prerendered still renders live from the routes Layer, including the not-found page.
- [ ] **V39** With no prerenderable routes, the build output is the same as before this feature.

### Prerender: `output: "static"`

- [ ] **V40** The build also emits `dist/static`: every file of `dist/client` except the manifest directory, plus one `{path}/index.html` per prerendered path.
- [ ] **V41** `dist/static/404.html` is the app's not-found page, rendered from a path no route claims. The build fails if that render does not return status 404.
- [ ] **V42** `dist/static` is emptied at the start of each build, so removed pages do not linger.
- [ ] **V43** Serving `dist/static` from a plain static file server gives a working site on a hard load of every prerendered path, and the pages hydrate.
- [ ] **V44** `dist/client` and `dist/server` are still emitted and unchanged by this mode.

### Migration

- [ ] **V25** `examples/router-ssr` uses the plugin. Its `server.ts` is deleted and its `dev` task is `vp dev`.
- [ ] **V26** Its document shell uses `ClientAssets()` in place of the hardcoded entry script.
- [ ] **V27** It gains a `src/main.ts` and a `build` task, and its readme documents both.
- [ ] **V28** Its existing browser tests pass unchanged.
- [ ] **V45** `examples/router-ssr` marks its landing route `prerender: true`, demonstrating `"server"` mode: the built server answers `/` from the prerendered file and renders product pages live.
- [ ] **V46** The website uses `weft({ output: "static" })` from a single `vite.config.ts`. `website/server.ts`, `website/vite.ssr.config.ts`, `website/prerender.ts`, `website/src/lib/prerender.ts` and its test, and `website/prerender.specs.md` are deleted.
- [ ] **V47** The website's doc route declares `prerender` from the `Docs` service. `dist/static` holds the same pages as today: `/`, `/docs`, one page per doc, and `404.html`.
- [ ] **V48** The website's document shell uses `ClientAssets()`. `Docs` is provided to the routes Layer with `Layer.provide`.
- [ ] **V49** `/llms.txt` is served in dev and is present in `dist/static`.
- [ ] **V50** `vp run build:static` in `website/` still produces `website/dist/static`, so the deploy workflow needs no change. `vp run dev` serves the site with HMR.
- [ ] **V51** The website's remaining unit and browser tests pass.

### Documentation

- [ ] **V29** The server rendering how-to shows the plugin setup. The `@weftui/vite` package gets a README.

## Technical Requirements

- The dev middleware runs the server entry in Vite's SSR environment, so the app and the handler share one `effect` instance. The handler is `HttpRouter.toWebHandler` over the default-exported Layer.
- The Node-to-Web request bridge passes method, headers and a streamed body, and pipes the response body without buffering.
- The plugin itself has no Effect in its error channel: it is Vite plugin code. Failures surface as thrown errors with descriptive messages.
- `@weftui/vite` gains `effect` and `@weftui/core` as peer dependencies beside `vite`: the generated assets module imports both from the app. `@effect/platform-node` is a dependency of the example only, not of the package.
- `StaticAssets` is built on Effect's `HttpStaticServer.layer` (present in `effect@4.1.5`).
- Startup and export failures are thrown as tagged errors: `WeftEntryNotFoundError` (V3) and `WeftServerEntryExportError` (V4).
- The public surface is `weft`, `WeftOptions`, the two errors, and the `virtual:weft/assets` module (typed by `@weftui/vite/virtual`).
- type-tests: applicable. Cover the options object, the two errors, and that `virtual:weft/assets` resolves with the specified types (V1 to V4, V14, V17, V20).
- e2e: mandatory, since `examples/router-ssr` is touched. Its existing browser tests are the gate (V28). They import the document shell, so the root browser test config stubs `virtual:weft/assets` with its inert variant.

## Dependencies & Integrations

- `RouterServer.layer` from `@weftui/router/server` (stefvw93/weft#209). This spec assumes it is merged.
- Vite's environment API, through `vite-plus`.
- `effect/http` (`HttpRouter`) for the handler and the static Layer.
- `@effect/platform-node` in the example's `main.ts`. Version 4.1.5 is published with peer `effect ^4.1.5`. Whether `NodeHttpServer.layer` alone supplies `FileSystem`, `Path` and `HttpPlatform` is checked when the example is migrated.

## Expected Behavior & Edge Cases

- A request the app does not claim gets the app's own 404 page, not Vite's fallback.
- Changing the plugin options or `vite.config.ts` restarts the dev server, as Vite does for any config change.
- Reloading the server entry in dev disposes the previous Layer when the next request arrives. A response the old Layer is still streaming at that moment is cut short. This is dev-only and accepted.
- With a full-URL `base` (a CDN), tags use the full URL and `StaticAssets` mounts on its path part.
- `ClientAssets()` rendered twice in one document emits the tags twice. The plugin does not deduplicate.
- CSS imported only by server code is not linked in dev. Styles must be imported from the client entry graph.
- In `"static"` mode there is no server at runtime. A `Boundary.rpc` is resolved at build time and replayed on hydrate, but a later refetch has nothing to call.
- A prerendered page is frozen at build time. A page that reads per-request data must not declare `prerender`.
- In `"server"` mode the prerendered file wins over the live route for its exact path.
- Out of scope: revalidation, sitemap or redirect files, host-specific config, `ssr-hydration` and `suspense` (they have no router), non-Node production runtimes, and a generated launcher.
