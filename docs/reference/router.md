---
title: "@weftui/router"
order: 3
section: reference
description: Full API surface for @weftui/router: universal nested routing, type-safe href, layouts, and SSR entry points.
---

# @weftui/router API Reference

Universal nested router for Weft. See the [Routing guide](../how-to/add-routing.md) for a narrative walkthrough.

Three entry points mirror `@weftui/dom`:

| Import                  | Use                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `@weftui/router`        | Shared authoring + universal nodes (`Router`, `href`, `RouterApp`, errors).         |
| `@weftui/router/client` | Client runtime (`RouterLive`, programmatic `navigate`/`push`/…, re-exported nodes). |
| `@weftui/router/server` | Server rendering (`RouterServer`).                                                  |

## `Router`

`Router` is both an Effect `Context.Service` key and the authoring namespace; the two roles merge by declaration. `yield* Router` reads the per-render service; `Router.route(…)` authors a tree.

The service value carries:

- **`currentMatch`**: the current match as a hot `Subscribable<RouteMatch>`; drives the outlet.
- **`navigate(to, options?)`**: navigates to a path (with optional query). `options.replace` swaps `pushState` for `replaceState`. On the client this updates History state and re-renders the affected outlet; on the server it is a no-op.
- **`httpApiClient`**: the derived [`RouterHttpApiClient`](#types) as an `Option`. It is `Option.some` on the client (`RouterLive`) for network work (route prefetch, future loaders), `Option.none` on the server (it is itself the origin). SPA URL→leaf resolution does **not** use this; it stays local via the shared matcher.

### `Router.route`

```typescript
Router.route<Path, Query, S>(
  segment: string,
  config: { path?: Path; query?: Query; component: S },
): RouteNode<Path, Query, E, R>;
```

Declares a leaf page. `segment` is relative to the parent and may contain `:name` placeholders. `component` is a [`ComponentSlot`](#types); its `E`/`R` channels are recovered and propagate up the tree.

The returned `RouteNode` is also the reference passed to [`href`](#href).

A leaf `component` reads the live match in **either** of two forms:

- **Handler-arg props**: declare `(props: `[`RouteHandlerProps<Path, Query>`](#types)`)` and the router passes the decoded `{ path, query }` straight in. `path`/`query` are inferred from the route's `path`/`query` fields. A plain zero-arg thunk works too, ignoring the props.
- **Dependency injection**: a `Component.make` / `Component.gen` component reading the live match via [`Router.params`](#routerparams--routerquery) / `Router.query`. Required for layouts/deep nodes, which can't take handler args.

```typescript
// Handler-arg props: decoded { path, query } passed in directly.
const userRoute = Router.route("users/:id", {
  path: { id: Schema.NumberFromString },
  query: { tab: Schema.optional(Schema.String) },
  component: ({ path, query }) => h.div(`User ${path.id} (${query.tab ?? "info"})`),
});

// Dependency injection: read the match anywhere via Router.params / Router.query.
const userRouteDI = Router.route("users/:id", {
  path: { id: Schema.NumberFromString },
  component: Component.gen(function* () {
    const { id } = yield* Router.params({ id: Schema.NumberFromString });
    return yield* h.div(`User ${id}`);
  }),
});
```

### `Router.layout`

```typescript
Router.layout<C, S>(config: { component: S }, children: C): LayoutNode<E, R>;
```

Declares a layout: purely UI nesting, owning **no path or segment**. `component` splices the injected outlet via `yield* Router.Outlet`.

`Router.Outlet` is excluded from the layout's aggregate requirement channel (the router discharges it per render); the subtree's real channels are unioned in.

### `Router.router`

```typescript
Router.router<T, NF>(root: T, options: { notFound: () => NF }): RouterDef<E, R>;
```

Seals a route tree into a [`RouterDef`](#types), compiling it eagerly (so leaf references are stamped for `href`) and capturing the app-level not-found page. The tree's aggregate channels (plus the not-found page's) ride on the returned `RouterDef`'s phantom `E`/`R`.

### `Router.lazy`

```typescript
Router.lazy<S extends ComponentSlot>(
  load: () => Promise<S>,
): () => Node<Node.Error<SlotNode<S>>, Node.Context<SlotNode<S>>>;
```

Wraps a dynamic-import loader as a component slot. The route's **component** is code-split into its own chunk while the **descriptor** (segment + param schemas) stays eager.

`load` returns a `Promise` resolving the component, typically `() => import("./page").then((m) => m.Page)`. Drops directly into `Router.route({ component })` and `Router.layout({ component })`.

- **Channels preserved.** The returned slot's `E`/`R` equal the resolved component's, so a lazy route has the identical type to declaring it eagerly. An unmet requirement is still a compile error at `Router.router`.
- **Only the matched branch loads**, on the server during render and on the client on navigation. Client navigation is **deferred-commit**: the chunk **and the leaf component's own effect** resolve _before_ the URL commits (see [`Router.navigating`](#routernavigating) and [Blocking vs streaming data](#blocking-vs-streaming-data)). The previous page stays mounted through both the fetch and any data the leaf awaits, so the swap is blank-free. The load `Promise` is memoized per slot, so revisits are synchronous.
- **A rejected `load` is a defect** (`Effect.promise` dies): a deploy-skew/offline condition surfaced through normal defect handling, kept off the `E` channel. The rejection is memoized (no silent retry).
- The resolved value should be a `Component` (`Component.make`/`Component.gen`); a bare `() => Node` thunk loses its channels through the loader `Promise`, so wrap it in `Component.make`.

See the [Split Routes Lazily](../how-to/split-routes-lazily.md) how-to and `packages/router/src/lazy-component.specs.md`.

### `Router.Outlet`

A `Context.Service` key whose value is the node to splice for the next level down. A layout (or the server document shell) reads it with `const outlet = yield* Router.Outlet`. Typed **opaque** as `Node<never, never>`, and discharged by the router at render time, so it never appears in a reader's aggregate requirement channel.

### `Router.params` / `Router.query`

```typescript
Router.params<F extends Fields>(fields: F): Effect<FieldsType<F>, RouterParamsError, Router>;
Router.query<F extends Fields>(fields: F): Effect<FieldsType<F>, RouterParamsError, Router>;
```

Snapshot accessors that read the **live match** (`currentMatch.get`) and pick the requested `fields` keys from the decoded path/query. The matcher already decoded the values against the leaf's full schema, so they are returned directly (no re-validation).

Readable from **any** component, not just the leaf: this is the dependency-injection path layouts and deep nodes use (leaves can instead take [handler-arg props](#routerroute)). They fail with a [`RouterParamsError`](#routerparamserror) (`source: "path" | "query"`, plus the requested `keys`) when no route matches.

### `Router.paramsStream` / `Router.queryStream`

```typescript
Router.paramsStream<F extends Fields>(fields: F): Effect<Subscribable<FieldsType<F>>, never, Router>;
Router.queryStream<F extends Fields>(fields: F): Effect<Subscribable<FieldsType<F>>, never, Router>;
```

The **reactive** counterparts. Each resolves a `Subscribable<FieldsType<F>>` derived from `currentMatch.changes`. A component can render `[(yield* Router.queryStream(fields)).changes]` and update **in place** even when the outlet keeps the same leaf mounted. That is exactly the query-only case (`setQuery` / `patchQuery`) a snapshot `Router.query` would miss.

Resilient across navigations: a `NotFound` match yields the empty subset rather than failing, so the stream stays live.

### `Router.navigating`

```typescript
type NavState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Navigating"; readonly to: string };

// on the Router service:
readonly navigating: Subscribable.Subscribable<NavState>;

// accessor, mirroring paramsStream/queryStream:
Router.navigatingStream: Effect<Subscribable<NavState>, never, Router>;
```

The reactive navigation-state signal, for rendering pending UI (a top progress bar, dimmed outlet) during a **deferred-commit** navigation. It transitions `Idle → Navigating{ to }` while the router resolves the target branch's [`Router.lazy`](#routerlazy) chunk **and** the matched leaf's own component effect, then back to `Idle` on commit. One signal covers both the code and data windows.

`NavState` is exported from `@weftui/router` and `@weftui/router/client`.

- **Eager navigations never flip it**: a branch with no lazy node and a synchronously-resolving leaf commits synchronously and `navigating` stays `Idle`. Reading it costs nothing in an eager app.
- **Synchronous resolutions never emit `Navigating`**: a revisit with both the chunk and the leaf's effect memoized (or an eager leaf with no async work) still commits in the same tick; the signal only flips when a resolution is genuinely async.
- **Latest-wins** across rapid navigations: a superseded navigation never resets it and its pre-run is interrupted.
- **popstate** (back/forward) into a lazy or data-fetching route also reports.
- A **rejected chunk load or a failing leaf pre-run** (typed error or defect) resets it to `Idle` before the failure surfaces through the normal render error path.
- **Server-side it is a constant `Idle`** (server render is buffered), so a component reading it type-checks and renders on both sides.

See the [Show Navigation Progress](../how-to/show-navigation-progress.md) how-to, the [Blocking vs streaming data](#blocking-vs-streaming-data) section below, and `packages/router/src/resolve-before-commit.specs.md`.

### Blocking vs streaming data

A leaf `component` is already an `Effect`; there is no separate loader. Where you put an await decides whether it blocks the navigation commit or streams in afterward:

- **`yield*` in the component body** → commit-blocking. The pre-run executes the leaf's effect to completion before the URL commits. The previous page stays mounted for the whole window, and `Router.navigating` reports `Navigating{ to }` for its duration.
- **An `Effect`/`Stream` placed as a child node** → streaming. The commit is not delayed; the leaf mounts immediately and the child region fills in place once its own effect resolves.

```typescript
// Blocking: the await is in the leaf's own body; navigation waits for it.
const DocPage = Component.gen(function* () {
  const { category, slug } = yield* Router.params({ category: Schema.String, slug: Schema.String });
  const docs = yield* Docs;
  const doc = yield* docs.load(category, slug);
  return yield* h.article([h.h1(doc.title), h.div({ innerHTML: doc.html })]);
});

// Streaming: the await lives on a child; the leaf commits immediately.
const DocPage = Component.gen(function* () {
  const { category, slug } = yield* Router.params({ category: Schema.String, slug: Schema.String });
  const docs = yield* Docs;
  return yield* h.article([
    h.h1("Docs"),
    Stream.concat(
      Stream.make(h.p({ class: "loading" }, "Loading…")),
      Stream.fromEffect(
        Effect.map(docs.load(category, slug), (doc) => h.div({ innerHTML: doc.html })),
      ),
    ),
  ]);
});
```

Choose blocking for primary content the page is meaningless without (an article body, a product's price); the old page stays visible with no blank or skeleton. Choose streaming for secondary or slow regions where partial content is still useful (a comments panel, a "related" rail); the commit isn't held hostage by one slow fetch.

Only the matched **leaf** is pre-run this way. Layout components in the branch get their chunks preloaded, but their bodies still run at render, post-commit. Unchanged layouts don't re-render across navigations, so this rarely matters in practice.

Pre-run failures (`notFound()`, a typed error, or a defect) still commit the URL. They replay through the normal render error path (the nearest `Boundary`, or the router's 404 boundary) without re-running the component.

See [Load Async Data](../how-to/load-async-data.md#blocking-on-navigation-vs-streaming-in-place) and [RPC Data Boundaries](../how-to/load-data-with-rpc.md) for the streaming patterns in full.

## `href`

```typescript
href<Path, Query>(ref: RouteNode<Path, Query>, args?: HrefArgs<Path, Query>): string;
```

Builds a type-safe URL for a leaf route reference. Path params encode into the pattern; query values encode through the query schema into a key-sorted search string. Round-trips with the matcher.

- `path` is **required** when its decoded type has required keys; `query` is optional when every query field is optional (`HrefArgs`).
- Throws if the leaf belongs to a tree that has not been sealed with `Router.router()`.

```typescript
href(userRoute, { path: { id: 42 } }); // "/users/42"
href(postsRoute, { path: { id: 1 }, query: { sort: "new" } }); // "/users/1/posts?sort=new"
```

## Universal nodes

### `RouterApp`

```typescript
RouterApp<E, R>(def: RouterDef<E, R>): Node<Exclude<E, RouterNotFound>, R | Router>;
```

The universal router root node; render this on both server and client. Wraps the nested outlet in the router's internal not-found boundary, so a `RouterNotFound` raised by a page renders the configured `notFound` page in place. Server dispatch runs through `HttpApiBuilder`: a page-raised `RouterNotFound` and a no-match surface their 404 through the platform request pipeline.

`RouterApp` requires `Router` in its environment. Provide it via `RouterLive` (client) or `RouterServer` (server), not `Effect.provide` at the node level. Services under `WeftApp` come exclusively from the app's layer, not ambient `Effect.provide`.

### `outletNode` (a.k.a. `RouterOutlet`)

```typescript
outletNode<E, R>(def: RouterDef<E, R>): Node<E | RouterNotFound, R | Router>;
```

The bare nested-outlet node without the internal not-found boundary, for callers placing their own not-found handling. Re-exported from `@weftui/router/client` as `RouterOutlet`.

## Client: `@weftui/router/client`

### `RouterLive`

```typescript
RouterLive(
  def: RouterDef,
  options: { rpc: { group: RpcGroup<any> }; baseUrl?: string | URL },
): Layer.Layer<Router | AppRpcClientTag>;
```

The client `Router` layer, backed by the History API. Seeds a `SubscriptionRef` from `window.location`, listens for `popstate`, installs the same-origin link-click interceptor, and derives the `HttpApiClient` exposed as `Router.httpApiClient` (over `FetchHttpClient`; `baseUrl` defaults to same-origin).

Alongside `Router` it also provides the core [`AppRpcClientTag`](../reference/core.md#apprpcclienttag) seam: a **network** flat rpc client over the app's merged `RpcGroup` (`RpcClient.make` → `POST /_eui/rpc`). This lets `@weftui/dom` resolve a [`Boundary.rpc`](../reference/core.md#boundaryrpc) (hydrated refetch and client-first SPA mount) without depending on this package or `effect/unstable/rpc`. Pass the same merged `group` the server wires into [`RouterServer`](#routerserver).

**Scoped**: it must outlive the mount. Give it to `WeftApp.make` and the app runtime owns its lifetime (built lazily on first mount, released at `WeftApp.dispose`):

```typescript
const app = WeftApp.make(RouterLive(App, { rpc: { group: StockRpcs } }));
void Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), root));
```

### Programmatic navigation

```typescript
navigate<Path, Query>(ref: RouteNode<Path, Query>, ...args): Effect<void, never, Router>;
push(to: string): Effect<void, never, Router>;
replace(to: string): Effect<void, never, Router>;
back(): Effect<void>;
forward(): Effect<void>;
setQuery(query: Record<string, unknown>, options?: NavigateOptions): Effect<void, never, Router>;
patchQuery(partial: Record<string, unknown>, options?: NavigateOptions): Effect<void, never, Router>;
```

Typed programmatic navigation, all run within the `RouterLive` layer (except `back`/`forward`, which only touch `window.history`):

- **`navigate(ref, args)`**: go to a leaf route `ref` with typed `{ path, query }`. Builds the URL via [`href`](#href) (so it round-trips with `match`) and pushes the History entry, or replaces it with `options.replace`. Same requiredness rules as `href`: `path` required when the route has path params, `query` optional when every field is optional.
- **`push` / `replace`**: go to a raw `path + search` string, pushing or replacing the History entry.
- **`back` / `forward`**: step through History (`history.go(±1)`); the `popstate` handler resyncs.
- **`setQuery` / `patchQuery`**: change the current route's query in place, re-encoding through the matched leaf's `querySchema`. The path is kept, so the leaf stays mounted and reactive `queryStream` readers update. `setQuery` replaces the query; `patchQuery` merges. No-op when no route is matched.

```typescript
import { navigate, patchQuery, push } from "@weftui/router/client";

yield * navigate(userRoute, { path: { id: 42 }, query: { tab: "posts" } });
yield * push("/users/1/posts?sort=new");
yield * patchQuery({ sort: "old" }); // keeps the current path + other query fields
```

### Scroll reset

Every client-committed navigation whose path differs from the previously committed path (`navigate`, `push`, `replace`, and the link interceptor) resets `window.scrollTo(0, 0)` synchronously at commit. Query-only navigations (`setQuery` / `patchQuery`, or any push/replace to the same path) preserve scroll.

`popstate` (`back` / `forward`) never resets; the browser's own `history.scrollRestoration: "auto"` restores the prior offset for those entries. Server rendering is unaffected. Not configurable: there is no `NavigateOptions` field to opt out.

### `installLinkInterceptor`

```typescript
installLinkInterceptor(def: RouterDef, navigate: (to: string) => Effect<void>): Effect<void, never, Scope>;
```

The delegated click interceptor `RouterLive` installs for you. Exposed for advanced/manual wiring. Intercepts plain same-origin clicks whose href resolves to a route (resolved against `def`). It leaves modified clicks, `target=_blank`, `download`, external origins, same-document navigations, and non-matching hrefs to the browser.

## Server: `@weftui/router/server`

### `RouterServer`

A namespace for server-side rendering of a `RouterDef`.

```typescript
RouterServer.render(def, options: { document; rpc; url }): Effect<{ html; status }, Error>;
RouterServer.toWebHandler(def, options: { document; rpc }): (request: Request) => Promise<Response>;
```

Dispatch runs through the `def.httpApi` spine via `HttpApiBuilder`: platform owns request→leaf matching and path/query decode. Each leaf handler then builds a fixed-match server `Router` and renders the universal outlet to hydratable HTML.

- **`toWebHandler`** returns a Web `fetch`-style handler `(Request) => Promise<Response>` that dispatches through `HttpApiBuilder.toWebHandler` and replies `text/html`. Suitable for bridging into a dev server (Vite) or any Web-platform server.
- **`render`** drives that handler for a single `url`, returning `{ html, status }` with `<!DOCTYPE html>` prepended. `status` is sourced from the platform pipeline: `200`, or `404` for a no-match / a page-raised `RouterNotFound`.
- **`document`** is a [`ComponentSlot`](#types) that splices the app via `yield* Router.Outlet`; the router provides both `Router.Outlet` (the app, per request) and `Router`.
- **`rpc`** is the app's [`Boundary.rpc`](../reference/core.md#boundaryrpc) data foundation: `{ group: RpcGroup<any>; handlers: Layer<any, never, never> }`. That is the merged `RpcGroup` (shared with the client) plus its server-only handler Layer (`group.toLayer(...)` ⊕ its dependencies). `toWebHandler` serves the handlers at `POST /_eui/rpc`, so a client refetch / client-first mount re-runs them on the server. An in-process client over the same handlers (backing the [`AppRpcClientTag`](../reference/core.md#apprpcclienttag) seam) resolves SSR boundaries in-process, never over the network.

> The `HttpApi` is not generated on the server. It is built once when the tree is sealed (`buildHttpApi` during `Router.router`) and lives on `def.httpApi`. That is the single source of truth both the server dispatch and the client matcher / derived `HttpApiClient` read from.

## Errors

### `RouterNotFound`

`Schema.TaggedErrorClass` with an optional `path: string`. Raised by [`notFound`](#notfound) or when no route matches. Caught by the router's internal not-found boundary; export it to place your own `Boundary.catchTag("RouterNotFound", …)` (a nearer user boundary wins).

### `RouterParamsError`

`Schema.TaggedErrorClass` with `source: "path" | "query"` and `keys: readonly string[]`. Raised by `Router.params` / `Router.query` when the live match doesn't satisfy the requested fields. Bubbles into the tree's aggregate error channel.

### `notFound`

```typescript
notFound(path?: string): Effect<never, RouterNotFound>;
```

Short-circuits the current page render with a `RouterNotFound`. Callable from any page or layout `component`; the server responds with HTTP 404.

### `isRouterNotFound`

```typescript
isRouterNotFound(u: unknown): u is RouterNotFound;
```

Type guard recognising a `RouterNotFound` value regardless of its prototype.

## Compilation & matching (advanced)

These power the runtime and are exported for tooling/tests; most apps never touch them directly.

| Export                      | Description                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `compile(def)`              | Walks a tree into flat `CompiledLeaf`s with merged path/query schemas and layout chains.                                                                                       |
| `buildHttpApi(leaves)`      | Builds the authoritative `HttpApi` (one `"pages"` group, a GET endpoint per leaf with `params`/`query` schemas + 404). Called by `Router.router`; the result is `def.httpApi`. |
| `leafRegistry`              | `WeakMap<RouteNode, CompiledLeaf>` read by `href` to resolve a leaf's pattern/schemas.                                                                                         |
| `match(compiled, url)`      | Resolves a URL to a `RouteMatch` (`Matched` with decoded `path`/`query`, or `NotFound`).                                                                                       |
| `compileMatchers(compiled)` | Precompiles per-leaf regex matchers.                                                                                                                                           |

## Types

| Type                                                             | Description                                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `RouterDef<E, R>`                                                | A sealed, compiled router. The unit passed to client and server; phantom `E`/`R` carry the tree's aggregate channels.       |
| `RouteNode<Path, Query, E, R>` / `LayoutNode<E, R>` / `TreeNode` | Authored tree nodes.                                                                                                        |
| `ComponentSlot<N>`                                               | A `(props: any) => N` callable producing a `Node`; accepts a plain thunk or a `Component.make` / `Component.gen` component. |
| `RouteHandlerProps<Path, Query>`                                 | The `{ path, query }` decoded match a leaf `component` may declare as handler-arg props.                                    |
| `RouteMatch`                                                     | `{ _tag: "Matched"; leaf; path; query; url }` or `{ _tag: "NotFound"; url }`.                                               |
| `HrefArgs<Path, Query>`                                          | The `href` argument object; `path`/`query` become optional when their decoded type has no required keys.                    |
| `NavigateOptions`                                                | `{ replace?: boolean }`, for `navigate` / `setQuery` / `patchQuery` and `Router.navigate`.                                  |
| `RouterHttpApiClient`                                            | The platform `HttpApiClient` derived from a router's `HttpApi` spine (carried opaquely on `Router.httpApiClient`).          |
| `Fields` / `FieldsType<F>`                                       | `Schema.Struct.Fields` and the `Type` side of its `Schema.Struct`.                                                          |
| `Compiled` / `CompiledLeaf` / `CompiledLayout`                   | The compiled tree shapes.                                                                                                   |
| `RouterOptions`                                                  | Options for `Router.router` (`notFound`).                                                                                   |

## See also

- [Add Routing](../how-to/add-routing.md): the narrative guide to authoring a route tree
- [Split Routes Lazily](../how-to/split-routes-lazily.md) · [Show Navigation Progress](../how-to/show-navigation-progress.md): `Router.lazy` and `Router.navigating`
- [`@weftui/core` reference](./core.md) · [`@weftui/dom` reference](./dom.md)
- [`packages/router/router.specs.md`](../../packages/router/router.specs.md): the full specification
