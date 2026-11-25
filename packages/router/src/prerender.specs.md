# Route-level `prerender`

## Overview & Purpose

A route can declare that its pages are rendered ahead of time. The declaration sits on the route itself and is typed by the route's own path schema.

```ts
// No params: a flag.
const aboutRoute = Router.route("about", { component: About, prerender: true });

// Params: the values to render, typed from `path`. An Effect may read services.
const docRoute = Router.route("docs/:category/:slug", {
  path: { category: Schema.String, slug: Schema.String },
  component: DocPage,
  prerender: Effect.map(Docs, (docs) => docs.all.map(({ category, slug }) => ({ category, slug }))),
});
```

The router only declares and enumerates. It never writes files. `RouterServer.layer` exposes the enumerated paths through a `RouterServer.Prerender` service, and a build tool (the `weft()` Vite plugin) reads them and renders each one.

The design borrows from three frameworks:

- Next.js and Astro: a dynamic route lists its own params (`generateStaticParams`, `getStaticPaths`).
- Astro: an output mode sets the default, and a route can override it.
- TanStack Start: routes without params are discovered automatically.

Weft adds type checking: the params are checked against the route's path schema.

## Acceptance Criteria

### Declaring

- [ ] **P1** A route without path params accepts `prerender?: boolean`.
- [ ] **P2** A route with path params accepts `prerender?: false`, a readonly array of its decoded path params, or an Effect yielding that array.
- [ ] **P3** A route with path params rejects `prerender: true` at compile time. Its params must be listed.
- [ ] **P4** Param objects are type-checked against the route's decoded `path` type. A missing, extra or wrongly typed param is a compile error.
- [ ] **P5** The requirements of a `prerender` Effect travel on their own channel (`TreePR`, the third parameter of `RouterDef`), apart from the route's `R`. `RouterServer.layer` requires them. The client app node does not, so the browser never provides a service that only a `prerender` Effect reads.
- [ ] **P6** `prerender` has no effect on matching, rendering, `href`, or the client bundle's behavior.

### Enumerating

- [ ] **P7** `RouterServer.layer` provides the `RouterServer.Prerender` service. Its `paths(output)` returns an Effect yielding the URL paths to prerender, as strings starting with `/`.
- [ ] **P8** With `output: "server"`, only routes that declare `prerender` (`true`, an array, or an Effect) contribute paths. Nothing is prerendered by default.
- [ ] **P9** With `output: "static"`, every route without path params contributes its path unless it sets `prerender: false`. Param routes contribute their declared params.
- [ ] **P10** With `output: "static"`, a param route with no `prerender` declaration fails enumeration with `PrerenderUndeclaredError`, naming the route's path pattern. `prerender: false` on that route passes.
- [ ] **P11** Each param object is encoded into the route's path pattern with the same encoding `href` uses. Query params are never part of a prerender path.
- [ ] **P12** Paths come in route-tree order, then declaration order. Duplicates are removed.
- [ ] **P13** A `prerender` Effect runs with the services provided to the Layer. It runs when `paths` is called, not when the Layer is built.
- [ ] **P14** A `prerender` Effect that fails makes `paths` fail with `PrerenderPathsError`, carrying the route's path pattern and the cause.
- [ ] **P15** A param object that does not encode through the route's path schema fails with `PrerenderPathsError`.
- [ ] **P16** A def with no prerenderable routes yields an empty array in `"server"` mode.

### Layer type

- [ ] **P17** `RouterServer.layer` returns `Layer<RouterServer.Prerender, never, LayerRequirements<R, Rpcs>>`. This replaces the `never` output of `router-server-layer.specs.md` L1. Its requirements are unchanged.
- [ ] **P18** `render`, `toWebHandler` and `toStreamingWebHandler` are unaffected.

## Technical Requirements

- Public surface added to `@weftui/router`: the `prerender` field on `Router.route` options, and on `RouterServer`: the `Prerender` service, `PrerenderOutput` (`"server" | "static"`), `PrerenderUndeclaredError`, `PrerenderPathsError`.
- Both errors are tagged errors. `paths` fails with their union.
- The compiled leaf descriptor carries the route's `prerender` declaration, so enumeration is a walk over `def.compiled.leaves`.
- A `prerender` declaration is stored on the route node, which client code also imports. It cannot be tree-shaken, so it ships in the client bundle with everything its module imports. Read data through a service tag (as a component does) and provide the service on the server; do not import a server-only module into a route file for it.
- `makeRoute` sets a global registry flag (`Symbol.for("@weftui/router/prerender-declared")`) when a route declares pages. A build tool reads it to skip building the Layer when nothing is declared. It is not public API.
- type-tests: applicable. Cover P1 to P5 and P17.
- e2e: not applicable, enumeration is server-only logic with no browser-observable behavior. The Vite plugin's tests cover the rendered output.

## Dependencies & Integrations

- `router-server-layer.specs.md`: L1 changes as stated in P17.
- `href.ts`: reused for path encoding.
- `packages/vite/src/weft-plugin.specs.md`: the consumer of `RouterServer.Prerender`.

## Expected Behavior & Edge Cases

- A layout cannot declare `prerender`. Only leaf routes do.
- Params are typed from the route's `path` fields. A route whose segment has a `:param` but no `path` entry for it is typed as param-less: it must declare the param in `path` before it can list values.
- An empty array is a valid declaration: the route is prerenderable and currently has no pages.
- The not-found page is not a path. The build tool renders it separately.
- Lazy routes (`Router.lazy`) declare `prerender` on the route, not inside the lazily loaded module.
- Out of scope: revalidation, on-demand generation of unlisted params, and prerendering per query string.
