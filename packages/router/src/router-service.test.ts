import * as assert from "node:assert/strict";
import { Component, h, Subscribable } from "@weftui/core";
import { Effect, Exit, Option, Schema, Stream } from "effect";
import { describe, test } from "vite-plus/test";
import { Router, RouterParamsError } from "~/index";
import { match, type RouteMatch } from "~/matcher";

const idParam = { id: Schema.NumberFromString };
const sortQuery = { sort: Schema.optional(Schema.String) };

const def = Router.router(
  Router.layout(
    {
      component: Component.gen(function* () {
        const outlet = yield* Router.Outlet;
        return yield* outlet;
      }),
    },
    [
      Router.route("users/:id", {
        path: idParam,
        query: sortQuery,
        component: Component.make(() => h.div({}, "user")),
      }),
      Router.route("about", { component: Component.make(() => h.div({}, "about")) }),
    ],
  ),
  { notFound: () => h.h1({}, "404") },
);

/** A fixed-match `Router` service over a resolved match. */
const routerFor = (m: RouteMatch): Router["Service"] =>
  Router.of({
    currentMatch: Subscribable.make({ get: Effect.succeed(m), changes: Stream.make(m) }),
    navigate: () => Effect.void,
    httpApiClient: Option.none(),
    navigating: Subscribable.make({
      get: Effect.succeed({ _tag: "Idle" } as const),
      changes: Stream.make({ _tag: "Idle" } as const),
    }),
  });

/** Runs an accessor against the match for `url`, returning its `Exit`. */
function runAt<A, E>(eff: Effect.Effect<A, E, Router>, url: string): Promise<Exit.Exit<A, E>> {
  return Effect.runPromise(
    Effect.exit(Effect.provideService(eff, Router, routerFor(match(def, url)))),
  );
}

describe("Router.params / Router.query", () => {
  test("Router.params decodes the live match's path params", async () => {
    const exit = await runAt(Router.params(idParam), "/users/42");
    assert.deepEqual(exit, Exit.succeed({ id: 42 }));
  });

  test("Router.query decodes the live match's query (present and absent)", async () => {
    const present = await runAt(Router.query(sortQuery), "/users/42?sort=asc");
    assert.deepEqual(present, Exit.succeed({ sort: "asc" }));
    const absent = await runAt(Router.query(sortQuery), "/users/42");
    assert.deepEqual(absent, Exit.succeed({ sort: undefined }));
  });

  test("Router.params fails with RouterParamsError (source: path) when no route matches", async () => {
    const exit = await runAt(Router.params(idParam), "/nope");
    assert.ok(Exit.isFailure(exit));
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provideService(Router.params(idParam), Router, routerFor(match(def, "/nope"))),
      ),
    );
    assert.ok(error instanceof RouterParamsError);
    assert.equal(error.source, "path");
    assert.deepEqual([...error.keys], ["id"]);
  });

  test("Router.params reads the matched leaf's decoded value directly (absent ⇒ undefined)", async () => {
    // `/about` matches (no `:id`); direct-read returns the decoded value as-is,
    // so an absent param reads `undefined` rather than re-validating into an error.
    const exit = await runAt(Router.params(idParam), "/about");
    assert.deepEqual(exit, Exit.succeed({ id: undefined }));
  });

  test("Router.query fails with RouterParamsError (source: query) when no route matches", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provideService(Router.query(sortQuery), Router, routerFor(match(def, "/nope"))),
      ),
    );
    assert.ok(error instanceof RouterParamsError);
    assert.equal(error.source, "query");
  });
});

describe("Router.paramsStream / Router.queryStream", () => {
  /** Resolves a reactive accessor's `Subscribable` against the match for `url`. */
  function streamAt<A>(
    eff: Effect.Effect<Subscribable.Subscribable<A>, never, Router>,
    url: string,
  ): Promise<Subscribable.Subscribable<A>> {
    return Effect.runPromise(Effect.provideService(eff, Router, routerFor(match(def, url))));
  }

  test("paramsStream.get reads the live match's decoded path params", async () => {
    const sub = await streamAt(Router.paramsStream(idParam), "/users/42");
    assert.deepEqual(await Effect.runPromise(Subscribable.get(sub)), { id: 42 });
  });

  test("queryStream.get reads the live match's decoded query (present and absent)", async () => {
    const present = await streamAt(Router.queryStream(sortQuery), "/users/42?sort=asc");
    assert.deepEqual(await Effect.runPromise(Subscribable.get(present)), { sort: "asc" });
    const absent = await streamAt(Router.queryStream(sortQuery), "/users/42");
    assert.deepEqual(await Effect.runPromise(Subscribable.get(absent)), { sort: undefined });
  });

  test("paramsStream stays live on NotFound, yielding the empty subset (no failure)", async () => {
    const sub = await streamAt(Router.paramsStream(idParam), "/nope");
    assert.deepEqual(await Effect.runPromise(Subscribable.get(sub)), { id: undefined });
  });
});
