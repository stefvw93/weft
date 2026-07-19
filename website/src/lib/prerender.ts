/**
 * Pure prerender helpers: path enumeration and output-file mapping.
 *
 * Kept free of the `virtual:weft-docs` module (same split as `docs-service.ts` vs
 * `docs-live.ts`) so the node test runner can import and test these against fixture
 * `DocMeta` lists. The live, build-time-backed path list is exported by
 * `entry-server.ts`, which feeds `liveDocs.all` through `prerenderPathsFor`. The
 * post-build script `website/prerender.ts` consumes both. See `prerender.specs.md`.
 */

import { join } from "node:path";
import type { DocMeta } from "./markdown-loader";

/**
 * The synthetic pathname rendered to produce `404.html`. Not part of the route
 * table: the router resolves it to the `notFound` page at HTTP 404.
 */
export const NOT_FOUND_PATH = "/404";

/**
 * Derives every prerenderable pathname from a doc metadata list: `/`, `/docs`,
 * and one `/docs/{category}/{slug}` per doc, in stable (input) order. Does not
 * include {@link NOT_FOUND_PATH}. An empty doc list still yields `/` and `/docs`.
 */
export function prerenderPathsFor(all: readonly DocMeta[]): readonly string[] {
  return ["/", "/docs", ...all.map((doc) => `/docs/${doc.category}/${doc.slug}`)];
}

/**
 * Maps a pathname to its output file under `outDir` (directory-index layout):
 * `/` → `{outDir}/index.html`, `/docs/a/b` → `{outDir}/docs/a/b/index.html`,
 * and {@link NOT_FOUND_PATH} → `{outDir}/404.html` (static-host convention).
 */
export function outputFileFor(pathname: string, outDir: string): string {
  if (pathname === NOT_FOUND_PATH) return join(outDir, "404.html");
  return join(outDir, ...pathname.split("/").filter(Boolean), "index.html");
}
