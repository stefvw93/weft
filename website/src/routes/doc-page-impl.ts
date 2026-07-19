/**
 * Lazy route-component bodies for the doc routes.
 *
 * This module is the **heavy** half of the doc routes: it pulls in `DocPage`
 * (and thus `render-hast`, `CodeBlock`, `Demo`), the `Docs` service, and the
 * per-route render logic. It is imported **only** through `Router.lazy(() =>
 * import("./doc-page-impl"))` in the eager descriptor file (`routes/docs.ts`),
 * so this whole render body is emitted as its own chunk and never enters the
 * initial module graph: a request renders one leaf, so only that leaf's lazy
 * component chunk loads (server render + client nav; see
 * `packages/router/src/lazy-component.specs.md`).
 *
 * Every doc section (tutorial, how-to, explanation, reference) routes uniformly
 * through `/docs/:category/:slug`; there is no reference-specific route.
 *
 * Each export is a `Component` whose `E`/`R` (`Docs`, `Router.params`) propagate
 * through `Router.lazy` unchanged, so the sealed router type is identical to
 * declaring these bodies eagerly.
 */

import { Component } from "@weftui/core";
import { Router, notFound } from "@weftui/router";
import { Schema } from "effect";
import { Docs } from "./../lib/docs-service";
import { DocPage } from "./doc-page";

/** `/docs` → render the first doc in nav order (alias to the first tutorial step). */
export const DocsIndexPage = Component.gen(function* () {
  const docs = yield* Docs;
  const parts = docs.nav.firstDocPath.split("/").filter((p) => p.length > 0);
  const doc =
    parts[1] !== undefined && parts[2] !== undefined
      ? yield* docs.load(parts[1], parts[2])
      : undefined;
  if (doc === undefined) return yield* notFound();
  return yield* DocPage(doc);
});

/** `/docs/:category/:slug` → the matching DocPage for any section, or 404. */
export const DocsPage = Component.gen(function* () {
  const docs = yield* Docs;
  const { category, slug } = yield* Router.params({
    category: Schema.String,
    slug: Schema.String,
  });
  const doc = yield* docs.load(category, slug);
  if (doc === undefined) return yield* notFound();
  return yield* DocPage(doc);
});
