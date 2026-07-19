# Static Build (Prerender): `website/prerender.ts`

## Progress (TDD phases)

- [x] Phase 1: spec (this file)
- [x] Phase 2: mocks (`declare` surface: `src/lib/prerender.ts`, `prerenderPaths` in `entry-server.ts`, `prerender()` in `prerender.ts`)
- [x] Phase 3: type tests (n/a: no complex type-level surface; skipped by design)
- [x] Phase 4: unit tests (`src/lib/prerender.test.ts`, 7 tests, red against mocks as expected)
- [x] Phase 5: implement (declares replaced; `build:static` task wired; `vp run check` + `vp run test` green)
- [x] Phase 6: e2e validation (`vp run build:static`, serve `dist/static`, hard-load checks)

## Overview

Add a static build mode to the website: prerender every route of the SSR app to
plain HTML files so the site can be deployed to any static host (GitHub Pages,
Netlify, Cloudflare Pages) with no Node server.

The site is already fully static-friendly:

- No `Boundary.rpc`; the prod handler is a pure `Request → Response` function.
- The doc model is baked at build time by the `weftDocs` Vite plugin; nothing is
  fetched per request.
- The route surface is finite and enumerable: `/`, `/docs`, and
  `/docs/:category/:slug` for each doc in the model, plus the 404 page.

Prerendering reuses the existing production pipeline unchanged: build the client
bundle (`dist/client`) and server bundle (`dist/server/entry-server.js`), then a
post-build script calls the built `makeHandler` once per route and writes each
response body to disk, mirroring what `server.ts` does per request in prod.

## Deliverables

1. `website/src/lib/prerender.ts`: pure helpers, importable by the node test
   runner without the `virtual:weft-docs` module (same split as
   `docs-service.ts` vs `docs-live.ts`): `prerenderPathsFor(all)` (path
   enumeration from a `DocMeta` list), `outputFileFor(pathname, outDir)`
   (path → output-file mapping), `NOT_FOUND_PATH`.
2. `website/src/entry-server.ts`: additionally export `prerenderPaths`, the
   live path list (`liveDocs.all` through `prerenderPathsFor`), derived from
   the same baked doc model the app renders from. Single source of truth; the
   prerender script must not rescan `docs/` itself.
3. `website/prerender.ts`: post-build script (run with `tsx`) that emits the
   static site to `dist/static`.
4. `website/vite.config.ts`: new `build:static` task, `dependsOn: ["build"]`.

## Acceptance criteria

### Route enumeration

- [x] `entry-server.ts` exports a list of all prerenderable pathnames:
      `/`, `/docs`, and one `/docs/{category}/{slug}` per doc in the baked
      model.
- [x] The list is derived from the same doc model used for rendering (the
      `weftDocs` virtual module), not from re-reading the `docs/` directory.
- [x] Adding a new markdown doc requires no change to the prerender script;
      the new page appears in the next static build.

### Prerender script

- [x] Reads `dist/client/.vite/manifest.json` and resolves the hashed client
      entry and its CSS files, exactly as prod `server.ts` does.
- [x] Imports `makeHandler` from `dist/server/entry-server.js` and constructs
      the handler with the manifest-resolved entry and styles.
- [x] For each enumerated path, calls the handler with a `GET` request and
      writes the response body to `dist/static{path}/index.html`
      (e.g. `/docs/guide/intro` → `dist/static/docs/guide/intro/index.html`;
      `/` → `dist/static/index.html`).
- [x] Renders one unknown path (e.g. `/404`) and writes the body to
      `dist/static/404.html`; asserts the handler returned status `404`.
- [x] Copies all of `dist/client` (hashed assets, lazy doc-tree chunks, entry
      script, CSS) into `dist/static`, excluding `.vite/` (manifest is a build
      artifact, not a deployable asset).
- [x] Fails loudly (non-zero exit) if: manifest missing, server bundle missing,
      any handler response for an enumerated path has status ≥ 400, or a write
      fails. Partial output must not look like success.
- [x] Logs each written page path so the output enumerates exactly what was
      built.

### Task wiring

- [x] `vp run build:static` (from `website/`) runs the full chain: pack
      workspace deps → client build → server build → prerender.
- [x] Existing `dev`, `build`, and `start` tasks are unchanged; the SSR server
      path keeps working.

### Output correctness

- [x] Every prerendered page references the hashed client entry `<script>` and
      hashed CSS `<link>`s, so hydration works when served statically.
- [x] Client-side navigation still works after hydration (lazy doc-tree chunks
      resolve as static files under `/assets/`).
- [x] Serving `dist/static` with any dumb static file server (e.g.
      `npx serve dist/static`) yields a working site on hard loads of every
      enumerated route.

## Technical requirements & constraints

- Plain Node + `tsx` script; no new dependencies. Reuse `node:fs/promises`
  (`cp`, `mkdir`, `writeFile`, `readFile`).
- `Date`/randomness-free output: prerendered HTML must be deterministic given
  the same source, so builds are diffable. (`__WEFT_VERSION__` comes from git
  tags via `build-version.ts`, which is fine.)
- The script imports the _built_ server bundle, so it needs `// @ts-ignore` on
  that import like `server.ts` (the file doesn't exist during `vp check`).
- `dist/static` is wiped at the start of each prerender run so removed docs
  don't linger as stale pages.

## Edge cases

- **Trailing slashes**: directory-index layout makes `/docs/foo/bar` and
  `/docs/foo/bar/` both resolvable on common hosts. Internal links are
  no-trailing-slash; no redirect handling in scope.
- **Query strings**: prerendered pages are pathname-only. The handler receives
  `pathname + search` in SSR, but no route in this site branches on search
  params; if one ever does, it must be handled client-side after hydration.
- **Empty doc model**: if the docs plugin yields zero docs, the build still
  emits `/`, `/docs`, and `404.html`; it must not crash on an empty list.
- **404 status vs. body**: static hosts serve `404.html` with their own status
  handling; the in-app `notFound` component is the body. The script only
  asserts the SSR handler's status to catch route-enumeration bugs (an
  enumerated path unexpectedly rendering the 404 page).

## Out of scope

- Replacing the SSR server (`server.ts` and `start` stay).
- Sitemap/RSS generation, redirects files, host-specific config
  (`_headers`, `netlify.toml`, etc.).
- Incremental prerendering; the script always renders all routes (site is
  small).

## Testing

- Unit test (`src/lib/prerender.test.ts`, co-located with the helpers; the
  website Vitest project only includes `src/**`): `prerenderPathsFor` yields
  `/`, `/docs`, and one entry per doc for a fixture `DocMeta` list (and just
  `/`, `/docs` for an empty list); `outputFileFor` handles `/`, nested paths,
  and `NOT_FOUND_PATH`.
- E2e validation: run `vp run build:static`, serve `dist/static` statically,
  assert hard-load of `/` and one doc page returns the expected HTML
  (extend existing browser test setup only if cheap; otherwise a smoke check
  in the script's own output suffices for now).
