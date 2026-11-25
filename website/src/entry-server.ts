/**
 * Server entry: the site's routes as one Effect `HttpRouter` Layer.
 *
 * The default export is what the `weft()` Vite plugin serves in dev and renders
 * from at build time. Route components and the document shell read the doc model
 * from the `Docs` service, provided here once as `DocsLive` (the build-time model).
 *
 * The site is built with `weft({ output: "static" })`: every route is prerendered
 * to `dist/static`, so there is no production server and no launcher. `App` has no
 * `Boundary.rpc`, so no `rpc` option is supplied.
 */

import { RouterServer } from "@weftui/router/server";
import { Layer } from "effect";
import { App } from "./app";
import { documentShell } from "./layouts/shell";
import { DocsLive } from "./lib/docs-live";

export default RouterServer.layer(App, { document: documentShell }).pipe(Layer.provide(DocsLive));
