# `@weftui/router` — Specifications

## Overview

`@weftui/router` is a universal (server + client) nested router for Weft.
It maps a URL to a rendered `Node` tree on both sides:

- **Server** matches an incoming request path, builds a fixed `Router` for that
  request, renders the matched nested page to hydratable HTML, and responds with
  `text/html` (HTTP 404 for not-found).
- **Client** matches `window.location`, swaps pages reactively via the History
  API, and persists unchanged ancestor layouts across navigations.

The package mirrors `packages/dom`: a shared (universal) root, a `./client`
entry, and a `./server` entry.

### Route model — component-as-handler

A route's **component is its handler**. The endpoint carries only the routing
contract (path-param schema + query schema). There is no per-route success-data
schema / loader — server-only data stays with `Boundary.rpc` (backed by the app's
merged `RpcGroup`), and client-side async with `Boundary.suspend`.

The component is also its **loader**: on client navigation the matched leaf's
component effect resolves **before** the commit
(`src/resolve-before-commit.specs.md`), so the previous page stays mounted
through both the chunk and the data window and the swap is atomic. That yields a
dual model with no extra API — a `yield*` in the component body is
commit-blocking, while an `Effect`/`Stream` placed as a child node streams in
after the commit. Still no per-route loader/schema.

### Authoring surface — explicit nested route tree

The tree is authored with the namespaced `Router.layout(...)` and
`Router.route(...)` combinators and sealed with `Router.router(...)` (mirroring
the namespaced core surface — `Component.gen`, `Boundary.catchTag`, `h.div`). The
`Router` symbol is both the service `Context.Service` (`yield* Router`) and the
authoring namespace; the two roles merge by declaration. The tree is the
**authoring** surface; the compiled `HttpApi` is the **operational** source of
truth. `compile` builds it (via `buildHttpApi`) and `makeRouter` stamps it onto
`RouterDef.httpApi`, where it is the single definition the server dispatch and the
client matcher both read from — so both sides agree on paths and schemas. `HttpApi`
is never the authoring surface.

Every combinator is **fully typed**: a route's and a layout's `component` slot is
a thunk `() => Node<E, R>` (authored with `Component.make` / `Component.gen`, or a
plain `() => Effect.gen(…)`) that the router invokes at render time — mirroring the
`notFound: () => Node` slot, and deferring construction so `href(…)` runs after the
tree is compiled. Those channels aggregate up so the sealed `RouterDef` — and
`RouterApp(def)` — surface a concrete `Node` type with **no `Node<any, any>`** on
the authoring surface.

### Dependency-injection surface

The outlet and the current match's params/query are delivered by **dependency
injection**, not callback arguments:

- **`Router.Outlet`** — a `Context.Service` whose value is the node to splice. A
  layout's `component` thunk reads it with `const outlet = yield* Router.Outlet`
  and places `[outlet]` like an `h`-style child; the server document shell thunk
  does the same to place the app. It is typed **opaque** as `Node<never, never>` so
  splicing adds nothing to
  the reader's local channels — the subtree's real `E`/`R` are aggregated
  structurally by `Router.layout` / `Router.router`. The router discharges it via
  `Effect.provideService(node, Router.Outlet, …)` at render time, so it is
  **excluded** from a layout's (and the document's) aggregate requirement channel.
- **`Router.params(fields)` / `Router.query(fields)`** — accessors that read the
  **live match** (`yield* Router` → `currentMatch.get`) and pick the requested
  `fields` keys from the decoded path/query, returning the typed values
  **directly** — the matcher already decoded them against the leaf's full schema,
  so there is no re-validation. They fail with a tagged **`RouterParamsError`**
  (`source: "path" | "query"`, plus the requested `keys`) **only when no route
  matches** (`NotFound`); a matched route that simply lacks a requested key reads
  it as `undefined`. Any component — not just the leaf — may read them; the
  `RouterParamsError` bubbles to the app node's `E` (a user may
  `Boundary.catchTag("RouterParamsError", …)`).

### Handler-arg props surface (leaf components)

In addition to the DI accessors, a **leaf** `component` may declare typed
handler-arg props and receive the live match's decoded data directly:

- **`RouteHandlerProps<Path, Query>`** — `{ path: FieldsType<Path>; query:
FieldsType<Query> }`. The router passes `{ path, query }` into the leaf slot at
  render time (`outlet.ts` `renderLevel`); the slot's `path`/`query` are inferred
  from the route's `path`/`query` fields (the `makeRoute` props-form overload), so
  `component: ({ path, query }) => …` is fully typed with no annotation.
- This is **leaf-only** — layouts and deeper nodes can't take handler args, so they
  keep DI (`Router.params` / `Router.query` / `Router.Outlet`). A zero-arg thunk or
  a `Component.make` / `Component.gen` leaf ignores the props and reads via DI; both
  forms remain valid.

## Module map

| Module                        | Side   | Responsibility                                                                  |
| ----------------------------- | ------ | ------------------------------------------------------------------------------- |
| `src/route-tree.ts`           | shared | `route()` / `layout()` combinators (exposed as `Router.*`) + node types         |
| `src/compile.ts`              | shared | walk the tree once into flat leaf descriptors + build the `HttpApi` spine       |
| `src/matcher.ts`              | shared | compile patterns to regex, `match(path)` → leaf + decoded params/query          |
| `src/href.ts`                 | shared | type-safe URL builder from a leaf's schemas                                     |
| `src/router-service.ts`       | shared | `Router` `Context.Service` + `Router.{route,layout,router,Outlet,params,query}` |
| `src/errors.ts`               | shared | `RouterNotFound` + `RouterParamsError` tagged errors + `notFound()` helper      |
| `src/outlet.ts`               | shared | `RouterApp` / `outletNode` — nested page UI from `Router.currentMatch`          |
| `src/client/router-live.ts`   | client | `Router` `Layer` backed by the History API                                      |
| `src/client/link.ts`          | client | global same-origin click interceptor → SPA navigation                           |
| `src/client/navigation.ts`    | client | typed `navigate`/`push`/`replace`/`back`/`forward`/`setQuery`/`patchQuery`      |
| `src/server/router-server.ts` | server | per-request server `Router` + render + 404                                      |

## Authoring API

```ts
// A leaf page. `component` reads the match either via handler-arg props
// (`({ path, query }) => Node`) or via DI (`Router.params` / `Router.query`).
Router.route(segment, { path?, query?, component })

// A layout wrapping an outlet. `component` is a ComponentSlot splicing Router.Outlet.
// A layout owns no path/segment — it is purely UI nesting.
Router.layout({ component }, children)

// Seal the tree into a RouterDef.
Router.router(root, { notFound })
```

- `segment` is a **route-only** argument, **relative to the parent** and may
  contain `:name` path-param placeholders (e.g. `"users/:id"`). A leading/trailing
  `/` is tolerated. Each child route carries its **full relative path** down to the
  leaf (e.g. `"users/:id/settings"`).
- **Layouts have no `segment` or `path`** — they only wrap an outlet (purely UI
  nesting); all path structure lives on routes. A layout that needs a param reads
  it via `Router.params`.
- `path` / `query` are `Schema.Struct.Fields` (record of name → `Schema`) declared
  **only on routes**. The compiler covers every `:name` on the route's pattern in
  the leaf's `pathSchema`, defaulting to `Schema.String` when a placeholder has no
  declared field. Query fields are all optional by default.
- Both a page's and a layout's `component` is a **`ComponentSlot`** — a callable
  producing a `Node`, passed **uncalled**: a `Component.make(() => …)` /
  `Component.gen(function* () { … })` component, or a plain `() => Node` thunk (e.g.
  `() => Effect.gen(…)`). The router invokes it per render: a page reads
  `Router.params` / `Router.query`; a layout splices `yield* Router.Outlet` wherever
  the child level should appear. Its `E`/`R` channels are recovered (via `SlotNode`)
  and propagate up the tree. The callable form matches `notFound` and defers `href`
  resolution to render time.

## Acceptance criteria

### Tree compilation (`compile.ts`)

- **C1** `compile(def)` returns one **leaf descriptor** per `route()` in the
  tree, in document order.
- **C2** Each leaf's `fullPathPattern` is the `/`-joined concatenation of the
  **route** segments on its branch (layouts contribute none), normalized to a
  single leading `/` and no trailing `/` (root leaf ⇒ `/`).
- **C3** Each leaf's `pathSchema` is a `Schema.Struct` merging the path fields
  declared at **every level down its branch** (leaf wins on key collision).
- **C4** Each leaf's `querySchema` is the `Schema.Struct` of its own query
  fields (empty struct when none).
- **C5** Each leaf carries its `layoutChain`: the ordered list of ancestor
  layouts (root → … → parent) plus the leaf component, used to build the nested
  UI. Each layout's dedupe `patternPrefix` is the **longest common path prefix of
  the leaves in its subtree** (so an ancestor layout persists across navigation and
  re-renders only when a param shared by all its leaves changes).
- **C6** Every `:name` placeholder in a **route** segment on the branch has a
  corresponding key in `pathSchema` (defaulted to `Schema.String` if not
  declared).

### Matching (`matcher.ts`)

`match(def, url)` / `compileMatchers(def)` take the whole {@link RouterDef}. The
patterns and path/query schemas are read from the authoritative `def.httpApi`
`"pages"` endpoints — the **single source of truth** the server dispatch also reads
— and each match's render-metadata `leaf` is resolved from `def.compiled` by endpoint
`id` (the `httpApi ↔ compiled` join key). Matching itself stays **local** (SPA
URL→leaf): platform has no client-side "match this URL locally" utility, so the regex
matcher is fed from the HttpApi definition rather than running a platform server in the
browser (refactor _Feasibility constraint_). The compiled entries are memoized per
`RouterDef`.

- **M0** `compileMatchers` sources every entry's path template + `pathSchema`/
  `querySchema` from a `def.httpApi` `"pages"` endpoint, joining to the compiled
  leaf by endpoint `id`; it does **not** read `Compiled.leaves` for patterns/schemas.
- **M1** A static pattern (`/about`) matches exactly that path and nothing else.
- **M2** A path-param pattern (`/users/:id`) matches `/users/42`, capturing
  `id = "42"` (raw), then decoded via `pathSchema` (e.g. to `number`).
- **M3** Trailing slashes are normalized: `/users/42` and `/users/42/` match the
  same leaf.
- **M4** Query strings decode through `querySchema` (`Schema.decode`); absent
  optional keys are omitted/undefined.
- **M5** No matching leaf ⇒ `match` returns `Option.none()` (router falls back to
  the not-found page).
- **M6** More specific (static) segments win over param segments at the same
  position (e.g. `/users/new` beats `/users/:id` when both exist).
- **M7** A path-param decode failure ⇒ no match (`Option.none()`), not a thrown
  error. Note: Effect 4's `Schema.NumberFromString` maps a non-numeric string to
  `NaN` (decode _succeeds_) rather than failing, so a numeric `:id` that should
  404 on non-numbers needs an explicit finite check, e.g.
  `Schema.NumberFromString.pipe(Schema.check(Schema.makeFilter((n) => (Number.isFinite(n) ? undefined : "expected a finite number"))))`;
  `"abc"` then fails decode and the leaf is a no-match.
- **M8** A query decode failure (a **declared** query field whose value violates
  its schema) ⇒ no match, like a path decode failure — not a thrown error (subject
  to the same `NumberFromString` caveat above). Excess/undeclared query keys are
  ignored by `Schema.Struct`, so only declared-but-invalid values fall through.

### `href` (`href.ts`)

- **H1** `href(leafRef, { path, query })` encodes path params into the pattern
  (`/users/:id` + `{ id: 42 }` ⇒ `/users/42`).
- **H2** Query values encode through the query schema into a search string,
  sorted by key for stability; absent optional values are omitted.
- **H3** `href` round-trips with `match`: `match(href(ref, args))` yields back
  the same leaf and `args`.
- **H4** Path params are **required** in `href`'s argument type; query is
  optional when every query field is optional.

### Outlet persistence (`src/outlet.ts`)

- **O1** `RouterOutlet` renders the nested chain for the current match: each
  layout wraps the next level's outlet, the leaf renders the page.
- **O2** Each layout level is a reactive **stream child** keyed by
  `(pattern + the param values that level depends on)` and `dedupe`d, so an
  unchanged ancestor layout stays mounted across a navigation that only changes a
  deeper level.
- **O3** Navigating to a sibling under the same layout swaps **only** the inner
  outlet; the layout DOM node identity is preserved.

### Server render + 404 (`server/router-server.ts`)

Server dispatch runs **through `effect/http-api` `HttpApiBuilder`** — the platform layer owns
request→leaf matching and path/query decode. The handler builds a dispatch-only
**server-local** `HttpApi`: `def.httpApi` (pristine — the client and S4 read it)
extended with a second `"fallback"` group holding one catch-all `"*"` endpoint.
`HttpApiBuilder.group("pages", …)` registers one handler per leaf `id` receiving the
platform-decoded `{ path, urlParams }`; the `"fallback"` handler serves any URL no
leaf claims (platform ranks static/param routes above the `"*"` wildcard). Status is
sourced from this pipeline — there is **no render-time status side-channel**
(`RouterApp` no longer takes an `onNotFound` callback; `RouterAppOptions` is removed).

- **S1** `RouterServer.render(def, { document, url })` dispatches `url` through the
  builder, builds a fixed-match server `Router` from the platform-decoded
  `{ path, urlParams }`, injects the outlet into the `document` shell via
  `Router.Outlet`, and renders it via `renderToStringHydratable`, returning
  `{ html, status: 200 }`. `document` is a `ComponentSlot` (the same callable form
  as the route/layout `component` slot — a plain `() => Node` thunk or a
  `Component.make` / `Component.gen` component); the router provides both
  `Router.Outlet` (the app, per request) and `Router`, so the shell may use either.
  Platform-decoded path params are readable by the page via `Router.params`.
- **S2** `status` is `404` for both not-found shapes, sourced from the platform
  pipeline. **No-match** routes to the catch-all handler, which renders the not-found
  page **inside** the level-0 reactive region (markers present) — matching the client
  outlet for an unmatched URL. A **page-raised `RouterNotFound`** surfaces from the
  matched leaf handler (the server omits `RouterApp`'s boundary so the failure
  propagates), and the page renders **directly** in the shell (no outlet markers) —
  matching the client's internal not-found boundary fallback. Both align for hydration.
- **S2a** `RouterServer.toWebHandler(def, { document })` returns the platform
  `(Request) => Promise<Response>` directly (memoized per `(def, document)`); a
  matched route replies `text/html` 200, a no-match replies the not-found page at 404.
- **S3** The server `Router`'s `navigate` is a no-op-ish failure path (navigation
  is a client concern); `currentMatch` is the fixed match for the request.
- **S4** `makeRouter(...)` stamps `RouterDef.httpApi` — built by `buildHttpApi` from
  the compiled leaves — with one `"pages"` group whose endpoints are GET endpoints,
  one per leaf, named by the leaf `id` (the `httpApi ↔ compiled` join key), at each
  leaf's `fullPathPattern`, with `params: pathSchema`, `query: querySchema`,
  a `Schema.String` success, and a `RouterNotFound → 404` error. The leaf
  `pathSchema`/`querySchema` encoded sides are typed string-encodeable, so the
  `params`/`query` bridge carries **no `as any`** casts.

### Streaming SSR (`RouterServer.toStreamingWebHandler`)

```ts
RouterServer.toStreamingWebHandler(def: RouterDef, options: Options): (request: Request) => Promise<Response>
```

A **separate function** from `toWebHandler` (not a flag): same `Options` shape
(`document`, optional `rpc`), memoized separately from the buffered handler.
`RouterServer.render` and `RouterServer.toWebHandler` stay fully buffered —
changing them is explicitly out of scope.

The handler adopts the **shell-gate** model (Next.js parity), built on the dom
package's shell-split API
(`packages/dom/src/server/streaming-shell.specs.md`): per matched leaf, the
document is rendered via `renderToHydratableShell`; the buffered `shell` (the
full document with Suspense fallbacks inline) decides the HTTP status _before_
any bytes flush, then `<!DOCTYPE html>\n` + shell goes out as the first body
chunk and the Suspense patch chunks are streamed after it
(`HttpServerResponse.stream`), headers `text/html`.

Status semantics:

| Failure shape                                                                   | When decided | Status  | Body                                                                                                |
| ------------------------------------------------------------------------------- | ------------ | ------- | --------------------------------------------------------------------------------------------------- |
| Platform no-match (no leaf claims the URL)                                      | before flush | **404** | catch-all → `notFound` page, shell-buffered (same as today's S2)                                    |
| `RouterNotFound` raised during the shell walk                                   | before flush | **404** | caught (existing S2 `renderLeaf` semantics) → `notFound` page rendered direct — nothing flushed yet |
| `RouterNotFound` (or any unhandled cause) inside `Boundary.suspend` after flush | after flush  | **200** | patch swaps in the router's `notFound()` page + injects `<meta name="robots" content="noindex">`    |
| Other shell errors                                                              | before flush | **500** | unchanged platform behaviour                                                                        |

The late-404 row (Next.js soft-404 pattern) is wired by providing the dom
package's `SuspenseFailureHandlerTag` to the render:
`handle = (cause) => isRouterNotFound(cause) ? Option.some({ content: <compiled notFound page>, markNoindex: true }) : Option.none()` —
non-`RouterNotFound` causes keep the dom default (swallowed, fallback
persists, per `render-to-stream.specs.md` AC-ST8).

- **SW1** Same status table as above; each row is an acceptance criterion.
- **SW2 (first-chunk timing)** The shell (status + `<!DOCTYPE html>\n` + full
  document with fallbacks) flushes before any pending `Boundary.suspend`
  child resolves — a slow suspended child never delays the first chunk.
- **SW3** The response stream terminates after all patches have been emitted
  (or stays open while a boundary never resolves, per dom AC-SS6 — connection
  timeouts are the HTTP server's concern).
- **SW4** A page with no `Boundary.suspend` produces a single-chunk body,
  byte-identical (modulo chunking) to `toWebHandler`'s buffered body for the
  same request.
- **SW5** Consumer disconnect (response stream cancelled) interrupts pending
  Suspense resolution fibers via the render scope
  (`streaming-shell.specs.md` AC-SH6).
- **SW6** `Boundary.rpc` **blocks** the shell (resolved inline during the
  walk, never patched) — documented, not changed; a slow rpc delays the first
  chunk.
- **SW7** `POST /_eui/rpc` delegation is unchanged: when `rpc` is configured
  the path is claimed by the rpc web handler exactly as in `toWebHandler`;
  without `rpc` it falls through to page dispatch.

- **SW8 (soft-404 hydration)** Hydrating a streamed soft-404 document
  (`hydrate(RouterApp(def), root)` after the late-404 patch has executed)
  yields the `notFound` page via `RouterApp`'s internal
  `Boundary.catchTag("RouterNotFound")` — the same semantics as client-side
  navigation (N3). The late-404 substitute carries
  `failureReplay: Schema.encodeSync(RouterNotFound)(failure)`, so its patch is
  the failure-replay variant (`streaming-shell.specs.md` AC-FH7): retained
  suspense markers plus a `data-weft-suspense-failure` sentinel. On hydrate
  the sentinel is replayed to the boundary (`hydrate.specs.md` AC-H14): no
  `HydrationMismatchError` is raised, the failed loader is **not** re-run,
  and after the interactivity barrier the boundary extent is swapped to the
  client-rendered `notFound` page. The swap is a single, deterministic
  visible transition: the server soft-404 DOM (page layout chrome with the
  notFound UI inside the suspense region) is replaced by the canonical client
  shape (the notFound page as the whole outlet), so the layout chrome from
  the server snapshot disappears — flash-free in-place adoption is impossible
  by construction since the two shapes differ. The `noindex` robots meta
  lives in `document.head` and is untouched by the swap.

Out of scope for this feature: progressive shell flushing (the shell is
atomic), streaming for `RouterServer.render` (string API stays buffered), and
a `redirect()`-after-flush analog.

### Dependency injection (`router-service.ts`, `outlet.ts`)

- **D1** A layout's `component` thunk reads its outlet via `yield* Router.Outlet`; the router
  provides it per render, and the layout's aggregate `R` (and the sealed app's `R`)
  **excludes** `Router.Outlet`.
- **D2** `Router.params(fields)` returns the live match's decoded path params for
  the requested `fields`, typed as `Schema.Struct.Type<fields>`; `Router.query`
  does the same for the query. Both are readable from **any** component, not just
  the leaf.
- **D3** `Router.params` / `Router.query` return the live match's already-decoded
  values **directly** (no re-validation) and fail with a `RouterParamsError`
  (`source: "path" | "query"`, carrying the requested `keys`) **only when no route
  is matched** (`NotFound`). The error bubbles into the app node's aggregate `E`.
  A matched route lacking a requested key reads it as `undefined`.
- **D4** A layout declares **no** `path`; a `:name` introduced by a layout segment
  is keyed on the leaf's `pathSchema` (defaulted to `Schema.String`), and a layout
  that needs the value reads it via `Router.params`.
- **D5** A **leaf** `component` may declare `RouteHandlerProps<Path, Query>` props;
  the outlet passes the live match's decoded `{ path, query }` into the slot at
  render time. The props' `path`/`query` are inferred from the route's
  `path`/`query` fields. Layouts/deeper nodes keep DI (handler args are leaf-only);
  a zero-arg or `Component` leaf ignores the props and reads via `Router.params`.

### Not-found (`errors.ts`)

- **N1** `notFound()` returns an `Effect` failing with `RouterNotFound`.
- **N2** `RouterNotFound` is exported so a user can place a
  `Boundary.catchTag("RouterNotFound", …)` to override the fallback for a subtree.
- **N3** The router config's `notFound` page renders for both "no route matched"
  and an uncaught `RouterNotFound` raised by a page.

### Link interception (`client/link.ts`)

- **L1** A plain `h.a({ href })` to a same-origin, route-matching URL performs
  SPA navigation (no full page load) when clicked.
- **L2** Modified clicks (ctrl/meta/shift/alt, non-left button), `target=_blank`,
  `download`, external origins, and non-matching hrefs fall through to a full
  load (interceptor does not call `preventDefault`).
- **L3** The interceptor is attached for the lifetime of the `Router` layer scope
  and detached on teardown.

### Client runtime — derived `HttpApiClient` (`client/router-live.ts`)

- **CL1** `RouterLive(def, options?)` derives a real `HttpApiClient` from
  `def.httpApi` (over `FetchHttpClient`) and exposes it on the `Router` service as
  `httpApiClient: Option.some(client)` for network work (route prefetch, foundation
  for future loaders/data). The server's fixed-match `Router` exposes
  `Option.none()` — the server is itself the origin.
- **CL2** The client `baseUrl` is configurable via `options.baseUrl`, defaulting to
  the document's same origin (`window.location.origin`).
- **CL3** Deriving the client does **not** change SPA resolution: `currentMatch` and
  the link interceptor still resolve URLs through the **local** {@link match}er
  (which reads the same `def.httpApi`), so both the local matcher and the network
  client agree because they read one definition.

### Reactive accessors (`router-service.ts`)

`Router.paramsStream(fields)` / `Router.queryStream(fields)` are the **reactive**
counterparts to the snapshot `Router.params` / `Router.query`. Each returns an
`Effect<Subscribable<FieldsType<fields>>, never, Router>` derived from
`currentMatch.changes`, so a component can render `[(yield* Router.queryStream(q)).changes]`
and update **in place** without the outlet remounting the leaf.

- **R1** `paramsStream(fields)` / `queryStream(fields)` resolve (via `yield* Router`)
  to a `Subscribable` whose `get` reads the live match's decoded path/query for the
  requested `fields` (same picked values as `Router.params` / `Router.query`).
- **R2** The `Subscribable.changes` stream **re-emits** the picked values on every
  `currentMatch` change (every navigation), including query-only changes that keep
  the same leaf mounted (where a snapshot read would not update).
- **R3** Unlike the snapshot accessors, the reactive form is **resilient on
  `NotFound`**: it yields the empty subset (each requested field `undefined`) rather
  than failing, so the stream stays live across navigations to/from unmatched URLs.

### Client navigation (`client/navigation.ts`)

Programmatic, type-safe navigation built on the `Router` service and the type-safe
`href` builder, mirroring the History API the client `Router` layer is backed by.

- **NV1** `navigate(ref, args, options?)` builds the URL via `href(ref, args)` (so it
  round-trips with `match`) and navigates; `args` follows `href`'s requiredness
  (`path` required when the route has params, `query` optional when all query fields
  are optional). Returns `Effect<void, never, Router>`.
- **NV2** `push(to)` / `replace(to)` navigate to a raw `path + search` string;
  `replace` sets `options.replace` so the client layer uses `history.replaceState`
  (no new history entry) while `push` uses `history.pushState`.
- **NV3** `back()` / `forward()` step through History via `history.go(-1)` /
  `history.go(1)`; the client layer's `popstate` handler resyncs `currentMatch`.
  They require no service (only `window.history`).
- **NV4** `setQuery(query, options?)` replaces the current route's query entirely;
  `patchQuery(partial, options?)` merges into the current decoded query. Both
  re-encode through the **matched leaf's `querySchema`**, preserve the path (so the
  leaf — and any `queryStream` reader — stays mounted), and are a **no-op** when no
  route is currently matched.
- **NV5** The client `Router` service's `navigate(to, options?)` honours
  `options.replace` (`history.replaceState` vs `pushState`); the server's fixed-match
  `Router` ignores it (navigation is a client concern).

### Param / query decode on both sides

- **P1** On the server, the matched leaf's `path`/`query` decode once per request
  and are exposed via the fixed `Router` and the page `component` args.
- **P2** On the client, navigation re-decodes `path`/`query` for the new match
  and re-renders the affected outlet level(s) only.
- **P3** A server-only dependency referenced in client (`render`) code is rejected
  by `AssertNoServerOnly` at the `hydrate` call site (inherited from
  `@weftui/dom/client`).

## `Boundary.rpc` interplay (rpc data foundation)

`Boundary.rpc` resolves through the ambient `AppRpcClientTag` seam (defined in
`@weftui/core`), which the router provides on **both** sides over the app's
merged `RpcGroup` (passed as `RouterServer`/`RouterLive`'s **optional**
`rpc: { group, handlers }` option):

- **Server** (`RouterServer`): provides an **in-process** flat client
  (`RpcTest.makeClient(group, { flatten: true })` over the handler Layer, no
  protocol/serialization) into the SSR render layer, so SSR `Boundary.rpc` regions
  resolve in-process and inline their payload. The combined web handler delegates
  `POST /_eui/rpc` to an `RpcServer.toWebHandler(group, { layer: handlers + JSON })`,
  and every other path to the page `HttpApi` handler.
- **Client** (`RouterLive`): provides a **network** flat client
  (`RpcClient.make(group, { flatten: true })` over `RpcClient.layerProtocolHttp`)
  posting to `<origin>/_eui/rpc`.

This makes all three `Boundary.rpc` paths work end to end:

- **Initial SSR navigation** — server resolves in-process + inlines the payload;
  the client replays during `hydrate` (no rpc call).
- **Refetch** — the hydrated region's `Resource.refetch` calls the network client
  (`POST /_eui/rpc`) and patches in place.
- **Client-first navigation** — SPA-navigating into a page with a `Boundary.rpc`
  (no SSR payload) renders the boundary's `fallback`, forks a network rpc call, and
  swaps in the live subtree. This was a documented `Boundary.server` limitation; the
  rpc seam dissolves it (the same client serves SSR-replay, refetch, and mount).

A router-less mount (no `RouterLive`/`RouterServer`) has no `AppRpcClientTag`, so a
`Boundary.rpc` mount fails with a descriptive error (see `@weftui/dom/client`).

The `rpc` option is **optional** on both sides — an app with no `Boundary.rpc`
omits it entirely:

- **Server** (`RouterServer`): without `rpc`, no rpc web handler is mounted —
  `POST /_eui/rpc` falls through to page dispatch (the catch-all 404) — and the
  SSR render layer provides a stub `AppRpcClientTag` whose `call` fails with a
  descriptive "no `rpc` option was passed to RouterServer" error, so a stray
  `Boundary.rpc` surfaces the misconfiguration instead of crashing.
- **Client** (`RouterLive`): without `rpc` (the whole options argument may be
  omitted), no network rpc client is built; the provided `AppRpcClientTag` is the
  same descriptive-failure stub.
