import * as assert from "node:assert/strict";
import { AppRpcClientTag, Component, h } from "@weftui/core";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Context, Effect, Exit, Fiber, Layer, Option, Schema, Scope, Stream } from "effect";
import { JSDOM } from "jsdom";
import { afterEach, describe, test } from "vite-plus/test";
import { notFound, Router } from "~/index";
import { RouterLive, type RouterLiveOptions } from "~/client/router-live";
import type { RouterDef } from "~/compile";
import { takeResolvedCommit } from "~/resolved-commit";
import type { ComponentSlot } from "~/route-tree";

/** Minimal rpc group: the fixture has no `Boundary.rpc`, but `rpc` is required. */
const NoopRpcs = RpcGroup.make(Rpc.make("Noop", { payload: Schema.Void, success: Schema.Void }));

const Page = (label: string) => () => h.div({}, label);

/** An app-wide service exercised through the render-time `context` seam (AC4). */
class Greeting extends Context.Service<Greeting, string>()("test/Greeting") {}

/** A passthrough layout `component`: renders the injected outlet directly. */
const passthrough = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* outlet;
});

function fixture() {
  return Router.router(
    Router.layout({ component: passthrough }, [
      Router.route("about", { component: Page("about") }),
      Router.route("users/:id", { path: { id: Schema.NumberFromString }, component: Page("user") }),
    ]),
    { notFound: () => h.h1({}, "404") },
  );
}

let dom: JSDOM;

/** Sets up a fresh JSDOM (window/document + the globals `RouterLive` reads). */
function setupDom(url = "http://localhost/"): void {
  dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url });
  global.window = dom.window as unknown as Window & typeof globalThis;
  global.document = dom.window.document;
  global.Element = dom.window.Element;
  global.MouseEvent = dom.window.MouseEvent;
  global.HTMLAnchorElement = dom.window.HTMLAnchorElement;
  // JSDOM leaves `scrollTo` unimplemented (logs to stderr on call); a no-op stub
  // silences that for navigations that reset scroll. `spyScrollTo` overrides it.
  dom.window.scrollTo = (() => {}) as typeof dom.window.scrollTo;
}

afterEach(() => {
  // Restore a clean window between tests.
  dom.window.close();
});

/** Reads the `Router` service exposed by `RouterLive(def, options)`. */
function readService(options?: Partial<RouterLiveOptions>): Promise<Router["Service"]> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.provide(
        Effect.gen(function* () {
          return yield* Router;
        }),
        RouterLive(fixture(), { rpc: { group: NoopRpcs }, ...options }),
      ),
    ),
  );
}

describe("RouterLive — derived HttpApiClient", () => {
  test("CL1: exposes the derived HttpApiClient on the Router service as Option.some", async () => {
    setupDom();
    const service = await readService();
    assert.equal(Option.isSome(service.httpApiClient), true);
    if (Option.isSome(service.httpApiClient)) {
      // The client carries the api's "pages" group of endpoint methods.
      const client = service.httpApiClient.value as Record<string, unknown>;
      assert.equal(typeof client, "object");
      assert.ok("pages" in client);
    }
  });

  test("CL2: accepts a configurable baseUrl (defaults to same origin otherwise)", async () => {
    setupDom();
    // A custom baseUrl is accepted and the client still derives successfully.
    const service = await readService({ baseUrl: "https://api.example.com" });
    assert.equal(Option.isSome(service.httpApiClient), true);
  });
});

describe("RouterLive without rpc (rpc optional)", () => {
  test("provides Router with the options argument omitted entirely", async () => {
    setupDom();
    const service = await Effect.runPromise(
      Effect.scoped(Effect.provide(Router, RouterLive(fixture()))),
    );
    assert.equal(Option.isSome(service.httpApiClient), true);
  });

  test("the provided AppRpcClientTag fails descriptively when `rpc` is omitted", async () => {
    setupDom();
    const failure = await Effect.runPromise(
      Effect.scoped(
        Effect.provide(
          Effect.gen(function* () {
            const client = yield* AppRpcClientTag;
            return yield* Effect.flip(client.call("GetStock", undefined));
          }),
          RouterLive(fixture(), {}),
        ),
      ),
    );
    assert.ok(failure instanceof Error);
    assert.ok(failure.message.includes("GetStock"));
    assert.ok(failure.message.includes("rpc"));
  });
});

/** A fixture whose leaf reads the `Greeting` app service, so the def's `R` carries it. */
function greetingFixture() {
  return Router.router(
    Router.layout({ component: passthrough }, [
      Router.route("", {
        component: Component.gen(function* () {
          return yield* h.div({}, yield* Greeting);
        }),
      }),
    ]),
    { notFound: () => h.h1({}, "404") },
  );
}

describe("RouterLive render-time context seam (AC4)", () => {
  test("AC4: a service provided via `context` is merged into the layer and read by the hydrated tree", async () => {
    setupDom();
    const value = await Effect.runPromise(
      Effect.scoped(
        Effect.provide(
          Effect.gen(function* () {
            return yield* Greeting;
          }),
          // The same seam the client entry uses: the app service rides alongside
          // `Router` / `AppRpcClientTag`, so a `yield* Greeting` in the tree resolves.
          RouterLive(greetingFixture(), { context: Layer.succeed(Greeting, "hi-from-context") }),
        ),
      ),
    );
    assert.equal(value, "hi-from-context");
  });
});

// ── Pending (deferred-commit) navigation (`pending-navigation.specs.md`) ────────

/** Reads the `Router` service exposed by `RouterLive(def)` for an arbitrary def. */
function readServiceFor(def: RouterDef): Promise<Router["Service"]> {
  return Effect.runPromise(
    Effect.scoped(Effect.provide(Router, RouterLive(def, { rpc: { group: NoopRpcs } }))),
  );
}

/** A controllable lazy loader: a gate promise plus its resolver. */
function gateLoader(slot: ComponentSlot): {
  readonly load: () => Promise<ComponentSlot>;
  readonly resolve: () => void;
} {
  let resolve!: (s: ComponentSlot) => void;
  const gate = new Promise<ComponentSlot>((r) => {
    resolve = r;
  });
  return { load: () => gate, resolve: () => resolve(slot) };
}

/** Yields to the macrotask queue so a forked navigation runs its synchronous prefix. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const readNav = (s: Router["Service"]): Promise<{ readonly _tag: string; readonly to?: string }> =>
  Effect.runPromise(s.navigating.get);
const readMatch = (
  s: Router["Service"],
): Promise<{ readonly _tag: string; readonly url?: string }> =>
  Effect.runPromise(s.currentMatch.get);

describe("RouterLive — pending navigation (deferred commit)", () => {
  test("AC-N1/AC-N5: a lazy nav holds match + url until the chunk resolves; navigating Idle→Navigating→Idle", async () => {
    setupDom();
    const g = gateLoader(Component.make(() => h.div({}, "lazy")));
    const def = Router.router(
      Router.layout({ component: passthrough }, [
        Router.route("about", { component: Page("about") }),
        Router.route("lazy", { component: Router.lazy(g.load) }),
      ]),
      { notFound: () => h.h1({}, "404") },
    );
    const service = await readServiceFor(def);
    assert.equal((await readNav(service))._tag, "Idle");

    const fiber = Effect.runFork(service.navigate("/lazy"));
    await tick();
    // Mid-flight: navigating reports the target, but url + match have NOT moved.
    assert.deepEqual(await readNav(service), { _tag: "Navigating", to: "/lazy" });
    assert.equal((await readMatch(service))._tag, "NotFound");
    assert.equal(dom.window.location.pathname, "/");

    g.resolve();
    await Effect.runPromise(Fiber.join(fiber));
    // Committed: url + match moved together, navigating back to Idle.
    assert.equal(dom.window.location.pathname, "/lazy");
    assert.equal((await readMatch(service))._tag, "Matched");
    assert.equal((await readNav(service))._tag, "Idle");
  });

  test("AC-N3: an eager nav is synchronous and never emits Navigating", async () => {
    setupDom();
    const service = await readServiceFor(fixture());
    await Effect.runPromise(service.navigate("/about"));
    assert.equal(dom.window.location.pathname, "/about");
    assert.equal((await readMatch(service))._tag, "Matched");
    assert.equal((await readNav(service))._tag, "Idle");
  });

  test("AC-N7: latest-wins — a superseded lazy nav never commits", async () => {
    setupDom();
    const a = gateLoader(Component.make(() => h.div({}, "a")));
    const b = gateLoader(Component.make(() => h.div({}, "b")));
    const def = Router.router(
      Router.layout({ component: passthrough }, [
        Router.route("a", { component: Router.lazy(a.load) }),
        Router.route("b", { component: Router.lazy(b.load) }),
      ]),
      { notFound: () => h.h1({}, "404") },
    );
    const service = await readServiceFor(def);

    const fiberA = Effect.runFork(service.navigate("/a"));
    const fiberB = Effect.runFork(service.navigate("/b"));
    await tick();
    assert.deepEqual(await readNav(service), { _tag: "Navigating", to: "/b" });

    // Resolve the stale nav first: it must NOT commit or reset state.
    a.resolve();
    await Effect.runPromise(Fiber.join(fiberA));
    assert.equal(dom.window.location.pathname, "/");
    assert.deepEqual(await readNav(service), { _tag: "Navigating", to: "/b" });

    // Resolve the latest nav: it commits.
    b.resolve();
    await Effect.runPromise(Fiber.join(fiberB));
    assert.equal(dom.window.location.pathname, "/b");
    assert.equal((await readNav(service))._tag, "Idle");
  });

  test("AC-N9: a rejected chunk load dies (defect), resets navigating, leaves the match unchanged", async () => {
    setupDom();
    const def = Router.router(
      Router.layout({ component: passthrough }, [
        Router.route("boom", {
          component: Router.lazy(() => Promise.reject(new Error("chunk gone"))),
        }),
      ]),
      { notFound: () => h.h1({}, "404") },
    );
    const service = await readServiceFor(def);
    // A rejected load is a defect (AC-E1): the navigation fails rather than hanging.
    const exit = await Effect.runPromise(Effect.exit(service.navigate("/boom")));
    assert.equal(Exit.isFailure(exit), true);
    assert.equal((await readNav(service))._tag, "Idle");
    assert.equal((await readMatch(service))._tag, "NotFound");
    assert.equal(dom.window.location.pathname, "/");
  });
});

// ── Scroll reset on navigation (`scroll-reset.specs.md`) ────────────────────────

/** Installs a spy over the current JSDOM `window.scrollTo`, recording call args. */
function spyScrollTo(): { readonly calls: Array<readonly [number, number]> } {
  const calls: Array<readonly [number, number]> = [];
  dom.window.scrollTo = ((x: number, y: number) => {
    calls.push([x, y]);
  }) as typeof dom.window.scrollTo;
  return { calls };
}

describe("RouterLive — scroll reset (scroll-reset.specs.md)", () => {
  test("AC-S1: a path-changing push navigation scrolls the window to top", async () => {
    setupDom();
    const service = await readService();
    const spy = spyScrollTo();
    await Effect.runPromise(service.navigate("/about"));
    assert.equal(dom.window.location.pathname, "/about");
    assert.deepEqual(spy.calls, [[0, 0]]);
  });

  test("AC-S2: a query-only navigation on the same path does NOT scroll", async () => {
    setupDom("http://localhost/about");
    const service = await readService();
    const spy = spyScrollTo();
    // Same path, only the query changes — scroll is preserved.
    await Effect.runPromise(service.navigate("/about?tab=posts"));
    assert.equal(dom.window.location.pathname, "/about");
    assert.equal(dom.window.location.search, "?tab=posts");
    assert.deepEqual(spy.calls, []);
  });

  test("AC-S1: navigating to the identical URL does NOT scroll (no path change)", async () => {
    setupDom("http://localhost/about");
    const service = await readService();
    const spy = spyScrollTo();
    await Effect.runPromise(service.navigate("/about"));
    assert.deepEqual(spy.calls, []);
  });

  test("AC-S3: popstate (back/forward) never resets scroll (left to the browser)", async () => {
    setupDom();
    // Keep the layer scope open so the popstate listener stays registered.
    const scope = await Effect.runPromise(Scope.make());
    const ctx = await Effect.runPromise(
      Layer.buildWithScope(RouterLive(fixture(), { rpc: { group: NoopRpcs } }), scope),
    );
    const service = Context.get(ctx, Router);
    const spy = spyScrollTo();
    try {
      // Browser back/forward: url moves first, then popstate fires.
      dom.window.history.pushState(null, "", "/about");
      dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
      // The popstate handler commits in a background fiber; poll until it lands.
      for (let i = 0; i < 20 && (await readMatch(service))._tag !== "Matched"; i++) {
        await tick();
      }
      assert.equal((await readMatch(service))._tag, "Matched");
      assert.deepEqual(spy.calls, []);
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });
});

// ── Resolve-before-commit (component-effect deferred commit) ────────────────────
// Spec: `resolve-before-commit.specs.md`.

/** An eager component whose body blocks on a gate, counting its executions. */
function gateBody(label: string): {
  readonly component: ComponentSlot;
  readonly release: () => void;
  readonly runs: () => number;
  readonly interrupted: () => boolean;
} {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let runs = 0;
  let interrupted = false;
  const component = Component.gen(function* () {
    runs++;
    yield* Effect.promise(() => gate).pipe(
      Effect.onInterrupt(() => Effect.sync(() => (interrupted = true))),
    );
    return yield* h.div({}, label);
  }) as unknown as ComponentSlot;
  return {
    component,
    release: () => release(),
    runs: () => runs,
    interrupted: () => interrupted,
  };
}

describe("RouterLive — resolve-before-commit (leaf effect pre-run)", () => {
  test("AC-R1/AC-R5: an async-body nav holds match + url until the body resolves; navigating Idle→Navigating→Idle", async () => {
    setupDom();
    const g = gateBody("data");
    const def = Router.router(
      Router.layout({ component: passthrough }, [Router.route("data", { component: g.component })]),
      { notFound: () => h.h1({}, "404") },
    );
    const service = await readServiceFor(def);

    const fiber = Effect.runFork(service.navigate("/data"));
    await tick();
    // Mid-flight: the body is running, but url + match have NOT moved.
    assert.equal(g.runs(), 1);
    assert.deepEqual(await readNav(service), { _tag: "Navigating", to: "/data" });
    assert.equal((await readMatch(service))._tag, "NotFound");
    assert.equal(dom.window.location.pathname, "/");

    g.release();
    await Effect.runPromise(Fiber.join(fiber));
    assert.equal(dom.window.location.pathname, "/data");
    assert.equal((await readMatch(service))._tag, "Matched");
    assert.equal((await readNav(service))._tag, "Idle");
  });

  test("AC-R2: the body runs exactly once per navigation and its exit is stashed for the outlet", async () => {
    setupDom();
    const g = gateBody("data");
    const def = Router.router(
      Router.layout({ component: passthrough }, [Router.route("data", { component: g.component })]),
      { notFound: () => h.h1({}, "404") },
    );
    const service = await readServiceFor(def);
    const fiber = Effect.runFork(service.navigate("/data"));
    await tick();
    g.release();
    await Effect.runPromise(Fiber.join(fiber));

    assert.equal(g.runs(), 1);
    // The pre-run's outcome awaits the outlet under the committed url.
    const entry = takeResolvedCommit(service, "/data");
    assert.notEqual(entry, undefined);
    assert.equal(entry?.url, "/data");
    assert.equal(entry !== undefined && Exit.isSuccess(entry.exit), true);
  });

  test("AC-R3: a sync-body nav commits without ever emitting Navigating", async () => {
    setupDom();
    const service = await readServiceFor(fixture());
    const emissions: string[] = [];
    const collector = Effect.runFork(
      Stream.runForEach(service.navigating.changes, (s) =>
        Effect.sync(() => {
          emissions.push(s._tag);
        }),
      ),
    );
    await tick();
    await Effect.runPromise(service.navigate("/about"));
    await tick();
    await Effect.runPromise(Fiber.interrupt(collector));

    assert.equal(dom.window.location.pathname, "/about");
    assert.equal((await readMatch(service))._tag, "Matched");
    assert.equal(emissions.includes("Navigating"), false);
  });

  test("AC-R6: a superseded pre-run is interrupted and never commits; the newest wins", async () => {
    setupDom();
    const a = gateBody("a");
    const b = gateBody("b");
    const def = Router.router(
      Router.layout({ component: passthrough }, [
        Router.route("a", { component: a.component }),
        Router.route("b", { component: b.component }),
      ]),
      { notFound: () => h.h1({}, "404") },
    );
    const service = await readServiceFor(def);

    const fiberA = Effect.runFork(service.navigate("/a"));
    await tick();
    const fiberB = Effect.runFork(service.navigate("/b"));
    await tick();

    // Superseding interrupts the in-flight pre-run (AC-R6) — no need to release a.
    assert.equal(a.interrupted(), true);
    assert.deepEqual(await readNav(service), { _tag: "Navigating", to: "/b" });
    assert.equal(dom.window.location.pathname, "/");

    b.release();
    await Effect.runPromise(Fiber.join(fiberB));
    await Effect.runPromise(Effect.exit(Fiber.await(fiberA)));
    assert.equal(dom.window.location.pathname, "/b");
    assert.equal((await readNav(service))._tag, "Idle");
  });

  test("AC-R7: a failing body still commits the url; the failure exit is stashed, navigating resets", async () => {
    setupDom();
    const def = Router.router(
      Router.layout({ component: passthrough }, [
        Router.route("gone", {
          component: Component.gen(function* () {
            yield* Effect.promise(() => Promise.resolve());
            return yield* notFound();
          }),
        }),
      ]),
      { notFound: () => h.h1({}, "404") },
    );
    const service = await readServiceFor(def);
    // The navigate fiber itself does not fail from a component pre-run.
    await Effect.runPromise(service.navigate("/gone"));

    assert.equal(dom.window.location.pathname, "/gone");
    assert.equal((await readMatch(service))._tag, "Matched");
    assert.equal((await readNav(service))._tag, "Idle");
    const entry = takeResolvedCommit(service, "/gone");
    assert.equal(entry !== undefined && Exit.isFailure(entry.exit), true);
  });

  test("AC-R8: popstate pre-runs the target leaf before the ref moves (url already moved by the browser)", async () => {
    setupDom();
    const g = gateBody("data");
    const def = Router.router(
      Router.layout({ component: passthrough }, [
        Router.route("about", { component: Page("about") }),
        Router.route("data", { component: g.component }),
      ]),
      { notFound: () => h.h1({}, "404") },
    );
    // Keep the layer scope open for the test's duration: the popstate listener
    // is released with the scope, so `readServiceFor` (which closes it) won't do.
    const scope = await Effect.runPromise(Scope.make());
    const ctx = await Effect.runPromise(
      Layer.buildWithScope(RouterLive(def, { rpc: { group: NoopRpcs } }), scope),
    );
    const service = Context.get(ctx, Router);
    try {
      // Simulate the browser's back/forward: the url moves first, then popstate fires.
      dom.window.history.pushState(null, "", "/data");
      dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
      await tick();

      // Mid-flight: the browser already moved the url, but the match lags until resolve.
      assert.equal(dom.window.location.pathname, "/data");
      assert.equal((await readMatch(service))._tag, "NotFound");
      // The popstate handler forks commitTo onto a detached fiber and the Navigating
      // emit is a further forkChild behind it — poll instead of a single tick.
      for (let i = 0; i < 20 && (await readNav(service))._tag !== "Navigating"; i++) {
        await tick();
      }
      assert.deepEqual(await readNav(service), { _tag: "Navigating", to: "/data" });
      assert.equal((await readMatch(service))._tag, "NotFound");

      g.release();
      // The popstate handler runs in a background fiber; poll until it commits.
      for (let i = 0; i < 20 && (await readMatch(service))._tag !== "Matched"; i++) {
        await tick();
      }
      assert.equal((await readMatch(service))._tag, "Matched");
      assert.equal((await readNav(service))._tag, "Idle");
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });
});
