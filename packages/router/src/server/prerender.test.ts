import * as assert from "node:assert/strict";
import { Component, h } from "@weftui/core";
import { HttpRouter } from "effect/http";
import { Context, Effect, Exit, Layer, Schema } from "effect";
import { describe, test } from "vite-plus/test";
import { href, Router } from "~/index";
import type { RouterDef } from "~/compile";
import { RouterServer } from "~/server/router-server";

// Spec: `../prerender.specs.md`. P1 to P5 and P17 are type-level
// (`__type-tests__/prerender.tst.ts`). P18 is covered by `router-server.test.ts`
// passing unmodified.

const page = (text: string) => () => h.h1({}, text);
const NotFound = () => h.h1({}, "404: not found");

const layout = {
  component: Component.gen(function* () {
    const outlet = yield* Router.Outlet;
    return yield* outlet;
  }),
};

const document = Component.gen(function* () {
  const app = yield* Router.Outlet;
  return yield* h.html([h.body([app])]);
});

/** Builds `RouterServer.layer(def)` with `services` provided and returns its `Prerender` service result. */
const pathsOf = (
  // oxlint-disable-next-line typescript/no-explicit-any
  def: RouterDef<any, any>,
  output: RouterServer.PrerenderOutput,
  // oxlint-disable-next-line typescript/no-explicit-any
  services: Layer.Layer<any> = Layer.empty as Layer.Layer<any>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const built = RouterServer.layer(def, { document }).pipe(
        Layer.provide(services),
        Layer.provide(HttpRouter.layer),
      ) as Layer.Layer<RouterServer.Prerender>;
      const context = yield* Layer.build(built);
      return yield* Context.get(context, RouterServer.Prerender).paths(output);
    }),
  );

const run = (...args: Parameters<typeof pathsOf>) => Effect.runPromise(pathsOf(...args));

/** Runs to an `Exit` and returns the typed failure, failing the test on success or a defect. */
const failureOf = async (...args: Parameters<typeof pathsOf>) => {
  const exit = await Effect.runPromiseExit(pathsOf(...args));
  assert.ok(Exit.isFailure(exit), "expected paths() to fail");
  const error = await Effect.runPromise(Effect.flip(pathsOf(...args)));
  return error;
};

class Docs extends Context.Service<Docs, { readonly slugs: readonly string[] }>()("test/Docs") {}

describe('RouterServer.Prerender: output "server"', () => {
  test("P7/P8: only routes that declare `prerender` contribute paths", async () => {
    const def = Router.router(
      Router.layout(layout, [
        Router.route("", { component: page("home"), prerender: true }),
        Router.route("about", { component: page("about") }),
        Router.route("off", { component: page("off"), prerender: false }),
        Router.route("users/:id", {
          path: { id: Schema.NumberFromString },
          component: page("user"),
          prerender: [{ id: 1 }, { id: 2 }],
        }),
        Router.route("posts/:slug", { path: { slug: Schema.String }, component: page("post") }),
      ]),
      { notFound: NotFound },
    );
    assert.deepEqual(await run(def, "server"), ["/", "/users/1", "/users/2"]);
  });

  test("P16: a def with no prerenderable routes yields an empty array", async () => {
    const def = Router.router(
      Router.layout(layout, [
        Router.route("", { component: page("home") }),
        Router.route("users/:id", { path: { id: Schema.String }, component: page("user") }),
      ]),
      { notFound: NotFound },
    );
    assert.deepEqual(await run(def, "server"), []);
  });

  test("an empty params array is a valid declaration with no pages", async () => {
    const def = Router.router(
      Router.layout(layout, [
        Router.route("users/:id", {
          path: { id: Schema.String },
          component: page("user"),
          prerender: [],
        }),
      ]),
      { notFound: NotFound },
    );
    assert.deepEqual(await run(def, "server"), []);
    assert.deepEqual(await run(def, "static"), []);
  });
});

describe('RouterServer.Prerender: output "static"', () => {
  test("P9: every param-less route contributes unless it sets `prerender: false`", async () => {
    const def = Router.router(
      Router.layout(layout, [
        Router.route("", { component: page("home") }),
        Router.route("about", { component: page("about"), prerender: true }),
        Router.route("off", { component: page("off"), prerender: false }),
        Router.route("users/:id", {
          path: { id: Schema.NumberFromString },
          component: page("user"),
          prerender: [{ id: 7 }],
        }),
      ]),
      { notFound: NotFound },
    );
    assert.deepEqual(await run(def, "static"), ["/", "/about", "/users/7"]);
  });

  test("P10: a param route with no declaration fails with PrerenderUndeclaredError naming the pattern", async () => {
    const def = Router.router(
      Router.layout(layout, [
        Router.route("", { component: page("home") }),
        Router.route("posts/:slug", { path: { slug: Schema.String }, component: page("post") }),
      ]),
      { notFound: NotFound },
    );
    const error = await failureOf(def, "static");
    assert.equal(error._tag, "PrerenderUndeclaredError");
    assert.equal(error.route, "/posts/:slug");
    assert.ok(error.message.includes("/posts/:slug"));
  });

  test("P10: `prerender: false` on that param route lets enumeration pass", async () => {
    const def = Router.router(
      Router.layout(layout, [
        Router.route("", { component: page("home") }),
        Router.route("posts/:slug", {
          path: { slug: Schema.String },
          component: page("post"),
          prerender: false,
        }),
      ]),
      { notFound: NotFound },
    );
    assert.deepEqual(await run(def, "static"), ["/"]);
  });
});

describe("RouterServer.Prerender: paths", () => {
  test("P11: params are encoded into the pattern exactly as href encodes them", async () => {
    const tagRoute = Router.route("tags/:tag/:page", {
      path: { tag: Schema.String, page: Schema.NumberFromString },
      query: { sort: Schema.optional(Schema.String) },
      component: page("tag"),
      prerender: [
        { tag: "effect ts", page: 2 },
        { tag: "a/b", page: 10 },
      ],
    });
    const def = Router.router(Router.layout(layout, [tagRoute]), { notFound: NotFound });
    const paths = await run(def, "server");
    assert.deepEqual(paths, ["/tags/effect%20ts/2", "/tags/a%2Fb/10"]);
    assert.equal(paths[0], href(tagRoute, { path: { tag: "effect ts", page: 2 } }));
    // Query params are never part of a prerender path.
    assert.ok(paths.every((path) => !path.includes("?")));
  });

  test("P12: paths come in route-tree order, then declaration order, without duplicates", async () => {
    const def = Router.router(
      Router.layout(layout, [
        Router.route("b", { component: page("b"), prerender: true }),
        Router.layout(layout, [
          Router.route("users/:id", {
            path: { id: Schema.String },
            component: page("user"),
            prerender: [{ id: "z" }, { id: "a" }, { id: "z" }],
          }),
        ]),
        Router.route("a", { component: page("a"), prerender: true }),
      ]),
      { notFound: NotFound },
    );
    assert.deepEqual(await run(def, "server"), ["/b", "/users/z", "/users/a", "/a"]);
  });

  test("P13: a prerender Effect reads the services provided to the Layer", async () => {
    const def = Router.router(
      Router.layout(layout, [
        Router.route("docs/:slug", {
          path: { slug: Schema.String },
          component: page("doc"),
          prerender: Effect.map(Docs, (docs) => docs.slugs.map((slug) => ({ slug }))),
        }),
      ]),
      { notFound: NotFound },
    );
    const DocsLive = Layer.succeed(Docs, { slugs: ["intro", "guide"] });
    assert.deepEqual(await run(def, "server", DocsLive), ["/docs/intro", "/docs/guide"]);
  });

  test("P13: a prerender Effect runs when paths is called, not when the Layer is built", async () => {
    let runs = 0;
    const def = Router.router(
      Router.layout(layout, [
        Router.route("docs/:slug", {
          path: { slug: Schema.String },
          component: page("doc"),
          prerender: Effect.sync(() => {
            runs += 1;
            return [{ slug: "intro" }];
          }),
        }),
      ]),
      { notFound: NotFound },
    );
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const built = RouterServer.layer(def, { document }).pipe(
            Layer.provide(HttpRouter.layer),
          ) as Layer.Layer<RouterServer.Prerender>;
          const context = yield* Layer.build(built);
          const prerender = Context.get(context, RouterServer.Prerender);
          assert.equal(runs, 0);
          assert.deepEqual(yield* prerender.paths("server"), ["/docs/intro"]);
          assert.equal(runs, 1);
        }),
      ),
    );
  });

  test("P14: a failing prerender Effect fails with PrerenderPathsError carrying the pattern and cause", async () => {
    const boom = new Error("docs unavailable");
    const def = Router.router(
      Router.layout(layout, [
        Router.route("docs/:slug", {
          path: { slug: Schema.String },
          component: page("doc"),
          prerender: Effect.fail(boom),
        }),
      ]),
      { notFound: NotFound },
    );
    const error = await failureOf(def, "server");
    assert.equal(error._tag, "PrerenderPathsError");
    assert.equal(error.route, "/docs/:slug");
    assert.equal((error as RouterServer.PrerenderPathsError).cause, boom);
    assert.ok(error.message.includes("/docs/:slug"));
  });

  test("P15: a param object that does not encode through the path schema fails with PrerenderPathsError", async () => {
    const def = Router.router(
      Router.layout(layout, [
        Router.route("users/:id", {
          path: { id: Schema.NumberFromString },
          component: page("user"),
          // Bypasses the compile-time check (P4) to exercise the runtime guard.
          prerender: [{ id: "not-a-number" }] as never,
        }),
      ]),
      { notFound: NotFound },
    );
    const error = await failureOf(def, "server");
    assert.equal(error._tag, "PrerenderPathsError");
    assert.equal(error.route, "/users/:id");
  });
});

describe("prerender does not change routing or rendering", () => {
  test("P6: a route with `prerender` matches, renders and builds hrefs as before", async () => {
    const userRoute = Router.route("users/:id", {
      path: { id: Schema.NumberFromString },
      component: ({ path }) => h.h1({}, `User ${path.id}`),
      prerender: [{ id: 1 }],
    });
    const def = Router.router(
      Router.layout(layout, [
        Router.route("", { component: page("home"), prerender: true }),
        userRoute,
      ]),
      { notFound: NotFound },
    );
    assert.deepEqual(await run(def, "server"), ["/", "/users/1"]);
    // A param that was not listed still renders live.
    const rendered = await Effect.runPromise(
      RouterServer.render(def, { document, url: "/users/99" }),
    );
    assert.equal(rendered.status, 200);
    assert.ok(rendered.html.includes("User 99"));
    assert.equal(href(userRoute, { path: { id: 5 } }), "/users/5");
    const missing = await Effect.runPromise(RouterServer.render(def, { document, url: "/nope" }));
    assert.equal(missing.status, 404);
  });
});
