# Render-time context seam — spec

## Status

**Resolved.** Shipped as the render-time `context` option on `RouterServer`
(`render` / `toWebHandler` / `toStreamingWebHandler`) and on the client `RouterLive`.
The website was migrated off the module-singleton workaround to a `Docs` service
provided through this seam. History (the original bug and why the seam is shaped this
way) is retained below.

## Summary

App-wide services are provided to a router render through an explicit `context` option
— a `Layer` — that is threaded to the document shell **and** every route/layout/leaf:

```ts
class Greeting extends Context.Service<Greeting, { text: string }>()("Greeting") {}

const Page = Component.gen(function* () {
  const g = yield* Greeting; // ✅ resolved from the render-time context
  return yield* h.h1(g.text);
});

const { status, html } = await Effect.runPromise(
  RouterServer.render(def, {
    document,
    url: "/",
    context: Layer.succeed(Greeting, { text: "hi" }), // the seam
  }),
);
// 200 with "hi".
```

The seam is **symmetric with `rpc`** and **type-tracked**: the def's aggregate
requirement `R` is discharged at the entry point, so a missing provide is a compile
error rather than a runtime 500.

## Original bug (why the seam was needed)

Services provided **ambiently** around a render — `Effect.provide(RouterServer.render(def, opts), L)`
— did **not** reach the route/layout components. A component doing `yield* MyService`
died with a missing-service defect (HTTP 500), because:

1. **Dispatch boundary.** `RouterServer` dispatches each request through platform's
   `HttpApiBuilder` (`webHandlerWith`), executed in the builder's **own** managed
   context — it does not inherit the ambient context of the effect that called `render`.
2. **Reactive-outlet draining.** The whole tree (shell + every leaf) renders through the
   dom renderer's single `renderToStringHydratable` context; the reactive outlet
   `Stream` children (`outlet.ts` `levelStream` → `renderLevel` → `match.leaf.component`)
   drain **inline in that top render context**, not in the context of any intermediate
   node. So even `Effect.provideService(outletNode, MyService, …)` inside the shell was
   lost when the renderer drained the inner stream.

## How the fix works

Because the whole tree drains in the one top `renderToStringHydratable` /
`renderToHydratableShell` context (cause #2 above, now turned to advantage), providing
the user `Layer` **there** — alongside the existing `Router`, `Router.Outlet`, and
`appRpcClientLayer(rpc)` — reaches every leaf:

- **Server** (`server/router-server.ts`): `renderDocument` and `renderLeafStreaming`
  add `Effect.provide(options.context ?? Layer.empty)` to the top render.
- **Client** (`client/router-live.ts`): `RouterLive` merges the `context` `Layer` into
  the layer it returns (`Layer.merge(core, context)`), so the `ManagedRuntime` the
  client mounts under carries the app services and the hydrated tree reads them.

### Type model

- `AppServices<R> = Exclude<R, Router | Router.Outlet | AppRpcClientTag>` — the residual
  services the caller must still provide (the def's `R` minus what the router threads).
- `ContextOption<R>` shapes the `context` field per entry: **required** when the def has
  statically known residual services, **absent** when it has none, and **optional** for
  a loosely-typed `RouterDef<any, any>` (residual services can't be tracked, so the seam
  is not forced — keeps existing loosely-typed / no-service apps unchanged).

## Acceptance criteria (all met)

- **AC1** — A service provided through `context` is readable via `yield* Service` from
  any route, layout, and the document shell, on `render` and both web handlers.
  _(Covered by `server/router-server.test.ts` → "RouterServer render-time context seam (AC1)".)_
- **AC2** — The def's aggregate `R` is reflected in the entry-point types (not cast to
  `never`), so a missing (or wrong) provide is a compile error.
  _(Covered by `__type-tests__/router.tst.ts`.)_
- **AC3** — Existing `rpc`-only and no-service apps keep working unchanged (the `context`
  field is optional/absent for them).
  _(Covered by the unchanged existing `router-server` / `router-live` tests.)_
- **AC4** — Client parity: the same `context` seam on `RouterLive` reaches the hydrated
  tree.
  _(Covered by `client/router-live.test.ts` → "RouterLive render-time context seam (AC4)".)_

## Website

Migrated off the module-singleton workaround: `website/src/lib/docs-service.ts` now
exposes a `Docs` `Context.Service`; `docs-live.ts` provides `DocsLive` (the build-time model
as a `Layer`). Route components, layouts, and the document shell read it via
`yield* Docs`; the entries provide it through the seam (`entry-server.ts` →
`RouterServer.render(App, { …, context: DocsLive })`, `entry-client.ts` →
`RouterLive(App, { context: DocsLive })`). Tests provide a `Docs` layer instead of
relying on module state (`routes.test.ts` passes `context: DocsLive`).
