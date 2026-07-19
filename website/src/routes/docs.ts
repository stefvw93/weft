/**
 * Documentation route descriptors.
 *
 * - `/docs` aliases to the first doc (the tutorial's first step) by rendering
 *   its content.
 * - `/docs/:category/:slug` looks up the doc model and renders it via `DocPage`;
 *   an unknown `(category, slug)` short-circuits to the router's not-found (404).
 *   Every section (tutorial, how-to, explanation, reference) routes through here.
 *
 * Only the **descriptors** (segment + component slot) live here, eagerly. Each
 * component body is `Router.lazy(() => import("./doc-page-impl"))`, so the render
 * code (`DocPage`, `render-hast`, `CodeBlock`, `Demo`) is emitted as its own chunk
 * and loaded only for the matched leaf: the matcher/`href`/`buildHttpApi` still see
 * a static descriptor. Mounted under the `DocsShell` layout by `app.ts`.
 */

import { Router } from "@weftui/router";

/** `/docs` → render the first doc in nav order (alias to the first tutorial step). */
export const docsIndexRoute = Router.route("docs", {
  component: Router.lazy(() => import("./doc-page-impl").then((m) => m.DocsIndexPage)),
});

/** `/docs/:category/:slug` → the matching DocPage, or 404. */
export const docsRoute = Router.route("docs/:category/:slug", {
  component: Router.lazy(() => import("./doc-page-impl").then((m) => m.DocsPage)),
});
