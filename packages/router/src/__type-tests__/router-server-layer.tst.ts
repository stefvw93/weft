import { expect, test } from "tstyche";
import { Component, h } from "@weftui/core";
import { Context, Effect, Layer, Schema } from "effect";
import type { HttpRouter } from "effect/http";
import { Rpc, RpcGroup } from "effect/rpc";
import type { RouterDef } from "~/compile";
import { Router } from "~/index";
import { RouterServer } from "~/server/router-server";

// Spec: `src/server/router-server-layer.specs.md` (L2, L13, L16, L17, loose def).

class Theme extends Context.Service<Theme, string>()("@test/Theme") {}
const ThemeLive = Layer.succeed(Theme, "dark");

const documentShell = Component.make(() => h.div({}, "doc"));

const passThroughLayout = {
  component: Component.gen(function* () {
    const outlet = yield* Router.Outlet;
    return yield* outlet;
  }),
};

// A def with no residual app services.
const staticDef = Router.router(
  Router.layout(passThroughLayout, [
    Router.route("", { component: Component.make(() => h.div({}, "home")) }),
  ]),
  { notFound: () => h.div({}, "404") },
);

// A def whose leaf requires an app service, so its `R` carries `Theme`.
const themedDef = Router.router(
  Router.layout(passThroughLayout, [
    Router.route("themed", {
      component: Component.gen(function* () {
        return yield* h.div({}, yield* Theme);
      }),
    }),
  ]),
  { notFound: () => h.div({}, "404") },
);

declare const looseDef: RouterDef;

const GetStock = Rpc.make("GetStock", {
  payload: Schema.Struct({ id: Schema.Number }),
  success: Schema.Struct({ units: Schema.Number }),
});
const StockRpcs = RpcGroup.make(GetStock);
const StockLive = StockRpcs.toLayer({ GetStock: () => Effect.succeed({ units: 1 }) });

test("L16: no app services and no rpc requires exactly HttpRouter", () => {
  expect(RouterServer.layer(staticDef, { document: documentShell })).type.toBe<
    Layer.Layer<never, never, HttpRouter.HttpRouter>
  >();
  expect<RouterServer.LayerRequirements<never>>().type.toBe<HttpRouter.HttpRouter>();
});

test("L13: residual app services appear in the requirements", () => {
  const pages = RouterServer.layer(themedDef, { document: documentShell });
  expect(pages).type.toBe<Layer.Layer<never, never, HttpRouter.HttpRouter | Theme>>();

  // Providing the service discharges it, leaving only the ambient router.
  expect(Layer.provide(pages, ThemeLive)).type.toBe<
    Layer.Layer<never, never, HttpRouter.HttpRouter>
  >();
});

test("L13: router-threaded services never leak into the requirements", () => {
  expect<RouterServer.LayerRequirements<Router | Router.Outlet | Theme>>().type.toBe<
    HttpRouter.HttpRouter | Theme
  >();
});

test("L17: an rpc group adds its handlers to the requirements", () => {
  const pages = RouterServer.layer(staticDef, { document: documentShell, rpc: StockRpcs });
  expect(pages).type.toBe<
    Layer.Layer<never, never, HttpRouter.HttpRouter | Rpc.Handler<"GetStock">>
  >();

  // Providing the handler Layer satisfies them.
  expect(Layer.provide(pages, StockLive)).type.toBe<
    Layer.Layer<never, never, HttpRouter.HttpRouter>
  >();
});

test("L13 + L17: app services and rpc handlers combine", () => {
  expect(RouterServer.layer(themedDef, { document: documentShell, rpc: StockRpcs })).type.toBe<
    Layer.Layer<never, never, HttpRouter.HttpRouter | Theme | Rpc.Handler<"GetStock">>
  >();
});

test("a loosely typed def is accepted and contributes no app services", () => {
  expect(RouterServer.layer(looseDef, { document: documentShell })).type.toBe<
    Layer.Layer<never, never, HttpRouter.HttpRouter>
  >();
});

test("L2: options are { document, rpc?, streaming? }", () => {
  // Should compile: both render modes are selectable.
  RouterServer.layer(staticDef, { document: documentShell, streaming: false });
  RouterServer.layer(staticDef, { document: documentShell, streaming: true });

  // `document` is required.
  expect(RouterServer.layer).type.not.toBeCallableWith(staticDef, {});

  // `streaming` is a boolean, not a mode string.
  expect(RouterServer.layer).type.not.toBeCallableWith(staticDef, {
    document: documentShell,
    streaming: "buffered",
  });
});

test("L2: services and handlers are not options", () => {
  // There is no `context` option: services come through the requirements channel.
  expect(RouterServer.layer).type.not.toBeCallableWith(themedDef, {
    document: documentShell,
    context: ThemeLive,
  });

  // `rpc` is the contract only, not the `{ group, handlers }` pair of `toWebHandler`.
  expect(RouterServer.layer).type.not.toBeCallableWith(staticDef, {
    document: documentShell,
    rpc: { group: StockRpcs, handlers: StockLive },
  });
});
