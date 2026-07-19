# Per-route doc-data split specification

## Overview

The website bakes every doc's Shiki-highlighted `hast` tree into `virtual:weft-docs`
and imports it from **both** entries. Because `entry-client.ts` statically imports
`DocsLive`, the whole corpus (~820 kB raw / ~80 kB gzip, the single largest artifact)
ships to the browser on first load, even though a page renders exactly **one** doc.

This feature splits the baked data so the client's **initial** module graph carries
only a lightweight **metadata manifest** (needed by nav, routing, TOC on every page),
while each doc's heavy `tree` becomes its **own lazy chunk**, imported on demand.

No bundler code-pruning plugin is introduced (Weft's `Boundary.server` was cut to avoid
exactly that). The existing `weftDocs` **data-baking** plugin is extended; everything
else is website-local application wiring.

## Key facts (established)

- `DocModel.tree` (hast) is the weight. `frontmatter` + `headings` + `slug`/`category`/
  `path` are small.
- Only `DocPage` reads `doc.tree`. `DocsShell` (sidebar, prev/next, TOC) and `shell.ts`
  (`<title>`/meta) read only nav + `headings` + `frontmatter`, i.e. metadata.
- Weft `hydrate` **adopts** server DOM in place; a first reactive emission that matches
  the adopted DOM mutates nothing → **no flash** (`hydrate.specs.md`). A **bare async
  component** (no Suspense/Boundary wrapper) therefore hydrates flash-free: the SSR DOM
  stays visible while the component's async body (a dynamic `import()`) resolves, then
  adopts in place. Fallback flashes come only from Suspense/Boundary, which `DocPage`
  does not use. ⇒ **no JSON island / no payload duplication is required.**

## Data model

- `DocMeta = Omit<DocModel, "tree">`: the light per-doc record (`slug`, `category`,
  `path`, `frontmatter`, `headings`). New export from `markdown-loader.ts`.

## `virtual:weft-docs` (emitted by `weftDocs`)

- `getAllMeta(): DocMeta[]` returns every doc's metadata, tree stripped. Static, always in the
  client graph.
- `loadDocTree(category, slug): Promise<HastRoot | undefined>` resolves the doc's tree
  from a **per-doc lazy chunk**. Implemented as a static map of
  `() => import("virtual:weft-doc/<category>/<slug>")` thunks (statically-analyzable
  specifiers, so Rolldown emits one chunk per doc), returning `m.tree`.
- `getDoc`/`getAllDocs` (full-model accessors) are **removed**. No client caller should
  reach a tree synchronously.

Per-doc virtual modules `virtual:weft-doc/<category>/<slug>` each `export const tree`.
The plugin loads + memoizes all docs once; `load(id)` parses `(category, slug)` back out
and returns that doc's `tree`. Dev: the memo is cleared on any `docs/**/*.md` change
(alongside the existing full-reload).

## `Docs` service

```
interface DocsService {
  readonly all: readonly DocMeta[];                       // was DocModel[]
  readonly get: (category, slug) => DocMeta | undefined;  // metadata only (nav/TOC/title)
  readonly nav: NavData;                                  // unchanged (derived from meta)
  readonly load: (category, slug) => Effect<DocModel | undefined>; // meta + lazy tree
}
makeDocs(all: readonly DocMeta[], loadTree: (c, s) => Promise<HastRoot | undefined>): DocsService
```

- `load` memoizes resolved trees in a per-service `Map` so a re-render / back-nav to a
  visited doc is synchronous (`Effect.succeed`), with no re-import and no flash.
- Server and client both build `makeDocs(getAllMeta(), loadDocTree)`; on the server the
  dynamic `import()` resolves the bundled module synchronously enough for the buffered
  render. Route components are `yield* docs.load(...)` on both sides, uniformly.

## Consumers

- `routes/docs.ts`, `routes/api.ts`: `const doc = yield* docs.load(cat, slug)` (was
  `docs.get`). 404 / `api`-guard logic unchanged.
- `routes/doc-page.ts`: unchanged (takes a full `DocModel`).
- `layouts/docs-shell.ts`, `layouts/shell.ts`: unchanged behaviour. They already read only
  `nav` / `headings` / `frontmatter` via `get`, which now returns `DocMeta`.

## Acceptance criteria

- **AC1** The client entry chunk (and its static vendor deps) no longer contains any
  doc's `tree`; `getAllMeta`'s output has no `tree` field. The initial JS transfer drops
  by ~the corpus size (~80 kB gzip), verified by build output + a bundle assertion.
- **AC2** Each doc's `tree` is a distinct lazily-loaded chunk; navigating to a doc client
  side fetches exactly that doc's chunk.
- **AC3** First paint of a directly-loaded doc URL is **flash-free**: SSR HTML is adopted
  in place; the doc content is never replaced by a fallback/blank during hydration.
  (Browser test: load `/docs/<cat>/<slug>`, assert rendered code block present and stable
  across the hydrate tick.)
- **AC4** Client navigation to another doc renders its content once its chunk resolves;
  a return visit is synchronous (memoized).
- **AC5** Nav (sidebar/prev-next), TOC, and `<title>`/meta continue to work with metadata
  only, with no tree needed and no extra network request for chrome.
- **AC6** `makeDocs` stays pure + fixture-testable; `parseDoc` and `render-hast` are
  unchanged.

## Non-goals

- No `modulepreload` of the current doc chunk in this pass (correctness holds without it;
  it is a latency optimization deferred until the manifest→chunk mapping is wired).
- No `Boundary.server` / RSC-style code pruning. Data split only.
