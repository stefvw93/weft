---
title: Routing
order: 4
section: how-to
description: "@weftui/router: universal nested routing, Router.route / Router.layout / Router.router, type-safe href, layouts, and programmatic navigation."
---

# Routing

`@weftui/router` is a universal (server + client) nested router for Weft. It maps a URL to a rendered `Node` tree on both sides:

- **Server**: matches an incoming request path, renders to hydratable HTML.
- **Client**: matches reactively via the History API.

The package exports a shared (universal) root, a `./client` entry, and a `./server` entry.

```bash
npm install @weftui/router
```

## The mental model

A route's **component is its handler**. A page is a component that renders, and its `component` slot is invoked at render time.

```typescript
const homeRoute = Router.route("", { component: Home });
const aboutRoute = Router.route("about", { component: About });
const userRoute = Router.route("users/:id", {
  path: { id: Schema.NumberFromString },
  component: ({ path }) => h.h1(`User ${path.id}`),
});

const App = Router.router(Router.layout({ component: Shell }, [homeRoute, aboutRoute, userRoute]), {
  notFound: () => h.h1("404"),
});
```

You author a **nested route tree** with namespaced combinators and seal it once:

| Combinator                                            | Builds                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `Router.route(segment, { path?, query?, component })` | A leaf page.                                                     |
| `Router.layout({ component }, children)`              | A layout that wraps an outlet (purely UI nesting; owns no path). |
| `Router.router(root, { notFound })`                   | Seals the tree into a `RouterDef`.                               |

The tree is the source of truth. The same sealed `RouterDef` drives both server and client.

## Authoring routes

Every **`ComponentSlot`** produces a `Node` when called. Use [`Component.make` / `Component.gen`](./author-components.md) (or a plain `() => Node` thunk). The router invokes it at render time, which lets `href(…)` resolve after the tree is compiled.

```typescript
import { Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { Schema } from "effect";

const About = Router.route("about", {
  component: Component.make(() => h.h1("About")),
});

const User = Router.route("users/:id", {
  path: { id: Schema.NumberFromString },
  component: Component.gen(function* () {
    const { id } = yield* Router.params({ id: Schema.NumberFromString });
    return yield* h.div(`User ${id}`);
  }),
});
```

- **`segment`** is relative to the parent and may contain `:name` path-param placeholders (e.g. `"users/:id"`). A leading/trailing `/` is tolerated.

Each leaf carries its full relative path (e.g. `"users/:id/settings"`).

**`path` / `query`** are `Schema.Struct.Fields` (a record of `name → Schema`), declared **only on routes**. The compiler covers every `:name` placeholder in `pathSchema`, defaulting to `Schema.String` when a placeholder has no declared field. Query fields are optional by default.

> Authoring components with `Component.make` / `Component.gen` keeps every slot fully typed: Each component's `E`/`R` channels aggregate up through `Router.layout` / `Router.router` into the sealed `RouterDef`.

## Reading the match: handler-arg props vs. injection

A leaf page reads the current match's decoded `path` / `query` in either of two forms.

### Handler-arg props (leaf pages)

The router passes the decoded `{ path, query }` straight into a leaf `component` as props. The props are typed `RouteHandlerProps<Path, Query>`, inferred from the route's `path` / `query` fields. No `Router` access, no validation step. Just read the props:

```typescript
const idParam = { id: Schema.NumberFromString };
const sortQuery = { sort: Schema.optional(Schema.String) };

Router.route("users/:id/posts", {
  path: idParam,
  query: sortQuery,
  // `path.id` is already a number; `query.sort` is `string | undefined`.
  component: ({ path, query }) =>
    h.section([h.h2(`Posts for user ${path.id}`), h.p(`sort: ${query.sort ?? "none"}`)]),
});
```

This is the most direct form for a leaf. A plain zero-arg thunk works too; it just ignores the props.

### Dependency injection (layouts and deep nodes)

A **layout** sits above the leaf and so can't take handler args; it reads the match by **dependency injection** instead. `Router.params(fields)` / `Router.query(fields)` are readable from **any** component:

```typescript
// A /users/:id layout (above the leaf) reads `:id` by injection.
const UserShell = Component.gen(function* () {
  const { id } = yield* Router.params(idParam);
  const outlet = yield* Router.Outlet;
  return yield* h.div({ class: "user" }, [h.h1(`User ${id}`), outlet]);
});
```

`Router.params(fields)` / `Router.query(fields)` read the live match and pick the requested `fields` keys (already decoded by the matcher, so no re-validation). They return the typed values. When no route matches, they fail with a tagged [`RouterParamsError`](#errors) carrying `source: "path" | "query"` and the requested `keys`.

That error bubbles into the app node's aggregate `E`, so a user may recover it with `Boundary.catchTag(…)`.

### Reactive accessors: `paramsStream` / `queryStream`

`Router.paramsStream(fields)` / `Router.queryStream(fields)` are the reactive counterparts of `params` / `query`. Each resolves a `Subscribable` derived from `Subscribable.changes(currentMatch)`, so a component can update **in place** even when the same leaf stays mounted, the case a query-only navigation (`setQuery` / `patchQuery`, see [Programmatic navigation](#programmatic-navigation)) produces and a snapshot `Router.query` would miss:

```typescript
import { Component, h, Subscribable } from "@weftui/core";
import { Router } from "@weftui/router";
import { Schema, Stream } from "effect";

const sortQuery = { sort: Schema.optional(Schema.String) };

const ProductsPage = Component.gen(function* () {
  const query = yield* Router.queryStream(sortQuery);
  return yield* h.section([
    h.h2("Products"),
    h.p(["sort: ", Stream.map(Subscribable.changes(query), (q) => q.sort ?? "none")]),
  ]);
});
```

A `NotFound` match yields the empty subset rather than failing, so the stream stays live across navigations.

## Layouts and the outlet

A **layout** wraps the next level down: the **outlet**, which is also delivered by injection. A layout reads it with `yield* Router.Outlet` and places it like any `h`-style child:

```typescript
const UserShell = Component.gen(function* () {
  const { id } = yield* Router.params(idParam);
  const outlet = yield* Router.Outlet;
  return yield* h.div({ class: "user" }, [h.h1(`User ${id}`), outlet]);
});

Router.layout({ component: UserShell }, [settingsRoute, postsRoute]);
```

`Router.Outlet` is typed **opaque** (`Node<never, never>`), so splicing it adds nothing to the layout's own channels. The subtree's real `E`/`R` are aggregated structurally by `Router.layout`. The router discharges the `Outlet` requirement at render time, so it never appears in a layout's (or the sealed app's) aggregate requirement channel.

A layout owns **no `segment` or `path`**; all path structure lives on routes. A layout that needs a param reads it via `Router.params`.

### Layout persistence

Each nesting level renders as a reactive stream child keyed by `(pattern + the param values that level depends on)` and `dedupe`d. An unchanged ancestor layout therefore **stays mounted** across a navigation that only changes a deeper level: its DOM identity and any local state (a `SubscriptionRef`, a scroll position) survive while only the inner outlet swaps.

```typescript
import { Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { Clock } from "effect";

// UserShell's body runs once per distinct `:id`. Navigating between
// /users/1/settings and /users/1/posts doesn't change `:id`, so this
// instance (and `sessionStart`) is never recreated: only `outlet` swaps.
const UserShell = Component.gen(function* () {
  const { id } = yield* Router.params(idParam);
  const outlet = yield* Router.Outlet;
  const sessionStart = yield* Clock.currentTimeMillis;

  return yield* h.div({ class: "user" }, [
    h.p(`shell mounted at ${sessionStart}`),
    h.h1(`User ${id}`),
    outlet,
  ]);
});
```

Navigate from `/users/1/settings` to `/users/1/posts` and the mounted timestamp stays the same; navigate to `/users/2/settings` and it re-renders, since `:id` changed.

## Sealing the tree

`Router.router(root, { notFound })` compiles the tree eagerly (stamping leaf references so `href` works) and captures the app-level not-found page:

```typescript
export const App = Router.router(
  Router.layout({ component: Shell }, [
    homeRoute,
    Router.layout({ component: UserShell }, [settingsRoute, postsRoute]),
  ]),
  { notFound: () => h.section({ id: "page" }, [h.h2("404: page not found")]) },
);
```

`App` is a `RouterDef` whose phantom `E`/`R` carry the aggregate channels of the whole tree (plus the not-found page). Keep `app.ts` side-effect-free (no `mount`/`hydrate`) so both entries can import it.

## Type-safe links with `href`

`href(leafRef, args)` builds a URL from a leaf route reference (the value returned by `Router.route`). Path params are **required** in the argument type and query is optional when every query field is optional:

```typescript
import { href } from "@weftui/router";

const Home = Component.make(() =>
  h.nav([
    h.a({ href: href(settingsRoute, { path: { id: 1 } }) }, "User 1 settings"),
    h.a({ href: href(postsRoute, { path: { id: 2 }, query: { sort: "new" } }) }, "User 2 posts"),
  ]),
);
```

Path params encode into the pattern (`/users/:id` + `{ id: 42 }` ⇒ `/users/42`). Query values encode through the query schema into a key-sorted search string. `href` round-trips with the matcher.

The leaf must belong to a tree sealed with `Router.router()`. This is why deferring the `component` body via `Component.make` matters: `href` runs at render time, after compile.

## Not-found

`notFound(path?)` short-circuits the current render with a `RouterNotFound` failure. Callable from any page or layout. The nearest enclosing not-found boundary renders the configured `notFound` page in its place, and the server responds with HTTP 404:

```typescript
import { notFound, Router } from "@weftui/router";

Router.route("users/:id", {
  path: idParam,
  component: Component.gen(function* () {
    const { id } = yield* Router.params(idParam);
    if (!Number.isFinite(id) || id < 0) return yield* notFound();
    return yield* h.div(`User ${id}`);
  }),
});
```

`RouterNotFound` is exported, so a `Boundary.catchTag(…)` placed inside a subtree overrides the app-level fallback for that subtree. The router's internal boundary is outermost, so a nearer user boundary wins.

> **`Schema.NumberFromString` gotcha.** Decoding no longer fails on a non-numeric segment: `/users/abc` decodes `id` to `NaN` instead of missing the route. A leaf that guards a numeric param must check `Number.isFinite(id)` itself (as above). Relying on the schema alone to 404 non-numeric input no longer works.

## Client setup

On the client, provide the `Router` via `RouterLive(def)` and render `RouterApp(def)`. `RouterLive` is a **scoped layer**: it owns the `popstate` listener and the same-origin link-click interceptor, so it must outlive the mount.

Give it to `WeftApp.make`. The app runtime owns it for the app's lifetime, built lazily on first mount/hydrate and released only at `WeftApp.dispose`. Do not wrap `Effect.provide` around the mount/hydrate call; services come exclusively from the app layer. `RouterLive`'s only required argument is the sealed `App`; a second `options` argument adds an rpc group or a custom `baseUrl` when needed (see [`Boundary.rpc` interplay](#boundaryrpc-interplay)).

```typescript
const app = WeftApp.make(RouterLive(App));
void Effect.runPromise(WeftApp.mount(app, RouterApp(App), root));
```

### Client-only app

A complete, no-SSR app: three routes under one `Shell` layout, mounted directly into an empty `#root`. This is the whole file set, copy/paste runnable in a `vite` + `@weftui/router` project.

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Weft routing demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```typescript
// src/app.ts
/**
 * Client-only routing demo: a Shell layout with Home, About, and a dynamic
 * User page, sealed into a single RouterDef. Side-effect-free (no mount call),
 * so `main.ts` and any test can import `App` directly.
 */
import { Component, h } from "@weftui/core";
import { href, notFound, Router } from "@weftui/router";
import { Schema } from "effect";

const idParam = { id: Schema.NumberFromString };

const homeRoute = Router.route("", {
  component: Component.make(() => h.section({ id: "page" }, [h.h2("Home")])),
});

const aboutRoute = Router.route("about", {
  component: Component.make(() => h.section({ id: "page" }, [h.h2("About")])),
});

const userRoute = Router.route("users/:id", {
  path: idParam,
  component: ({ path }) => {
    if (!Number.isFinite(path.id) || path.id < 0) return notFound();
    return h.section({ id: "page" }, [h.h2(`User ${path.id}`)]);
  },
});

const Shell = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* h.div({ id: "app" }, [
    h.nav([
      h.a({ href: href(homeRoute) }, "Home"),
      " · ",
      h.a({ href: href(aboutRoute) }, "About"),
      " · ",
      h.a({ href: href(userRoute, { path: { id: 1 } }) }, "User 1"),
    ]),
    h.main([outlet]),
  ]);
});

export const App = Router.router(
  Router.layout({ component: Shell }, [homeRoute, aboutRoute, userRoute]),
  { notFound: () => h.section({ id: "page" }, [h.h2("404: page not found")]) },
);
```

```typescript
// src/main.ts
/**
 * Browser entry: mounts the routing demo into `#root`. No server render to
 * hydrate, so this uses `WeftApp.mount`, not `hydrate`.
 */
import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { App } from "./app";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root not found");
}

const app = WeftApp.make(RouterLive(App));
void Effect.runPromise(WeftApp.mount(app, RouterApp(App), root));
```

`WeftApp.mount(app, node, root)` clears `root` and renders `node` fresh, in contrast to `hydrate`, which adopts existing server-rendered DOM (see [Full SSR example](#full-ssr-example) below). Everything else, the layout, `href`, params, navigation, is identical between the two setups.

### Link interception

A plain `h.a({ href })` to a same-origin, route-matching URL performs SPA navigation when clicked: no full page load. The interceptor leaves the browser's native behaviour untouched for:

- modified clicks (ctrl/meta/shift/alt or non-left button)
- `target=_blank` and `download`
- external origins
- same-document (hash-only) navigations
- hrefs that don't resolve to a route

```typescript
h.a({ href: "/about" }, "About"); // intercepted: SPA navigation, no reload
h.a({ href: "/about", target: "_blank" }, "About"); // native: falls through
```

You don't wire anything up. `RouterLive` installs the delegated listener for the layer's lifetime and removes it on teardown.

## Programmatic navigation

For navigation that isn't a link click, `@weftui/router/client` exposes typed helpers. They run as `Effect`s within the `RouterLive` layer (except `back` / `forward`, which only touch `window.history`):

```typescript
import {
  back,
  forward,
  navigate,
  patchQuery,
  push,
  replace,
  setQuery,
} from "@weftui/router/client";

// Typed: build the URL from a leaf ref + decoded args (same rules as `href`).
yield * navigate(postsRoute, { path: { id: 42 }, query: { sort: "new" } });
yield * navigate(settingsRoute, { path: { id: 42 } }, { replace: true });

// Raw path + search string.
yield * push("/users/1/posts?sort=new");
yield * replace("/users/1/settings");

// History stepping (popstate resyncs the router).
yield * back();
yield * forward();

// Change only the current route's query, re-encoded through its query schema.
// The path is kept, so the leaf stays mounted and `queryStream` readers update.
yield * setQuery({ sort: "old" }); // replaces the query
yield * patchQuery({ sort: "old" }); // merges into the current query
```

- **`navigate(ref, args)`** builds the URL via [`href`](#type-safe-links-with-href), so it round-trips with the matcher. It pushes the History entry, or replaces it with `{ replace: true }`. `args` follows the same requiredness rules as `href`.
- **`setQuery` / `patchQuery`** keep the path, so the active leaf is never remounted. Pair them with `Router.queryStream` for in-place reactive updates. They are a no-op when no route is matched.

### Scroll position on navigation

A client navigation whose **path** changes resets the window scroll to the top at commit. This matches a full page load, which a raw History `pushState`/`replaceState` otherwise doesn't. It applies uniformly to `Router.navigate`, clicking a link the [interceptor](#link-interception) handles, and the `push` / `replace` helpers.

- **Query-only navigations preserve scroll.** `setQuery` / `patchQuery` (and any navigation that keeps the same path) don't reset; the leaf stays mounted, so there's nothing to scroll away from.
- **Back/forward is untouched.** The router never resets scroll on `popstate`; the browser's native `history.scrollRestoration: "auto"` restores the offset the entry had when the user left it.
- **Hash navigation (`#section`) is unaffected.** It's browser-native, and the link interceptor already lets same-document/hash-only clicks fall through.

There's no opt-out; the behavior is hardwired.

## Server setup

On the server, `RouterServer`:

- matches a request URL and builds a fixed-match `Router`
- renders `RouterApp` to hydratable HTML inside a **document shell**
- reports a status (404 when no route matches or a page raises `RouterNotFound`)

The document shell is itself a `ComponentSlot` that splices the app via `yield* Router.Outlet`, exactly like a layout receives its outlet.

```typescript
const { html, status } = await Effect.runPromise(
  RouterServer.render(App, { document: documentShell, url }),
);
```

### Full SSR example

The same three routes as the [client-only app](#client-only-app), rendered on the server as hydratable HTML and hydrated in the browser. This is the whole file set (drop it alongside a dev server that bridges `entry-server.ts`'s `handler` into Vite or any Web-platform server; see [`examples/router-ssr/server.ts`](../../examples/router-ssr/server.ts) for a working one).

```typescript
// src/app.ts
/**
 * Shared, isomorphic router app: three pages under one persistent Shell
 * layout. Side-effect-free: it never mounts or serves. `entry-server.ts`
 * renders the matched route on the server; `entry-client.ts` hydrates over it.
 */
import { Component, h } from "@weftui/core";
import { href, notFound, Router } from "@weftui/router";
import { Schema } from "effect";

const idParam = { id: Schema.NumberFromString };

export const homeRoute = Router.route("", {
  component: Component.make(() => h.section({ id: "page" }, [h.h2("Home")])),
});

export const aboutRoute = Router.route("about", {
  component: Component.make(() => h.section({ id: "page" }, [h.h2("About")])),
});

export const userRoute = Router.route("users/:id", {
  path: idParam,
  component: ({ path }) => {
    if (!Number.isFinite(path.id) || path.id < 0) return notFound();
    return h.section({ id: "page" }, [h.h2(`User ${path.id}`)]);
  },
});

const Shell = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* h.div({ id: "app" }, [
    h.nav([
      h.a({ href: href(homeRoute) }, "Home"),
      " · ",
      h.a({ href: href(aboutRoute) }, "About"),
    ]),
    h.main([outlet]),
  ]);
});

export const App = Router.router(
  Router.layout({ component: Shell }, [homeRoute, aboutRoute, userRoute]),
  { notFound: () => h.section({ id: "page" }, [h.h2("404: page not found")]) },
);
```

```typescript
// src/entry-client.ts
/**
 * Client entry: hydrates the server-rendered markup in `#root`.
 *
 * `RouterApp(App)` is the universal router root; `RouterLive(App)` provides
 * the History-API-backed `Router` (seeded from `window.location`, with the
 * same-origin link click interceptor installed). `hydrate` adopts the server
 * DOM in place and resumes the reactive outlet.
 */
import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { App } from "./app";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root not found");
}

const app = WeftApp.make(RouterLive(App));
void Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), root));
```

```typescript
// src/entry-server.ts
/**
 * Server entry: renders the matched route to a hydratable HTML document.
 *
 * `documentShell` splices the app via `yield* Router.Outlet` (injected per
 * request by `RouterServer`). `render` drives it for a single `url`; `handler`
 * is a Web `fetch`-style handler ready to bridge into Vite or any Web server.
 */
import { Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { RouterServer } from "@weftui/router/server";
import { Effect } from "effect";
import { App } from "./app";

const documentShell = Component.gen(function* () {
  const app = yield* Router.Outlet;
  return yield* h.html({ lang: "en" }, [
    h.head([h.meta({ charset: "utf-8" }), h.title("My app")]),
    h.body([
      h.div({ id: "root" }, [app]),
      h.script({ type: "module", src: "/src/entry-client.ts" }),
    ]),
  ]);
});

// { html, status }: `<!DOCTYPE html>` is prepended for you.
export const render = (url: string): Promise<{ html: string; status: number }> =>
  Effect.runPromise(RouterServer.render(App, { document: documentShell, url }));

// A Web fetch-style handler, ready to bridge into Vite or any Web server.
export const handler = RouterServer.toWebHandler(App, { document: documentShell });
```

`render` provides both `Router.Outlet` (the app, per request) and `Router` (so the shell may read params). It renders through `renderToStringHydratable` so the client can `hydrate` in place. Neither `RouterLive` nor `RouterServer` needs an `rpc` option here: it's optional and only required once a page uses [`Boundary.rpc`](#boundaryrpc-interplay).

`handler` still needs a server to call it. [`examples/router-ssr/server.ts`](../../examples/router-ssr/server.ts) shows the shape: a Node HTTP server that runs Vite in middleware mode, converts each request to a Web `Request`, calls `handler`, and runs HTML responses through `vite.transformIndexHtml` for HMR (non-HTML responses, like a `Boundary.rpc` refetch, are forwarded untouched). See that file and its co-located [`vite.config.ts`](../../examples/router-ssr/vite.config.ts) for the full dev-server wiring; it's the same shape in production behind any Web-platform host.

### `effect/unstable/httpapi` is the spine

The tree is the authoring surface, but `effect/unstable/httpapi`'s `HttpApi` is the **single source of truth** for paths and schemas. Sealing the tree with `Router.router(...)` builds it once (`buildHttpApi`) and stamps it onto `def.httpApi`.

The result is a single `"pages"` group with one GET endpoint per leaf at its full path pattern, carrying `params: pathSchema`, `query: querySchema`, and a `RouterNotFound → 404` error. Both sides read that one definition, so they always agree:

- **Server**: `RouterServer` dispatches through `HttpApiBuilder` (platform owns request→leaf matching, path/query decode, and the 404 status).
- **Client**: `RouterLive` derives a real `HttpApiClient` from the same `def.httpApi` (exposed as `Router.httpApiClient`) for network work. SPA URL→leaf resolution stays **local**; there is no public client-side "match this URL against my `HttpApi`" utility in platform. It is fed from the same endpoint definitions, so it never drifts from the server.

```typescript
import { Option } from "effect";

App.httpApi; // HttpApi.Top: one "pages" group, a GET endpoint per leaf

const { httpApiClient } = yield * Router;
Option.isSome(httpApiClient); // true under RouterLive, false under RouterServer
```

## Errors

| Error               | Raised by                                                             | Recover with                                              |
| ------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `RouterNotFound`    | `notFound()`, or no route matched                                     | `Boundary.catchTag(…)` (or the app-level `notFound` page) |
| `RouterParamsError` | `Router.params` / `Router.query` on a missing/invalid key or no match | `Boundary.catchTag(…)`                                    |

Both are modeled as `Schema.TaggedErrorClass`, so they encode/decode across the wire the same way `Boundary.rpc` replays typed failures.

Recover locally by wrapping just the subtree that can fail, rather than relying on the app-level `notFound` page for everything:

```typescript
import { Boundary, Component, h } from "@weftui/core";
import { Router } from "@weftui/router";

const UserShell = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* h.div({ class: "user" }, [
    Boundary.catchTag(
      {
        tag: "RouterParamsError",
        fallback: () => h.p({ class: "error" }, "Couldn't read this page's params."),
      },
      [outlet],
    ),
  ]);
});
```

The matched tag is removed from the boundary's output `E`; an unmatched error (e.g. `RouterNotFound`) re-raises to the nearest parent boundary, which is the router's own not-found boundary if nothing closer catches it.

## `Boundary.rpc` interplay

Initial SSR navigation works end to end: the server resolves the rpc and inlines its payload, and the client replays it during `hydrate`.

**Client-side** navigation into a page containing a `Boundary.rpc` has no SSR payload, so the boundary performs a **client-first mount**. It renders the boundary's `fallback`, forks the rpc call over `POST /_eui/rpc`, and swaps in the result.

`@weftui/router` provides the `AppRpcClientTag` seam on both sides (network client on the client, in-process on the server). The same rpc backs SSR-replay, refetch, and client-first mount. Both `RouterLive` and `RouterServer` take an optional `{ rpc: { group } }` (server also needs `handlers`) to wire it: see the [rpc data boundaries guide](./load-data-with-rpc.md) and [`examples/router-ssr`](../../examples/router-ssr) for the full contract/handler split.

```typescript
// client (entry-client.ts): network rpc client over the shared group
const app = WeftApp.make(RouterLive(App, { rpc: { group: StockRpcs } }));

// server (entry-server.ts): same group, plus its handler Layer
const rpc = { group: StockRpcs, handlers: StockLive };
export const handler = RouterServer.toWebHandler(App, { document: documentShell, rpc });
```

## See also

- [`@weftui/router` API reference](../reference/router.md)
- [examples/router-ssr](../../examples/router-ssr): a runnable SSR + hydration app with nested layouts, persistent layout state, type-safe `href`s, handler-arg props, `Boundary.rpc`, and programmatic navigation over the `effect/unstable/httpapi` spine
- [examples/router-client](../../examples/router-client): the client-only counterpart, no server, no SSR, no `Boundary.rpc`
- [Component Authoring](./author-components.md): `Component.make` / `Component.gen`, the idiomatic way to write route components
- [Server-Side Rendering](./render-on-the-server.md): `renderToStringHydratable`, `hydrate`, and `Boundary.rpc`
- [RPC Data Boundaries](./load-data-with-rpc.md): `Boundary.rpc`, the `Resource` handle, and the four lifecycles
- [`packages/router/router.specs.md`](../../packages/router/router.specs.md): the full specification
