# Base path (`base` option) — `packages/router/src/base.ts`

## Overview

Allow a router app to be served under a URL prefix (e.g. GitHub Pages project
sites at `/<repo>/`) without changing its route definitions. A new optional
`base` option on `RouterLive` (client) and `RouterServer.render` (server)
strips the prefix at the router's URL boundaries, so route patterns, `match`
results (`match.url`), `navigate` targets, and `href` stay **base-less
(canonical)** everywhere inside the router.

Division of responsibility: the router owns base **stripping/prefixing at the
History/request boundary**; the app owns prefixing the `href` attributes it
renders into the DOM (it knows its base at build time, e.g. via Vite's
`import.meta.env.BASE_URL`).

## Deliverables

1. `packages/router/src/base.ts` — pure helpers:
   - `normalizeBase(base: string | undefined): string` — `""`/`"/"`/`undefined`
     → `""`; otherwise ensures a leading `/` and strips trailing `/`
     (`"/weft/"` → `"/weft"`).
   - `stripBase(base: string, url: string): string | null` — `url` is a
     normalized `path + search` string. Returns the base-less URL when `url`
     is under `base`, else `null`. With `base === ""` always returns `url`.
2. `RouterLiveOptions.base?: string` (`client/router-live.ts`) — applied at:
   - location reads (initial seed and `popstate` resync),
   - History writes (`pushState`/`replaceState` receive `base + url`),
   - the link click interceptor (strips before matching/navigating).
3. `installLinkInterceptor` (`client/link.ts`) — accepts the normalized base.
4. `RouterServer.render` options: `base?: string` (`server/router-server.ts`)
   — strips the base from `options.url` before matching/rendering.

## Acceptance criteria

### `normalizeBase` / `stripBase` (pure)

- [x] `normalizeBase(undefined | "" | "/")` → `""`.
- [x] `normalizeBase("/weft" | "/weft/" | "weft")` → `"/weft"`.
- [x] `stripBase("", url)` → `url` unchanged (identity for the default).
- [x] `stripBase("/weft", "/weft")` and `stripBase("/weft", "/weft/")` → `"/"`.
- [x] `stripBase("/weft", "/weft/docs/a?x=1")` → `"/docs/a?x=1"`.
- [x] `stripBase("/weft", "/weft?x=1")` → `"/?x=1"`.
- [x] `stripBase("/weft", "/docs/a")` → `null` (outside base).
- [x] `stripBase("/weft", "/weftx")` → `null` (prefix must end at a segment
      boundary).

### Client (`RouterLive({ base })`)

- [x] Initial URL seed: with `location.pathname = "/weft/docs/a"` and
      `base: "/weft"`, `currentMatch` resolves the `/docs/a` route.
- [x] `navigate("/docs/b")` (canonical, base-less) pushes History URL
      `"/weft/docs/b"` and `currentMatch`/`match.url` reflect `"/docs/b"`.
- [x] Link interceptor: a click on `<a href="/weft/docs/b">` is intercepted
      and navigates to the `/docs/b` route (SPA, no full load).
- [x] Link interceptor: a same-origin `<a href="/outside">` (not under base)
      is **not** intercepted (falls through to the browser).
- [x] `popstate` resync strips the base before matching.
- [x] Location outside the base (e.g. `"/other"`) yields a no-match (404
      route) rather than a crash.
- [x] Omitted/`""`/`"/"` base → byte-for-byte the current behavior.

### Server (`RouterServer.render({ url, base })`)

- [x] `render(App, { url: "/weft/docs/a", base: "/weft" })` renders the
      `/docs/a` route with status 200.
- [x] `render(App, { url: "/weft", base: "/weft" })` renders the root route.
- [x] `render(App, { url: "/outside", base: "/weft" })` renders the not-found
      page with status 404.
- [x] Omitted base → current behavior (all existing tests unaffected).

## Technical requirements & constraints

- The router must not read `import.meta.env` — the base is always an explicit
  option (library, not app, code).
- Canonical invariant: every URL stored in the router (`urlRef`, `match.url`,
  `NavState.to`) is base-less; the base exists only in `window.location` /
  History entries / incoming request URLs.
- `href()` and `navigation.ts` helpers are unchanged — they already operate on
  canonical URLs.
- No behavior change when `base` is absent (default `""`).

## Out of scope

- Prefixing app-rendered `href` attributes (app concern; see
  `website/prerender.specs.md`).
- Base support for `RouterServer.webHandler` / the rpc endpoint (`/_eui/rpc`)
  — the static-site use case has no rpc; revisit if an SSR app needs a base.
