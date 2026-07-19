import * as assert from "node:assert/strict";
import { h, Subscribable } from "@weftui/core";
import { Effect, Option, Schema, Stream } from "effect";
import { JSDOM } from "jsdom";
import { afterEach, describe, test, vi } from "vite-plus/test";
import { back, forward, navigate, patchQuery, push, replace, setQuery } from "~/client/navigation";
import { Router, type NavigateOptions } from "~/index";
import { match, type RouteMatch } from "~/matcher";

const idParam = { id: Schema.NumberFromString };
const searchQuery = {
  q: Schema.optional(Schema.String),
  page: Schema.optional(Schema.NumberFromString),
};

const Page = (label: string) => () => h.div({}, label);

const userRoute = Router.route("users/:id", { path: idParam, component: Page("user") });
const searchRoute = Router.route("search", { query: searchQuery, component: Page("search") });
const aboutRoute = Router.route("about", { component: Page("about") });

const def = Router.router(
  Router.layout({ component: () => h.div({}, "shell") }, [userRoute, searchRoute, aboutRoute]),
  { notFound: () => h.h1({}, "404") },
);

/** Navigate calls recorded by the test `Router` service. */
let calls: Array<{ to: string; options: NavigateOptions | undefined }>;

/** A `Router` whose `navigate` records its args and whose `currentMatch` is `match(def, url)`. */
const routerFor = (m: RouteMatch): Router["Service"] =>
  Router.of({
    currentMatch: Subscribable.make({ get: Effect.succeed(m), changes: Stream.make(m) }),
    navigate: (to, options) =>
      Effect.sync(() => {
        calls.push({ to, options });
      }),
    httpApiClient: Option.none(),
    navigating: Subscribable.make({
      get: Effect.succeed({ _tag: "Idle" } as const),
      changes: Stream.make({ _tag: "Idle" } as const),
    }),
  });

/** Runs `eff` against the recording `Router` positioned at `url`. */
function run<A, E>(eff: Effect.Effect<A, E, Router>, url = "/"): Promise<A> {
  calls = [];
  return Effect.runPromise(Effect.provideService(eff, Router, routerFor(match(def, url))));
}

describe("navigation: navigate / push / replace", () => {
  test("navigate(ref, args) builds the href and pushes", async () => {
    await run(navigate(userRoute, { path: { id: 42 } }));
    assert.deepEqual(calls, [{ to: "/users/42", options: undefined }]);
  });

  test("navigate(ref, args, { replace }) forwards the replace option", async () => {
    await run(navigate(userRoute, { path: { id: 7 } }, { replace: true }));
    assert.deepEqual(calls, [{ to: "/users/7", options: { replace: true } }]);
  });

  test("navigate to a no-arg route needs no args", async () => {
    await run(navigate(aboutRoute));
    assert.deepEqual(calls, [{ to: "/about", options: undefined }]);
  });

  test("push navigates to a raw string (push)", async () => {
    await run(push("/about"));
    assert.deepEqual(calls, [{ to: "/about", options: undefined }]);
  });

  test("replace navigates to a raw string with replace", async () => {
    await run(replace("/about"));
    assert.deepEqual(calls, [{ to: "/about", options: { replace: true } }]);
  });
});

describe("navigation: setQuery / patchQuery", () => {
  test("setQuery replaces the current route's query (path preserved)", async () => {
    await run(setQuery({ page: 2 }), "/search?q=hi");
    assert.deepEqual(calls, [{ to: "/search?page=2", options: undefined }]);
  });

  test("setQuery({}) clears the query", async () => {
    await run(setQuery({}), "/search?q=hi");
    assert.deepEqual(calls, [{ to: "/search", options: undefined }]);
  });

  test("patchQuery merges into the current decoded query (key-sorted)", async () => {
    await run(patchQuery({ page: 2 }), "/search?q=hi");
    assert.deepEqual(calls, [{ to: "/search?page=2&q=hi", options: undefined }]);
  });

  test("patchQuery forwards navigate options", async () => {
    await run(patchQuery({ q: "x" }, { replace: true }), "/search");
    assert.deepEqual(calls, [{ to: "/search?q=x", options: { replace: true } }]);
  });

  test("setQuery / patchQuery are a no-op when no route is matched", async () => {
    await run(patchQuery({ page: 2 }), "/nope");
    assert.deepEqual(calls, []);
  });
});

describe("navigation: back / forward", () => {
  let dom: JSDOM;

  afterEach(() => {
    dom.window.close();
    vi.restoreAllMocks();
  });

  test("back / forward delegate to history.go(-1) / history.go(1)", async () => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/" });
    global.window = dom.window as unknown as Window & typeof globalThis;
    const go = vi.spyOn(dom.window.history, "go").mockImplementation(() => {});

    await Effect.runPromise(back());
    await Effect.runPromise(forward());

    assert.deepEqual(
      go.mock.calls.map((c) => c[0]),
      [-1, 1],
    );
  });
});
