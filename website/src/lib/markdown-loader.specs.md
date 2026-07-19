# Markdown loader spec

## Overview & purpose

A **build-time** transform that turns repo `docs/**/*.md` into JSON-serializable
**doc model** modules importable by both the server and client bundles. Because
the model is baked at build time, server and client render identical trees
(flash-free hydration) and no markdown/highlighter code ships to the browser.

Implemented as a Vite plugin (preferred) or a generated-module loader registered
in `website/vite.config.ts`. Source files live **outside** `website/` (in repo
`docs/`), so the loader resolves them relative to the workspace root.

## Pipeline

```
.md → remark-parse  (+ remark-frontmatter + yaml, + remark-gfm)
    → extract frontmatter
    → remark-rehype                          # mdast → hast
    → rehype-slug                            # stable heading ids
    → rehype-autolink-headings               # anchor links on headings
    → @shikijs/rehype                        # code blocks → highlighted hast
    → collect headings + serialize hast
```

## Doc model (output type)

```ts
type DocModel = {
  slug: string; // file basename without extension, e.g. "getting-started"
  category: string; // nav group, from frontmatter.section or dir name
  path: string; // route path, e.g. "tutorial/getting-started"
  frontmatter: {
    title: string;
    order: number; // Infinity if absent
    section: string;
    description?: string;
  };
  headings: { depth: number; id: string; text: string }[]; // for TOC
  tree: HastNode; // serialized hast root (elements/text only)
};
```

`HastNode` is the standard hast shape restricted to what the renderer needs:
`{ type: "element", tagName, properties, children }` | `{ type: "text", value }` |
`{ type: "root", children }`.

## Public surface

- A virtual/generated module exposing all docs: `getAllDocs(): DocModel[]` and
  `getDoc(category, slug): DocModel | undefined` (or an equivalent map). Must be a
  pure data import, with no runtime parsing in either bundle.
- Importable in `src/lib/nav.ts`, `src/routes/docs.ts`.

## Acceptance criteria

- AC1: Each `docs/**/*.md` produces exactly one `DocModel` with the fields above.
- AC2: Frontmatter is parsed and stripped from the rendered tree; `title` is
  required (build error if missing); `order` defaults to `Infinity`; `section`
  defaults to the containing directory name.
- AC3: GFM features (tables, autolinks, strikethrough, task lists) are supported.
- AC4: Every heading (`h2`–`h4`) has a stable slug `id` and an anchor link, and
  appears in `headings` with `{depth, id, text}`.
- AC5: Fenced code blocks are highlighted by Shiki **at build time**; the result
  is hast (not an HTML string). The chosen theme is configured in one place.
- AC6: A fenced block whose info string carries `demo=<id>` is preserved in the
  tree in a way the renderer can detect (e.g. retained `data-demo` property and
  the raw code text), so it can become a live demo. See `render-hast.specs.md`.
- AC7: The output contains **no** script/style/iframe/raw-HTML element types; only
  safe element + text nodes (see render-hast allowlist).
- AC8: `vp run -F website build` bakes the model; the client bundle contains no
  `unified`/`remark`/`rehype`/`shiki` runtime code (verify by absence of those
  deps in the client chunk).
- AC9: In dev (`vp run -F website dev`), editing a `docs/*.md` re-parses and HMRs
  the affected page.

## Edge cases

- Empty file / frontmatter-only file → valid `DocModel` with empty `tree.children`.
- Duplicate `(category, slug)` across files → build error (ambiguous route).
- Relative markdown links between docs (e.g. `./add-routing.md`) → rewritten to site
  routes (`/docs/how-to/add-routing`); external links left untouched.
- Relative links that **escape** the docs tree (e.g. `../../examples/keyed-list`,
  `../../packages/router/router.specs.md`) → rewritten to an absolute GitHub URL on the
  `main` branch (`https://github.com/stefvw93/weft/tree/main/examples/keyed-list` for a
  directory, `/blob/main/...` for a file). Relative resolution works on GitHub but 404s on
  the deployed site, so these must become absolute. A trailing `#hash` is preserved.
- Code block with no language → rendered as plain (un-highlighted) code, no error.

## Dependencies

`unified`, `remark-parse`, `remark-frontmatter`, `remark-gfm`, `remark-rehype`,
`rehype-slug`, `rehype-autolink-headings`, `@shikijs/rehype` (or `shiki`), `yaml`.
Added to `website/package.json` (catalog where available).
