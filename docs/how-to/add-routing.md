---
title: Routing
order: 4
section: how-to
description: "@weftui/router: universal nested routing, Router.route / Router.layout / Router.router, type-safe href, layouts, and programmatic navigation."
---

# Routing

`@weftui/router` is a universal (server + client) nested router for Weft. It maps a URL to a rendered `Node` tree on both sides:

- **Server**: matches an incoming request path, renders the matched nested page to hydratable HTML, and responds with `text/html` (HTTP 404 for not-found).
- **Client**: matches `window.location`, swaps pages reactively via the History API, and keeps unchanged ancestor layouts mounted across navigations.

The package mirrors `@weftui/dom`: a shared (universal) root, a `./client` entry, and a `./server` entry.

```bash
npm install @weftui/router
```

## The mental model

A route's **component is its handler**. A page is a component that renders, and its `component` slot is invoked at render time on whichever side the request arrives. Server-resolved data stays with [`Boundary.rpc`](./load-data-with-rpc.md); client-side async stays with `Boundary.suspend`.

You author an **explicit nested route tree** with three namespaced combinators (mirroring the `h.div` / `Component.gen` / `Boundary.catchTag` surface) and seal it once:

| Combinator                                            | Builds                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `Router.route(segment, { path?, query?, component })` | A leaf page.                                                     |
| `Router.layout({ component }, children)`              | A layout that wraps an outlet (purely UI nesting; owns no path). |
| `Router.router(root, { notFound })`                   | Seals the tree into a `RouterDef`.                               |

The tree is the source of truth. The same sealed `RouterDef` drives both server and client.

## Authoring routes

Every `component` slot is a **`ComponentSlot`**: a callable producing a `Node`, passed **uncalled**. Use [`Component.make` / `Component.gen`](./author-components.md) (or a plain `() => Node` thunk). The router invokes it at render time, which lets `href(…)` resolve after the tree is compiled.

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

- **`segment`** is relative to the parent and may contain `:name` path-param placeholders (e.g. `"users/:id"`). A leading/trailing `/` is tolerated. Each leaf carries its full relative path (e.g. `"users/:id/settings"`).
- **`path` / `query`** are `Schema.Struct.Fields` (a record of `name → Schema`), declared **only on routes**. The compiler covers every `:name` placeholder in `pathSchema`, defaulting to `Schema.String` when a placeholder has no declared field. Query fields are optional by default.

> Authoring components with `Component.make` / `Component.gen` keeps every slot fully typed: the router never sees a `Node<any, any>`. Each component's `E`/`R` channels aggregate up through `Router.layout` / `Router.router` into the sealed `RouterDef`.

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

That error bubbles into the app node's aggregate `E`, so a user may recover it with `Boundary.catchTag("RouterParamsError", …)`.

> **Reactive accessors.** `Router.paramsStream(fields)` / `Router.queryStream(fields)` are the reactive counterparts. Each resolves a `Subscribable` derived from `currentMatch.changes`. A component can render `[(yield* Router.queryStream(sortQuery)).changes]` and update **in place** even when the same leaf stays mounted (the query-only case `Router.query` would miss). See [Programmatic navigation](#programmatic-navigation).

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

Each nesting level renders as a reactive stream child keyed by `(pattern + the param values that level depends on)` and `dedupe`d. An unchanged ancestor layout therefore **stays mounted** across a navigation that only changes a deeper level. Its DOM identity and any local state (a `SubscriptionRef`, a scroll position) survive while only the inner outlet swaps.

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

`RouterNotFound` is exported, so a `Boundary.catchTag("RouterNotFound", …)` placed inside a subtree overrides the app-level fallback for that subtree. The router's internal boundary is outermost, so a nearer user boundary wins.

> **`Schema.NumberFromString` gotcha.** Decoding no longer fails on a non-numeric segment: `/users/abc` decodes `id` to `NaN` instead of missing the route. A leaf that guards a numeric param must check `Number.isFinite(id)` itself (as above). Relying on the schema alone to 404 non-numeric input no longer works.

## Client setup

On the client, provide the `Router` via `RouterLive(def)` and render `RouterApp(def)`. `RouterLive` is a **scoped layer**: it owns the `popstate` listener and the same-origin link-click interceptor, so it must outlive the mount.

Give it to `WeftApp.make`. The app runtime owns it for the app's lifetime, built lazily on first hydrate and released only at `WeftApp.dispose`. Do not wrap `Effect.provide` around the mount/hydrate call; services come exclusively from the app layer.

```typescript
// entry-client.ts
import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { App } from "./app";

const root = document.getElementById("root")!;
const app = WeftApp.make(RouterLive(App));
void Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), root));
```

For a client-only app (no SSR), swap `WeftApp.hydrate` for `WeftApp.mount`; everything else is identical.

### Link interception

A plain `h.a({ href })` to a same-origin, route-matching URL performs SPA navigation when clicked: no full page load. The interceptor leaves the browser's native behaviour untouched for:

- modified clicks (ctrl/meta/shift/alt or non-left button)
- `target=_blank` and `download`
- external origins
- same-document (hash-only) navigations
- hrefs that don't resolve to a route

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

The document shell is itself a `ComponentSlot` that splices the app via `yield* Router.Outlet`, exactly like a layout receives its outlet:

```typescript
// entry-server.ts
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
export const render = (url: string) =>
  Effect.runPromise(RouterServer.render(App, { document: documentShell, url }));

// Or a Web fetch-style handler, ready to bridge into Vite or any Web server.
export const handler = RouterServer.toWebHandler(App, { document: documentShell });
```

`render` provides both `Router.Outlet` (the app, per request) and `Router` (so the shell may read params). It renders through `renderToStringHydratable` so the client can `hydrate` in place.

### `effect/unstable/httpapi` is the spine

The tree is the authoring surface, but `effect/unstable/httpapi`'s `HttpApi` is the **single source of truth** for paths and schemas. Sealing the tree with `Router.router(...)` builds it once (`buildHttpApi`) and stamps it onto `def.httpApi`.

The result is a single `"pages"` group with one GET endpoint per leaf at its full path pattern, carrying `params: pathSchema`, `query: querySchema`, and a `RouterNotFound → 404` error. Both sides read that one definition, so they always agree:

- **Server**: `RouterServer` dispatches through `HttpApiBuilder` (platform owns request→leaf matching, path/query decode, and the 404 status).
- **Client**: `RouterLive` derives a real `HttpApiClient` from the same `def.httpApi` (exposed as `Router.httpApiClient`) for network work. SPA URL→leaf resolution stays **local**; there is no public client-side "match this URL against my `HttpApi`" utility in platform. It is fed from the same endpoint definitions, so it never drifts from the server.

## Errors

| Error               | Raised by                                                             | Recover with                                                                |
| ------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `RouterNotFound`    | `notFound()`, or no route matched                                     | `Boundary.catchTag("RouterNotFound", …)` (or the app-level `notFound` page) |
| `RouterParamsError` | `Router.params` / `Router.query` on a missing/invalid key or no match | `Boundary.catchTag("RouterParamsError", …)`                                 |

Both are modeled as `Schema.TaggedErrorClass`, so they encode/decode across the wire the same way `Boundary.rpc` replays typed failures.

## `Boundary.rpc` interplay

Initial SSR navigation works end to end: the server resolves the rpc and inlines its payload, and the client replays it during `hydrate`.

**Client-side** navigation into a page containing a `Boundary.rpc` has no SSR payload, so the boundary performs a **client-first mount**. It renders the boundary's `fallback`, forks the rpc call over `POST /_eui/rpc`, and swaps in the result.

`@weftui/router` provides the `AppRpcClientTag` seam on both sides (network client on the client, in-process on the server). The same rpc backs SSR-replay, refetch, and client-first mount. See the [rpc data boundaries guide](./load-data-with-rpc.md).

## See also

- [`@weftui/router` API reference](../reference/router.md)
- [examples/router-ssr](../../examples/router-ssr): a runnable SSR + hydration app with nested layouts, persistent layout state, type-safe `href`s, handler-arg props, and programmatic navigation over the `effect/unstable/httpapi` spine
- [Component Authoring](./author-components.md): `Component.make` / `Component.gen`, the idiomatic way to write route components
- [Server-Side Rendering](./render-on-the-server.md): `renderToStringHydratable`, `hydrate`, and `Boundary.rpc`
- [RPC Data Boundaries](./load-data-with-rpc.md): `Boundary.rpc`, the `Resource` handle, and the four lifecycles
- [`packages/router/router.specs.md`](../../packages/router/router.specs.md): the full specification
