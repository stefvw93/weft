# `RouterServer.layer`

## Overview & Purpose

`RouterServer.layer` exposes a router app's server routes as a composable `effect/http` `HttpRouter` Layer. It registers the page routes, the not-found fallback, and the optional `Boundary.rpc` route into the ambient `HttpRouter`.

Today `RouterServer` builds this Layer internally and only returns a finished `(Request) => Promise<Response>` handler. Users cannot add their own API routes, middleware, or app-scoped services beside it.

With the Layer, a Weft app is one Layer among others. Users merge it with their own routes and launch it the way Effect documents: `HttpRouter.serve(...)` plus a platform HTTP server Layer.

```ts
const Pages = RouterServer.layer(App, { document: documentShell, rpc: StockRpcs });

const Server = HttpRouter.serve(Layer.mergeAll(Pages, MyApiRoutes)).pipe(
  Layer.provide(StockLive), // rpc handlers
  Layer.provide(DatabaseLive), // app services
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
);
```

Decisions behind this spec:

- The router is mandatory for Weft's server story.
- Streaming is the default render mode.
- App services and rpc handlers arrive through the Layer's requirements channel, not through options.
- The existing `render`, `toWebHandler`, and `toStreamingWebHandler` keep their signatures and behavior.
- The Vite dev loop and production asset serving belong to a follow-up spec (`@weftui/vite`).

## Acceptance Criteria

### Shape

- [ ] **L1** `RouterServer.layer(def, options)` returns a `Layer` with no error. Its only output is the `RouterServer.Prerender` service (see `../prerender.specs.md` P17). Building it registers routes into the ambient `HttpRouter`. It serves through both `HttpRouter.serve` and `HttpRouter.toWebHandler`.
- [ ] **L2** `options` is `{ document, rpc?, streaming? }`. `document` is the same `ComponentSlot` as today. `rpc` is the app's `RpcGroup` contract only. `streaming` is a boolean, default `true`. There is no `context` option and no `handlers` field.

### Page dispatch

- [ ] **L3** A matched route replies `text/html; charset=utf-8` at 200, with `<!DOCTYPE html>` prepended and path/query params decoded by the platform.
- [ ] **L4** A GET that no route claims replies the `notFound` page at 404, rendered inside the level-0 outlet region (router spec S2).
- [ ] **L5** A page that raises `RouterNotFound` during the shell walk replies the `notFound` page at 404, rendered directly in the shell (router spec S2).

### Render mode

- [ ] **L6** With `streaming` omitted or `true`, responses follow the streaming status table and criteria SW1 to SW6 and SW8 of `router.specs.md`.
- [ ] **L7** With `streaming: false`, the body is fully buffered and byte-identical to `toWebHandler`'s body for the same request.
- [ ] **L8** For a page with no `Boundary.suspend`, both modes produce the same body (SW4).

### Composition with user routes

- [ ] **L9** A user route Layer merged with `RouterServer.layer` responds on its own path. Page routes keep responding.
- [ ] **L10** A user route on a specific path that no page claims is served by the user route, not by the not-found fallback.
- [ ] **L11** A user prefix catch-all (for example `/api/*`) outranks the page fallback. An unmatched `/api/missing` reaches the user's handler, not the HTML `notFound` page.
- [ ] **L12** The page fallback claims only GET. An unmatched non-GET request gets the platform's default 404.

### Services through the requirements channel

- [ ] **L13** When the def's aggregate `R` has residual app services (`AppServices<R>`), they appear in the Layer's requirements. Providing them with `Layer.provide` makes them available to the document shell and every route and layout leaf.
- [ ] **L14** A provided service Layer is built once per server, not per request. A construction counter reads 1 after several page requests.
- [ ] **L15** Closing the server scope releases the provided services (finalizers run once).
- [ ] **L16** When the def has no residual app services and no `rpc`, the requirements are exactly `HttpRouter`.

### Rpc

- [ ] **L17** With `rpc: group`, the Layer's requirements include that group's handlers. Providing the handler Layer satisfies them.
- [ ] **L18** With `rpc` set, `POST /_eui/rpc` is served on the same `HttpRouter` with the same wire format as `toWebHandler` today.
- [ ] **L19** With `rpc` set, an SSR `Boundary.rpc` resolves in-process against the provided handlers, with no network call. Its payload is serialized into the HTML as today.
- [ ] **L20** The handler Layer is built once and shared by the SSR path and the `POST /_eui/rpc` route.
- [ ] **L21** Without `rpc`, no rpc route is registered and a stray `Boundary.rpc` fails with the existing descriptive error.

### Existing entry points

- [ ] **L22** `RouterServer.render`, `toWebHandler`, and `toStreamingWebHandler` keep their signatures, options (`context`, `rpc: { group, handlers }`), memoization, and rendered output. Their existing tests pass unmodified. One lifetime change: `context` and `rpc.handlers` are now built once per memoized handler, not once per render, and are never released.
- [ ] **L23** The three entry points are implemented on top of `RouterServer.layer`, so page and rpc routing has one implementation.

### Documentation

- [ ] **L24** The server rendering how-to shows the Effect launch path (`HttpRouter.serve` plus `NodeHttpServer.layer`) and merging a user route.

## Technical Requirements

- Types: `options.rpc` is `RpcGroup.RpcGroup<Rpcs>`. The Layer's requirements are `HttpRouter | AppServices<R> | Rpc.ToHandler<Rpcs>`, plus whatever `effect/rpc` requires for the HTTP protocol that the Layer cannot discharge itself.
- The Layer provides `RpcSerialization.layerNdjson` and the per-request `Router`, `Router.Outlet`, and `AppRpcClientTag` itself. Users never provide those.
- App services are captured once when the Layer is built and provided to each render from that captured context.
- A loosely typed `RouterDef<any, any>` is accepted. It contributes no app services to the requirements, since they cannot be tracked.
- The Layer provides `HttpServer.layerServices` itself, so those platform services never appear in the requirements.
- Exported types: `LayerOptions<Rpcs>`, `RpcRequirements<Rpcs>`, `LayerRequirements<R, Rpcs>`.
- type-tests: applicable. Cover L2, L13, L16, L17 and the loosely typed def.
- e2e: not applicable, the feature is server-only HTTP with no browser-observable behavior of its own and no example app is touched. The existing `router-ssr` and website browser tests run as a regression check, since they drive the entry points now built on the Layer.

## Dependencies & Integrations

- `effect/http` (`HttpRouter`, `HttpServerResponse`), `effect/http-api` (`HttpApiBuilder`), `effect/rpc` (`RpcServer`, `RpcSerialization`, `RpcTest`). All are already used by `router-server.ts`.
- No new package dependency. `@effect/platform-node` appears only in docs snippets.
- `@weftui/dom/server`: `renderToHydratableShell`, `renderToStringHydratable`, `SuspenseFailureHandlerTag`, unchanged.

## Expected Behavior & Edge Cases

- A render failure other than `RouterNotFound` before the flush stays a platform 500, as today.
- Per-response streaming scopes are unchanged: a client disconnect interrupts pending Suspense fibers (SW5).
- Two `RouterServer.layer` instances in one `HttpRouter` would register two GET `*` fallbacks. This is unsupported and documented as such.
- Captured services take precedence over a same-key service in the request context. Effect's `HttpApiBuilder` applies its build context to every handler the same way, so this cannot be reversed inside Weft.
- Per-request services (for example a session read from the request) are out of scope. `HttpRouter.provideRequest` does not apply here: it discharges `Request<"Requires", S>` markers, and this Layer requires app services as plain `S`. Per-request services need their own spec.
- The rpc path stays `/_eui/rpc`. Renaming it or making it configurable is out of scope.
- Static asset serving and the Vite dev bridge are out of scope (follow-up `@weftui/vite` spec).
