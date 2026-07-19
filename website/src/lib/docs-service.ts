/**
 * The documentation model surface.
 *
 * `makeDocs` builds an indexed, nav-derived view over a doc set, exposed to route
 * components / layouts / the document shell as the {@link Docs} Effect service. The
 * build-time-backed {@link DocsService} value and its `DocsLive` layer live in
 * `docs-live.ts`; the layer is provided through `RouterServer.render` /
 * `RouterLive`'s render-time `context` seam (see
 * `packages/router/ambient-context-propagation.specs.md`), so every route leaf can
 * `yield* Docs`. `makeDocs` stays pure and dependency-free so it is unit-testable
 * with fixtures (and tests provide a fixture `Docs` layer).
 */

import { Context, Effect } from "effect";
import type { DocMeta, DocModel, HastRoot } from "./markdown-loader";
import { type NavData, buildNav } from "./nav";

/** The documentation model surface shared across the site. */
export interface DocsService {
  /** Every doc's metadata (no `tree`), unordered. */
  readonly all: readonly DocMeta[];
  /** Looks up a doc's metadata by `(category, slug)`, or `undefined`. For nav / TOC / title. */
  readonly get: (category: string, slug: string) => DocMeta | undefined;
  /** The nav manifest derived from `all` (groups, flat order, first path, neighbours). */
  readonly nav: NavData;
  /**
   * Loads a doc's full model (metadata **plus** its lazily-fetched `tree`) for rendering
   * the body via `DocPage`. Resolves synchronously (`Effect.succeed`) for an already-loaded
   * doc (memoized), so a re-render or back-navigation to a visited doc never re-imports and
   * never flashes; `undefined` for an unknown `(category, slug)`. See `docs-split.specs.md`.
   */
  readonly load: (category: string, slug: string) => Effect.Effect<DocModel | undefined>;
}

/**
 * The `Docs` Effect service: the app-wide documentation model, injected through the
 * router's render-time `context` seam and read by any route/layout/shell via
 * `yield* Docs`. `DocsLive` (build-time model) and fixture layers live in `docs-live.ts`.
 */
export class Docs extends Context.Service<Docs, DocsService>()("website/Docs") {}

/**
 * Builds a `DocsService` from the metadata manifest plus a `loadTree` fetcher (the
 * `virtual:weft-docs` `loadDocTree`, backed by lazy per-doc chunks). Resolved trees are
 * memoized per service instance so a revisit is synchronous. Pure + fixture-testable:
 * pass any `(all, loadTree)`: no build-time module dependency.
 */
export function makeDocs(
  all: readonly DocMeta[],
  loadTree: (category: string, slug: string) => Promise<HastRoot | undefined>,
): DocsService {
  const byKey = new Map(all.map((doc) => [`${doc.category}/${doc.slug}`, doc]));
  const treeCache = new Map<string, HastRoot>();
  return {
    all,
    get: (category, slug) => byKey.get(`${category}/${slug}`),
    nav: buildNav(all),
    load: (category, slug) =>
      Effect.gen(function* () {
        const key = `${category}/${slug}`;
        const meta = byKey.get(key);
        if (meta === undefined) return undefined;
        const cached = treeCache.get(key);
        const tree = cached ?? (yield* Effect.promise(() => loadTree(category, slug)));
        if (tree === undefined) return undefined;
        if (cached === undefined) treeCache.set(key, tree);
        return { ...meta, tree };
      }),
  };
}
