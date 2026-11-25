import { expect, test } from "tstyche";
import { Component, h } from "@weftui/core";
import { Context, Effect, type Layer, Schema } from "effect";
import type { HttpRouter } from "effect/http";
import type { Node } from "@weftui/core";
import { Router, RouterApp } from "~/index";
import type { TreePR, TreeR } from "~/route-tree";
import { RouterServer } from "~/server/router-server";

// Spec: `src/prerender.specs.md` (P1 to P5, P7, P17).

class Docs extends Context.Service<Docs, { readonly slugs: readonly string[] }>()("@test/Docs") {}
class Theme extends Context.Service<Theme, string>()("@test/Theme") {}

const page = () => h.div({}, "page");
const documentShell = Component.make(() => h.div({}, "doc"));
const idPath = { id: Schema.NumberFromString };
const slugPath = { slug: Schema.String };

const passThroughLayout = {
  component: Component.gen(function* () {
    const outlet = yield* Router.Outlet;
    return yield* outlet;
  }),
};

test("P1: a route without path params takes a boolean", () => {
  Router.route("about", { component: page, prerender: true });
  Router.route("about", { component: page, prerender: false });
  Router.route("about", { component: page });

  // There are no params to list.
  expect(Router.route).type.not.toBeCallableWith("about", { component: page, prerender: [{}] });
});

test("P2: a route with path params takes false, its params, or an Effect of them", () => {
  Router.route("users/:id", { path: idPath, component: page, prerender: false });
  Router.route("users/:id", { path: idPath, component: page, prerender: [{ id: 1 }, { id: 2 }] });
  Router.route("users/:id", { path: idPath, component: page, prerender: [] });
  Router.route("users/:id", {
    path: idPath,
    component: page,
    prerender: Effect.succeed([{ id: 1 }]),
  });
});

test("P3: a route with path params rejects `true`", () => {
  expect(Router.route).type.not.toBeCallableWith("users/:id", {
    path: idPath,
    component: page,
    prerender: true,
  });
});

test("P4: params are checked against the route's decoded path type", () => {
  // `id` decodes to a number, so the encoded string form is rejected.
  expect(Router.route).type.not.toBeCallableWith("users/:id", {
    path: idPath,
    component: page,
    prerender: [{ id: "1" }],
  });

  // A missing param is rejected.
  expect(Router.route).type.not.toBeCallableWith("users/:id", {
    path: idPath,
    component: page,
    prerender: [{}],
  });

  // A param the route does not declare is rejected.
  expect(Router.route).type.not.toBeCallableWith("users/:id", {
    path: idPath,
    component: page,
    prerender: [{ id: 1, extra: true }],
  });

  // The Effect form is checked the same way.
  expect(Router.route).type.not.toBeCallableWith("users/:id", {
    path: idPath,
    component: page,
    prerender: Effect.succeed([{ id: "1" }]),
  });
});

const docRoute = Router.route("docs/:slug", {
  path: slugPath,
  component: page,
  prerender: Effect.map(Docs, (docs) => docs.slugs.map((slug) => ({ slug }))),
});

test("P5: a prerender Effect's requirements travel on their own channel, apart from R", () => {
  expect<TreePR<typeof docRoute>>().type.toBe<Docs>();
  // The route's own requirements are untouched: the client never needs `Docs` for this.
  expect<TreeR<typeof docRoute>>().type.toBe<never>();

  // A route with no prerender Effect has an empty prerender channel.
  const plain = Router.route("plain", { component: page, prerender: true });
  expect<TreePR<typeof plain>>().type.toBe<never>();

  // Component and prerender requirements stay separate.
  const both = Router.route("both/:slug", {
    path: slugPath,
    component: Component.gen(function* () {
      return yield* h.div({}, yield* Theme);
    }),
    prerender: Effect.map(Docs, (docs) => docs.slugs.map((slug) => ({ slug }))),
  });
  expect<TreeR<typeof both>>().type.toBe<Theme>();
  expect<TreePR<typeof both>>().type.toBe<Docs>();
});

// Routes written inline in a layout's children get a contextual `TreeNode` type.
const inlineDef = Router.router(
  Router.layout(passThroughLayout, [
    Router.route("docs/:slug", {
      path: slugPath,
      component: page,
      prerender: Effect.map(Docs, (docs) => docs.slugs.map((slug) => ({ slug }))),
    }),
    Router.route("themed", {
      component: Component.gen(function* () {
        return yield* h.div({}, yield* Theme);
      }),
    }),
    // A param-less route inline: `prerender: true` must still be accepted here.
    Router.route("about", { component: page, prerender: true }),
    Router.route("users/:id", { path: idPath, component: page, prerender: [{ id: 1 }] }),
  ]),
  { notFound: () => h.div({}, "404") },
);

test("P5: the client app node does not require a prerender-only service", () => {
  // `Docs` is read only by a `prerender` Effect, so the browser never has to provide it.
  expect(RouterApp(inlineDef)).type.toBe<Node<never, Theme | Router>>();
});

test("P5/P17: prerender requirements reach the Layer, which provides Prerender", () => {
  // Inline routes keep precise requirements (not `any`), with and without `prerender`.
  expect(RouterServer.layer(inlineDef, { document: documentShell })).type.toBe<
    Layer.Layer<RouterServer.Prerender, never, HttpRouter.HttpRouter | Docs | Theme>
  >();
});

declare const prerender: RouterServer.Prerender["Service"];

test("P7: paths(output) yields URL paths and fails with the two prerender errors", () => {
  expect(prerender.paths("static")).type.toBe<
    Effect.Effect<
      ReadonlyArray<string>,
      RouterServer.PrerenderUndeclaredError | RouterServer.PrerenderPathsError
    >
  >();
  expect(prerender.paths).type.toBeCallableWith("server");
  expect(prerender.paths).type.not.toBeCallableWith("hybrid");
  expect<RouterServer.PrerenderOutput>().type.toBe<"server" | "static">();
});
