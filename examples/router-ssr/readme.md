# router-ssr

A small **e-commerce shop**, server-rendered and client-hydrated, built on
`@weftui/router`. It is a multi-file example: routes, components, and data are
split across `src/pages`, `src/components`, and `src/data`, then assembled in a thin
`src/app.ts`.

## Overview

The shop is three pages under one persistent `Shell` layout, sealed with
`Router.router(...)` into a single `RouterDef` (`App`):

- **`/`** (`pages/landing.ts`): a static landing page with a featured grid.
- **`/products`** (`pages/listing.ts`): a product listing with a `?sort=` **query
  param**; changing the sort re-renders the grid in the new order.
- **`/products/:id`** (`pages/product-detail.ts`): a product detail page with an
  `:id` **path param** and a refetchable **`Boundary.rpc`** resolving per-product
  live stock through the `GetStock` rpc. An unknown id raises a dynamic 404.

It shows **both** ways a node reads the live match: the leaf pages take **handler-arg
props** (`({ path, query }) => …`, where the router passes the decoded match straight in),
while the `Shell` layout keeps **dependency injection** (`yield* Router.Outlet`). The
same `App` drives both sides:

- **Server** (`entry-server.ts`): `RouterServer` matches the request URL, renders
  the matched page to hydratable HTML inside a typed document shell, and responds
  with `text/html` (HTTP 404 for unmatched routes or a page that calls `notFound()`).
- **Client** (`entry-client.ts`): `WeftApp.make(RouterLive(App, { rpc: { group: StockRpcs }
}))` provides the scoped `Router` (it owns the popstate listener + link interceptor)
  **and** the network rpc client backing `Boundary.rpc`. The app runtime owns its
  lifetime, built lazily on first hydrate and released only at `WeftApp.dispose`.
  `Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), root))` adopts the server DOM in
  place, then takes over navigation via the History API.

## Problem

A shop needs one description of "URL → which page" that works on both the server
(match a request, render hydratable HTML) and the client (match `location`, swap
pages reactively).

That description must also keep the unchanged `Shell` mounted across navigations,
read typed path/query params, and load live data (stock) server-side without
shipping the back-office service to the browser.

## Solution

A universal route tree compiled once into flat leaf descriptors. The server renders
the matched chain to a string; the client renders the same `RouterApp` and swaps
pages by re-emitting only the outlet levels whose keys changed, so the `Shell` is
never re-rendered. The catalog is split by volatility:

- **`data/products.ts`** is **isomorphic**: plain data and pure helpers (`Product`
  schema, `PRODUCTS`, `getProduct`, `sortProducts`, `formatPrice`). It has no Effect
  and no server-only tag, so it is safe in the client bundle.
- **`data/inventory.ts`** holds the **`GetStock` rpc contract** (`StockRpcs`, pure
  Schema, shared with the client) alongside the **server-only** `Inventory` service
  and its handler Layer `StockLive`. Only the contract is importable client-side; the
  handler Layer (and the inventory source it reads) is never bundled into the client.

## How It Works

- `app.ts` (side-effect-free) imports the three page routes and the `Shell`, then
  seals `App = Router.router(Router.layout({ component: Shell }, [...]), { notFound })`.
- **Path param**: `/products/:id` declares `path: { id: Schema.NumberFromString }`,
  so the leaf receives `path.id` already decoded to a `number`. `getProduct(id)`
  returning `undefined` calls `notFound()` for a dynamic 404.
- **Query param**: `/products` declares `query: SortOrder` (`?sort=price-asc |
price-desc | name`). The leaf reads the decoded `query` from its handler-arg props
  and renders the catalog sorted by `query.sort`. The router keys a leaf by its full
  URL, so a query-only navigation (a sort link or `patchQuery`) re-invokes the leaf
  with the new query and the grid re-sorts. (For a reactive reader that updates
  _without_ re-rendering the leaf, see `Router.queryStream` in
  `navigation.browser.test.ts`.)
- **Type-safe links**: `href(productRoute, { path: { id } })` and
  `href(productsRoute, { query: { sort } })` build URLs checked against each route's
  schema. The same-origin interceptor turns clicks into SPA navigations, the card
  `View` links included, which exercise the detail page's client-first boundary mount.

### `Boundary.rpc` live stock + refetch

`/products/:id` wraps a `Boundary.rpc` over the `GetStock` rpc. There is **no
co-located `load`, no `provide`, no per-product boundary id**: the rpc **tag** is the
stable identity and its **payload** (`{ id }`) the typed input. The data source is
the ambient rpc client, env-specific:

- **SSR** resolves `GetStock` **in-process** over the server handler Layer and inlines
  the encoded stock as a `<script type="application/json">` payload.
- **Hydrate** replays that inline payload to seed the resource, with no extra request.
- **Refetch** (the **Refresh stock** button) re-resolves `GetStock` over
  `POST /_eui/rpc`, re-running the handler **on the server** with the product id as
  payload, then patches the `#stock` region **in place** (no remount, no flash).
- **Client-first mount**: navigating in from the listing has no SSR payload, so the
  boundary shows its `fallback`, forks the same rpc call, and swaps the live stock in.

Both former v1 constraints (`plans/router-boundary-constraints.md`) are now lifted:
client-first SPA mount works (the `View` links are plain SPA navigations), and refetch
carries the product id as a real payload (one `GetStock` rpc, not a per-entity id).

The co-located `refetch.browser.test.ts` drives the full round-trip in a real
browser, delegating the same-origin `POST /_eui/rpc` to `RouterServer.toWebHandler`.

### `effect/unstable/httpapi` + `effect/unstable/rpc` are the spine

The sealed `App` owns its authoritative `HttpApi` (`App.httpApi`, built by
`buildHttpApi` during `Router.router(...)`): a `pages` group with a GET endpoint per
leaf carrying each leaf's path/query schemas. Both sides read this single source of
truth for page routing: the server dispatches through `HttpApiBuilder`; the client
derives a real `HttpApiClient` from the same `App.httpApi`. Server data rides a
separate spine: the `StockRpcs` `RpcGroup`, served at `POST /_eui/rpc` and called by
the in-process (SSR) / network (client) rpc client wired into `RouterServer` /
`RouterLive`.

### Programmatic navigation

Beyond plain `h.a({ href })` links, `@weftui/router/client` exposes typed
programmatic navigation: `navigate(ref, args)`, `push` / `replace`, `back` /
`forward`, and `setQuery` / `patchQuery`. It also exposes reactive `Router.paramsStream` /
`Router.queryStream` accessors that update in place across query-only changes. The
co-located `navigation.browser.test.ts` drives all of these in a real browser.

## Running

```bash
vp run dev          # from the repo root or this folder, http://localhost:3200
vp run test:browser # app + navigation + listing + refetch browser tests
```

## When to Use

Reach for `@weftui/router` when you need universal nested routing with SSR +
hydration: deep route trees, persistent layouts, type-safe params/queries, and
`location`-driven page swaps. For server-loaded data the client can refresh after
hydration (live stock, prices), define an rpc in the app's `RpcGroup` and wrap it in
a `Boundary.rpc` (see `/products/:id`): SSR inlines the payload, hydrate replays it,
and `resource.refetch` (or a client-first SPA mount) re-resolves the rpc over
`POST /_eui/rpc`. For purely client-side async work with no server handler, reach for
`Boundary.suspend` instead.
