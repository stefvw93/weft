/**
 * Unit tests for the resolve-before-commit internal seams
 * (`resolve-before-commit.specs.md`): the resolved-commit stash
 * (set/take, consume-exactly-once, URL mismatch, absent slot), the staged
 * match view (AC-R4), and the leaf pre-run (AC-R1/AC-R2/AC-R7).
 */

import * as assert from "node:assert/strict";
import { Component, h, Subscribable } from "@weftui/core";
import { Cause, Effect, Exit, Option, Schema, Stream } from "effect";
import { describe, test } from "vite-plus/test";
import { isRouterNotFound, match, notFound, Router } from "~/index";
import type { RouteMatch } from "~/matcher";
import { preRunLeaf, setResolvedCommit, stageMatch, takeResolvedCommit } from "~/resolved-commit";

const Page = (label: string) => () => h.div({}, label);

/** A minimal `Router` service instance (no layer, no JSDOM) for seam tests. */
function fakeRouter(current: RouteMatch): Router["Service"] {
  return Router.of({
    currentMatch: Subscribable.make({
      get: Effect.succeed(current),
      changes: Stream.make(current),
    }),
    navigate: () => Effect.void,
    httpApiClient: Option.none(),
    navigating: Subscribable.make({
      get: Effect.succeed({ _tag: "Idle" as const }),
      changes: Stream.make({ _tag: "Idle" as const }),
    }),
  });
}

/** A def with a param leaf and a plain leaf, for building real `RouteMatch`es. */
function def() {
  return Router.router(
    Router.layout(
      {
        component: Component.gen(function* () {
          const outlet = yield* Router.Outlet;
          return yield* outlet;
        }),
      },
      [
        Router.route("about", { component: Page("about") }),
        Router.route("users/:id", {
          path: { id: Schema.NumberFromString },
          component: Page("user"),
        }),
      ],
    ),
    { notFound: () => h.h1({}, "404") },
  );
}

/** A real `Matched` for `url` via the shared matcher. */
function matched(url: string): RouteMatch {
  const m = match(def(), url);
  assert.equal(m._tag, "Matched");
  return m;
}

describe("resolved-commit stash (AC-R2)", () => {
  test("take returns the entry for the exact committed url and consumes it exactly once", () => {
    const router = fakeRouter(matched("/about"));
    const entry = { url: "/about", exit: Exit.succeed(h.div({}, "resolved")) };
    setResolvedCommit(router, entry);
    assert.equal(takeResolvedCommit(router, "/about"), entry);
    // Consumed: a second emission for the same url falls back to the slot.
    assert.equal(takeResolvedCommit(router, "/about"), undefined);
  });

  test("a url mismatch (stale entry) is not returned", () => {
    const router = fakeRouter(matched("/about"));
    setResolvedCommit(router, { url: "/about", exit: Exit.succeed(null) });
    assert.equal(takeResolvedCommit(router, "/users/7"), undefined);
  });

  test("an instance never written to (server render / hydration) yields undefined", () => {
    const router = fakeRouter(matched("/about"));
    assert.equal(takeResolvedCommit(router, "/about"), undefined);
  });
});

describe("staged match view (AC-R4)", () => {
  test("currentMatch.get resolves to the target; everything else delegates to the live service", async () => {
    const live = fakeRouter(matched("/about"));
    const target = matched("/users/7");
    const staged = stageMatch(live, target);

    const seen = await Effect.runPromise(staged.currentMatch.get);
    assert.equal(seen, target);
    // Live members delegate: reactive subscriptions and navigation are not staged.
    assert.equal(staged.navigate, live.navigate);
    assert.equal(staged.navigating, live.navigating);
    assert.equal(staged.httpApiClient, live.httpApiClient);
  });
});

describe("leaf pre-run (AC-R1/AC-R2/AC-R7)", () => {
  test("runs the leaf once with handler-arg props and returns a Success exit with the node", async () => {
    let runs = 0;
    let props: unknown;
    const leaf = matched("/users/7");
    assert.equal(leaf._tag, "Matched");
    const target: RouteMatch = {
      ...leaf,
      leaf: {
        ...leaf.leaf,
        component: (p: unknown) => {
          runs++;
          props = p;
          return h.div({}, "user");
        },
      },
    };
    const exit = await Effect.runPromise(preRunLeaf(fakeRouter(matched("/about")), target));
    assert.equal(runs, 1);
    assert.equal(Exit.isSuccess(exit), true);
    // The slot receives the target match's decoded { path, query }: exactly
    // what `renderLevel` passes (spec: Staged match).
    assert.deepEqual(props, { path: { id: 7 }, query: {} });
  });

  test("Router.params read during the pre-run decodes the TARGET match", async () => {
    let seenId: number | undefined;
    const leaf = matched("/users/7");
    assert.equal(leaf._tag, "Matched");
    const target: RouteMatch = {
      ...leaf,
      leaf: {
        ...leaf.leaf,
        component: Component.gen(function* () {
          const { id } = yield* Router.params({ id: Schema.NumberFromString });
          seenId = id;
          return yield* h.div({}, String(id));
        }),
      },
    };
    // The live service still points at /about: the url ref has not moved.
    const exit = await Effect.runPromise(preRunLeaf(fakeRouter(matched("/about")), target));
    assert.equal(Exit.isSuccess(exit), true);
    assert.equal(seenId, 7);
  });

  test("a notFound() body folds into a Failure exit carrying RouterNotFound (AC-R7)", async () => {
    const leaf = matched("/about");
    assert.equal(leaf._tag, "Matched");
    const target: RouteMatch = {
      ...leaf,
      leaf: {
        ...leaf.leaf,
        component: Component.gen(function* () {
          return yield* notFound();
        }),
      },
    };
    const exit = await Effect.runPromise(preRunLeaf(fakeRouter(matched("/about")), target));
    assert.equal(Exit.isFailure(exit), true);
    // The typed failure is recoverable from the exit for boundary replay (AC-R7).
    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause);
      assert.equal(Option.isSome(failure), true);
      if (Option.isSome(failure)) {
        assert.equal(isRouterNotFound(failure.value), true);
      }
    }
  });

  test("a defect body folds into a Failure exit; the pre-run effect itself never fails (AC-R7)", async () => {
    const leaf = matched("/about");
    assert.equal(leaf._tag, "Matched");
    const target: RouteMatch = {
      ...leaf,
      leaf: {
        ...leaf.leaf,
        component: () => Effect.die(new Error("boom")) as never,
      },
    };
    // `preRunLeaf` succeeds with a Failure exit: failures ride the Exit.
    const exit = await Effect.runPromise(preRunLeaf(fakeRouter(matched("/about")), target));
    assert.equal(Exit.isFailure(exit), true);
  });
});
