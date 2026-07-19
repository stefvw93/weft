/**
 * Server entry: renders the matched route to a hydratable HTML document.
 *
 * `makeHandler` returns a Web `fetch`-style handler (`Request → Response`) bound to a
 * given client entry `src`. It renders through `RouterServer.render` (buffered,
 * hydratable). Route components and the document shell read the doc model from the
 * `Docs` service, provided through the router's render-time `context` seam as
 * `DocsLive` (the build-time model). The dev server (`server.ts`) passes
 * `/src/entry-client.ts` and post-processes the HTML for Vite HMR; the prod server
 * passes the hashed artifact resolved from the Vite manifest. `App` has no
 * `Boundary.rpc`, so no `rpc` option is supplied.
 */

import { RouterServer } from "@weftui/router/server";
import { Effect } from "effect";
import { App } from "./app";
import { DocsLive, liveDocs } from "./lib/docs-live";
import { prerenderPathsFor } from "./lib/prerender";
import { documentShell } from "./layouts/shell";

/**
 * Every prerenderable pathname, derived from the baked doc model (`liveDocs.all`
 * through `prerenderPathsFor`): the single source of truth for the static build.
 * Consumed by `website/prerender.ts` from the built server bundle.
 */
export const prerenderPaths: readonly string[] = prerenderPathsFor(liveDocs.all);

/** Builds the web handler for a given client entry `src` and stylesheet hrefs. */
export const makeHandler = (
  clientEntry: string,
  styles: readonly string[] = [],
): ((request: Request) => Promise<Response>) => {
  const document = documentShell(clientEntry, styles);
  return (request) => {
    const url = new URL(request.url);
    return Effect.runPromise(
      Effect.map(
        RouterServer.render(App, { document, url: url.pathname + url.search, context: DocsLive }),
        ({ html, status }) =>
          new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } }),
      ),
    );
  };
};
