/**
 * Ambient types for the build-time modules emitted by the `weftDocs` Vite plugin
 * (`src/lib/docs-plugin.ts`). `virtual:weft-docs` is the light index (metadata manifest +
 * lazy tree loader); each `virtual:weft-doc/<category>/<slug>` is one doc's `tree`, split
 * into its own chunk (see `docs-split.specs.md`).
 */
declare module "virtual:weft-docs" {
  import type { DocMeta, HastRoot } from "~/lib/markdown-loader";

  /** Every doc's metadata (no `tree`). Static: always in the initial client graph. */
  export const getAllMeta: () => DocMeta[];
  /** Resolves a doc's `tree` from its lazy per-doc chunk, or `undefined` for an unknown key. */
  export const loadDocTree: (category: string, slug: string) => Promise<HastRoot | undefined>;
}

declare module "virtual:weft-home-snippet" {
  import type { HastRoot } from "~/lib/markdown-loader";

  /** The build-time-highlighted hast tree for the landing-page code teaser. */
  export const tree: HastRoot;
}
