import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import {
  Cause,
  Context,
  Data,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Ref,
  Schedule,
  Stream,
  SubscriptionRef,
  pipe,
} from "effect";
import { Boundary, h } from "@weftui/core";
import type { Renderable } from "@weftui/core/types";
import { JSDOM } from "jsdom";
import { HydrationMismatchError, UnsupportedNodeTypeError } from "~/data";
import * as WeftApp from "./weft-app";
import { renderToStringHydratable as _renderToStringHydratable } from "~/server";
import { NoRpc } from "../__tests__/rpc-stub";
import { makeErrorLogCapture } from "../__tests__/log-capture";

// ============================================================================
// Test setup (jsdom, mirrors dom.test.ts / mount-scoped.test.ts scaffolding)
// ============================================================================

function createTestDOM(): JSDOM {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Comment = dom.window.Comment;
  global.Text = dom.window.Text;
  return dom;
}

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait for a forked stream emission/update to reach the DOM. */
const tick = (): Promise<void> => waitFor(150);

const renderToStringHydratable = (n: Renderable) =>
  Effect.provide(_renderToStringHydratable(n), NoRpc);

/** A plain service whose presence/absence components can probe. */
class Probe extends Context.Service<Probe, { readonly value: number }>()("test/weft-app/Probe") {}

/** A SubscriptionRef-backed service shared across roots (WA9). */
class Shared extends Context.Service<
  Shared,
  { readonly count: SubscriptionRef.SubscriptionRef<number> }
>()("test/weft-app/Shared") {}

const SharedLive = Layer.effect(
  Shared,
  Effect.map(SubscriptionRef.make(0), (count) => ({ count })),
);

class FooError extends Data.TaggedError("Foo")<{ readonly msg: string }> {}
class LayerBoom extends Data.TaggedError("LayerBoom")<{ readonly msg: string }> {}

/**
 * Forks a subscriber on the app's `errors` stream. `received` fills as errors
 * are published; `done` flips when the stream completes (hub shutdown);
 * `unsubscribe` interrupts the subscription.
 */
function subscribeErrors<R, E>(app: WeftApp.WeftApp<R, E>) {
  const received: WeftApp.UnhandledError[] = [];
  const state = { done: false };
  const fiber = Effect.runFork(
    pipe(
      Stream.runForEach(WeftApp.errors(app), (e) => Effect.sync(() => void received.push(e))),
      Effect.ensuring(Effect.sync(() => void (state.done = true))),
    ),
  );
  const unsubscribe = () => Effect.runPromise(Effect.asVoid(Fiber.interrupt(fiber)));
  return { received, state, unsubscribe };
}

// ============================================================================
// WA1: lazy make — no layer construction until first mount
// ============================================================================

describe("WA1: lazy make", () => {
  it("builds the layer on first mount, not at make time", async () => {
    createTestDOM();
    const root = createRoot();
    let built = 0;

    const CountingLive = Layer.effect(
      Probe,
      Effect.sync(() => {
        built++;
        return { value: 7 };
      }),
    );

    const app = WeftApp.make(CountingLive);
    assert.equal(built, 0, "make performs no layer construction");

    await Effect.runPromise(WeftApp.mount(app, h.div({}, "ok"), root));
    assert.equal(built, 1, "layer built lazily on first mount");

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// WA2: mount — renders, returns RootHandle with element, layer E surfaces
// ============================================================================

describe("WA2: mount", () => {
  it("renders into root and returns a handle exposing the root element", async () => {
    createTestDOM();
    const root = createRoot();
    const app = WeftApp.make();

    const handle = await Effect.runPromise(WeftApp.mount(app, h.div({}, "hello"), root));
    assert.equal(root.textContent, "hello");
    assert.equal(handle.element, root, "handle.element is the mount root");

    await Effect.runPromise(WeftApp.dispose(app));
  });

  it("surfaces a layer construction failure on the first mount", async () => {
    createTestDOM();
    const root = createRoot();
    const BoomLive = Layer.effect(Probe, Effect.fail(new LayerBoom({ msg: "no config" })));
    const app = WeftApp.make(BoomLive);

    const exit = await Effect.runPromiseExit(WeftApp.mount(app, h.div({}, "x"), root));
    assert.ok(Exit.isFailure(exit), "mount fails");
    const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null;
    assert.ok(error instanceof LayerBoom, "fails with the layer's error");

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// WA3: hydrate — adopts server DOM; adds HydrationMismatchError
// ============================================================================

describe("WA3: hydrate", () => {
  it("hydrates server HTML and returns a RootHandle", async () => {
    createTestDOM();
    const root = createRoot();
    const node = h.div({}, "srv");
    root.innerHTML = await Effect.runPromise(renderToStringHydratable(node));

    const app = WeftApp.make();
    const handle = await Effect.runPromise(WeftApp.hydrate(app, node, root));
    assert.equal(root.textContent, "srv");
    assert.equal(handle.element, root);

    await Effect.runPromise(WeftApp.dispose(app));
  });

  it("fails with HydrationMismatchError on a tag mismatch", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = "<span>hi</span>";

    const app = WeftApp.make();
    const exit = await Effect.runPromiseExit(WeftApp.hydrate(app, h.div({}, "hi"), root));
    assert.ok(Exit.isFailure(exit));
    const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null;
    assert.ok(error instanceof HydrationMismatchError);

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// WA4: root isolation — unmount A, B lives
// ============================================================================

describe("WA4: root isolation", () => {
  it("unmounting root A leaves root B's subscriptions live", async () => {
    createTestDOM();
    const rootA = createRoot();
    const rootB = createRoot();
    const region = await Effect.runPromise(SubscriptionRef.make<Renderable>("v1"));
    const app = WeftApp.make();

    const handleA = await Effect.runPromise(
      WeftApp.mount(app, h.div({}, [SubscriptionRef.changes(region)]), rootA),
    );
    await Effect.runPromise(
      WeftApp.mount(app, h.div({}, [SubscriptionRef.changes(region)]), rootB),
    );
    await tick();
    assert.equal(rootA.textContent, "v1");
    assert.equal(rootB.textContent, "v1");

    await Effect.runPromise(handleA.unmount());
    await Effect.runPromise(SubscriptionRef.set(region, "v2"));
    await tick();
    assert.equal(rootA.textContent, "v1", "A frozen after unmount");
    assert.equal(rootB.textContent, "v2", "B still live");

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// WA5: idempotent unmount — teardown once, runtime untouched, DOM retained
// ============================================================================

describe("WA5: idempotent unmount", () => {
  it("repeated unmount runs teardown once, keeps DOM, keeps the runtime alive", async () => {
    createTestDOM();
    const root = createRoot();
    let teardownCount = 0;
    const app = WeftApp.make(SharedLive);

    const node = h.div({}, [
      Stream.make("x").pipe(
        Stream.concat(Stream.never),
        Stream.ensuring(Effect.sync(() => void teardownCount++)),
      ),
    ]);

    const handle = await Effect.runPromise(WeftApp.mount(app, node, root));
    await tick();

    await Effect.runPromise(handle.unmount());
    await Effect.runPromise(handle.unmount());
    await tick();

    assert.equal(teardownCount, 1, "teardown side-effect fires exactly once");
    assert.ok(root.childNodes.length > 0, "DOM nodes are not removed from root");

    // The app runtime is untouched: services still resolvable through it.
    const shared = await app.runtime.runPromise(Effect.map(Shared, (s) => s.count));
    assert.ok(shared, "runtime still serves the app layer after unmount");

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// WA6: dispose ordering — roots close before layers release, hub shuts last
// ============================================================================

describe("WA6: dispose ordering", () => {
  it("closes root scopes before releasing layers, then shuts the hub", async () => {
    createTestDOM();
    const root = createRoot();
    const events: string[] = [];

    const ProbeLive = Layer.effect(
      Probe,
      Effect.acquireRelease(Effect.succeed({ value: 1 }), () =>
        Effect.sync(() => void events.push("layer-release")),
      ),
    );
    const app = WeftApp.make(ProbeLive);

    const node = h.div({}, [
      Stream.make("x").pipe(
        Stream.concat(Stream.never),
        Stream.ensuring(Effect.sync(() => void events.push("root-teardown"))),
      ),
    ]);
    await Effect.runPromise(WeftApp.mount(app, node, root));
    await tick();

    const sub = subscribeErrors(app);
    await tick();

    await Effect.runPromise(WeftApp.dispose(app));
    await tick();

    assert.deepEqual(events, ["root-teardown", "layer-release"], "roots before layers");
    assert.equal(sub.state.done, true, "errors stream completes at hub shutdown");
  });
});

// ============================================================================
// WA7: idempotent dispose
// ============================================================================

describe("WA7: idempotent dispose", () => {
  it("second dispose is a safe no-op; teardown runs once", async () => {
    createTestDOM();
    const root = createRoot();
    let releases = 0;

    const ProbeLive = Layer.effect(
      Probe,
      Effect.acquireRelease(Effect.succeed({ value: 1 }), () => Effect.sync(() => void releases++)),
    );
    const app = WeftApp.make(ProbeLive);
    await Effect.runPromise(WeftApp.mount(app, h.div({}, "x"), root));

    await Effect.runPromise(WeftApp.dispose(app));
    await Effect.runPromise(WeftApp.dispose(app));
    assert.equal(releases, 1, "layer released exactly once");
  });
});

// ============================================================================
// WA8: mount after dispose fails (does not hang)
// ============================================================================

describe("WA8: mount after dispose", () => {
  it("fails instead of hanging", async () => {
    createTestDOM();
    const root = createRoot();
    const app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, h.div({}, "x"), root));
    await Effect.runPromise(WeftApp.dispose(app));

    const exit = await Effect.runPromiseExit(WeftApp.mount(app, h.div({}, "y"), createRoot()));
    assert.ok(!Exit.isSuccess(exit), "mount on a disposed app does not succeed");
  });
});

// ============================================================================
// WA9: shared service state across roots
// ============================================================================

describe("WA9: shared services across roots", () => {
  it("an update from root A's handler is observed reactively in root B", async () => {
    createTestDOM();
    const rootA = createRoot();
    const rootB = createRoot();
    const app = WeftApp.make(SharedLive);

    const buttonA = h.div([
      h.button(
        {
          type: "button",
          "data-testid": "inc",
          onclick: () =>
            Effect.gen(function* () {
              const s = yield* Shared;
              yield* SubscriptionRef.update(s.count, (n) => n + 1);
            }),
        },
        "inc",
      ),
    ]);

    const viewB = h.div({}, [
      Stream.unwrap(
        Effect.gen(function* () {
          const s = yield* Shared;
          return Stream.map(SubscriptionRef.changes(s.count), (n) => `count:${n}`);
        }),
      ),
    ]);

    await Effect.runPromise(WeftApp.mount(app, buttonA, rootA));
    await Effect.runPromise(WeftApp.mount(app, viewB, rootB));
    await tick();
    assert.equal(rootB.textContent, "count:0");

    rootA.querySelector<HTMLElement>('[data-testid="inc"]')?.click();
    await tick();
    assert.equal(rootB.textContent, "count:1", "cross-root reactive propagation");

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// WA10: stream-pump failures/defects (no Boundary) reach the hub
// ============================================================================

describe("WA10: unhandled stream failures reach the hub", () => {
  it("publishes a child-stream failure with its region and root", async () => {
    createTestDOM();
    const root = createRoot();
    const app = WeftApp.make();
    const sub = subscribeErrors(app);
    await tick();

    const node = h.div({}, [
      Stream.concat(Stream.make("ok"), Stream.fail(new FooError({ msg: "pump-fail" }))),
    ]);
    const handle = await Effect.runPromise(WeftApp.mount(app, node, root));
    await tick();

    assert.equal(sub.received.length, 1, "exactly one hub entry");
    const entry = sub.received[0]!;
    assert.ok(entry.region.startsWith("child:"), `region is the child slot (${entry.region})`);
    const pumpError = Cause.squash(entry.cause);
    assert.ok(pumpError instanceof FooError && pumpError.msg === "pump-fail");
    assert.equal(entry.root, handle, "entry carries the originating root handle");

    await Effect.runPromise(WeftApp.dispose(app));
    await sub.unsubscribe();
  });

  it("publishes an attribute-stream defect; unmount interruption publishes nothing", async () => {
    createTestDOM();
    const root = createRoot();
    const app = WeftApp.make();
    const sub = subscribeErrors(app);
    await tick();

    const dying = h.div({
      "data-live": Stream.concat(Stream.make("a"), Stream.die(new Error("attr-defect"))),
    });
    await Effect.runPromise(WeftApp.mount(app, dying, root));
    await tick();

    assert.equal(sub.received.length, 1);
    assert.ok(sub.received[0]!.region.startsWith("attribute:"));
    assert.ok(Cause.pretty(sub.received[0]!.cause).includes("attr-defect"));

    // A live stream interrupted by unmount must not publish.
    const rootB = createRoot();
    const region = await Effect.runPromise(SubscriptionRef.make<Renderable>("live"));
    const handleB = await Effect.runPromise(
      WeftApp.mount(app, h.div({}, [SubscriptionRef.changes(region)]), rootB),
    );
    await tick();
    await Effect.runPromise(handleB.unmount());
    await tick();
    assert.equal(sub.received.length, 1, "interruption is filtered from the hub");

    await Effect.runPromise(WeftApp.dispose(app));
    await sub.unsubscribe();
  });
});

// ============================================================================
// WA11: outermost boundary escape reaches the hub
// ============================================================================

describe("WA11: outermost boundary escape", () => {
  it("publishes with region boundary:outermost when no boundary handles a defect", async () => {
    createTestDOM();
    const root = createRoot();
    const app = WeftApp.make();
    const sub = subscribeErrors(app);
    await tick();

    // A defect → catch's match returns null → escapes the outermost boundary.
    const dyingStream = Stream.concat(
      Stream.make(h.div({ class: "content" }, "live")),
      Stream.die(new Error("escape-defect")),
    );
    await Effect.runPromise(
      WeftApp.mount(
        app,
        Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "fb") }, [dyingStream]),
        root,
      ),
    );
    await tick();

    assert.equal(sub.received.length, 1);
    assert.equal(sub.received[0]!.region, "boundary:outermost");
    assert.ok(Cause.pretty(sub.received[0]!.cause).includes("escape-defect"));

    await Effect.runPromise(WeftApp.dispose(app));
    await sub.unsubscribe();
  });
});

// ============================================================================
// WA12: event-handler failures AND defects reach the hub exactly once
// ============================================================================

describe("WA12: event-handler errors reach the hub", () => {
  it("publishes a handler failure exactly once per dispatch", async () => {
    createTestDOM();
    const root = createRoot();
    const app = WeftApp.make();
    const sub = subscribeErrors(app);
    await tick();

    const node = h.div([
      h.button(
        {
          type: "button",
          "data-testid": "boom",
          onclick: () => Effect.fail(new FooError({ msg: "handler-fail" })),
        },
        "boom",
      ),
    ]);
    await Effect.runPromise(WeftApp.mount(app, node, root));
    await tick();

    root.querySelector<HTMLElement>('[data-testid="boom"]')?.click();
    await tick();

    assert.equal(sub.received.length, 1, "exactly one publish per failing dispatch");
    assert.ok(sub.received[0]!.region.startsWith("event:"), sub.received[0]!.region);
    assert.ok(sub.received[0]!.region.includes("click"));
    const handlerError = Cause.squash(sub.received[0]!.cause);
    assert.ok(handlerError instanceof FooError && handlerError.msg === "handler-fail");

    await Effect.runPromise(WeftApp.dispose(app));
    await sub.unsubscribe();
  });

  it("publishes a handler defect, including with NODE_ENV=production", async () => {
    createTestDOM();
    const root = createRoot();
    const app = WeftApp.make();
    const sub = subscribeErrors(app);
    await tick();

    const node = h.div([
      h.button(
        {
          type: "button",
          "data-testid": "die",
          onclick: () => Effect.die(new Error("handler-defect")),
        },
        "die",
      ),
    ]);
    await Effect.runPromise(WeftApp.mount(app, node, root));
    await tick();

    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      root.querySelector<HTMLElement>('[data-testid="die"]')?.click();
      await tick();
    } finally {
      process.env.NODE_ENV = prevEnv;
    }

    assert.equal(sub.received.length, 1, "defect published even in production");
    assert.ok(Cause.pretty(sub.received[0]!.cause).includes("handler-defect"));

    await Effect.runPromise(WeftApp.dispose(app));
    await sub.unsubscribe();
  });
});

// ============================================================================
// WA13: default log fallback — active without subscribers, suppressed with
// ============================================================================

describe("WA13: default log fallback", () => {
  it("logs with weft.region when unsubscribed, suppresses while subscribed, resumes after", async () => {
    createTestDOM();
    const root = createRoot();
    const { entries, logger } = makeErrorLogCapture();
    // The logger comes from the app layer — the only context mounts see (WA17).
    const app = WeftApp.make(logger);

    const node = h.div([
      h.button(
        {
          type: "button",
          "data-testid": "boom",
          onclick: () => Effect.fail(new FooError({ msg: "fallback-check" })),
        },
        "boom",
      ),
    ]);
    await Effect.runPromise(WeftApp.mount(app, node, root));
    await tick();
    const button = root.querySelector<HTMLElement>('[data-testid="boom"]');

    // Phase 1: no subscribers → default log fires, annotated with the region.
    button?.click();
    await tick();
    assert.equal(entries.length, 1, "default log fires with no subscribers");
    assert.ok(
      typeof entries[0]!.annotations["weft.region"] === "string",
      "log carries the weft.region annotation",
    );

    // Phase 2: subscribed → suppressed; the subscriber receives the error.
    const sub = subscribeErrors(app);
    await tick();
    button?.click();
    await tick();
    assert.equal(entries.length, 1, "default log suppressed while subscribed");
    assert.equal(sub.received.length, 1, "subscriber receives the error");

    // Phase 3: unsubscribed again → fallback resumes.
    await sub.unsubscribe();
    await tick();
    button?.click();
    await tick();
    assert.equal(entries.length, 2, "default log resumes after last unsubscribe");

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// WA14: errors stream — no replay, every subscriber sees subsequent errors
// ============================================================================

describe("WA14: errors stream semantics", () => {
  it("does not replay past errors; delivers new ones to all subscribers", async () => {
    createTestDOM();
    const root = createRoot();
    const app = WeftApp.make();

    const node = h.div([
      h.button(
        {
          type: "button",
          "data-testid": "boom",
          onclick: () => Effect.fail(new FooError({ msg: "seq" })),
        },
        "boom",
      ),
    ]);
    await Effect.runPromise(WeftApp.mount(app, node, root));
    await tick();
    const button = root.querySelector<HTMLElement>('[data-testid="boom"]');

    // Published before anyone subscribes → not replayed.
    button?.click();
    await tick();

    const subA = subscribeErrors(app);
    const subB = subscribeErrors(app);
    await tick();
    assert.equal(subA.received.length, 0, "no replay of past errors");
    assert.equal(subB.received.length, 0);

    button?.click();
    await tick();
    assert.equal(subA.received.length, 1, "subscriber A sees the new error");
    assert.equal(subB.received.length, 1, "subscriber B sees the new error");

    await Effect.runPromise(WeftApp.dispose(app));
    await subA.unsubscribe();
    await subB.unsubscribe();
  });
});

// ============================================================================
// WA15: errors handled by a nested Boundary never reach the hub
// ============================================================================

describe("WA15: nested Boundary errors stay out of the hub", () => {
  it("renders the fallback without publishing or logging", async () => {
    createTestDOM();
    const root = createRoot();
    const { entries, logger } = makeErrorLogCapture();
    const app = WeftApp.make(logger);
    const sub = subscribeErrors(app);
    await tick();

    const failing = Stream.concat(
      Stream.make(h.div({}, "live")),
      Stream.fail(new FooError({ msg: "caught-by-boundary" })),
    );
    await Effect.runPromise(
      WeftApp.mount(
        app,
        Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "fb") }, [failing]),
        root,
      ),
    );
    await tick();

    assert.ok(root.querySelector(".fallback"), "boundary handled the failure");
    assert.equal(sub.received.length, 0, "nothing published to the hub");
    assert.equal(entries.length, 0, "no default log");

    await Effect.runPromise(WeftApp.dispose(app));
    await sub.unsubscribe();
  });
});

// ============================================================================
// WA16: handler-forked scoped work is owned by the root scope
// ============================================================================

describe("WA16: unmount owns handler-forked scoped work", () => {
  it("interrupts a handler-forked scoped fiber on unmount", async () => {
    createTestDOM();
    const root = createRoot();
    const app = WeftApp.make();
    const ticks = await Effect.runPromise(Ref.make(0));

    const node = h.div([
      h.button(
        {
          type: "button",
          "data-testid": "go",
          onclick: () =>
            Effect.forkScoped(
              Ref.update(ticks, (n) => n + 1).pipe(Effect.repeat(Schedule.spaced("10 millis"))),
            ),
        },
        "go",
      ),
    ]);

    const handle = await Effect.runPromise(WeftApp.mount(app, node, root));
    await waitFor(30);
    root.querySelector<HTMLElement>('[data-testid="go"]')?.click();
    await waitFor(60);
    const before = await Effect.runPromise(Ref.get(ticks));
    assert.ok(before > 0, "handler forked and ticked while mounted");

    await Effect.runPromise(handle.unmount());
    await waitFor(120);
    const after = await Effect.runPromise(Ref.get(ticks));
    assert.equal(after, before, "handler-forked fiber interrupted by unmount");

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// WA17: no ambient capture — Effect.provide around mount is invisible
// ============================================================================

describe("WA17: no ambient context capture", () => {
  it("a service provided around the mount call does not reach components", async () => {
    createTestDOM();
    const root = createRoot();
    const app = WeftApp.make();

    const probeView = h.div({}, [
      Stream.unwrap(
        Effect.map(Effect.serviceOption(Probe), (o) =>
          Stream.make(Option.isSome(o) ? "present" : "absent"),
        ),
      ),
    ]);

    await Effect.runPromise(
      pipe(
        WeftApp.mount(app, probeView, root),
        Effect.provide(Layer.succeed(Probe, { value: 99 })),
      ),
    );
    await tick();

    assert.equal(root.textContent, "absent", "ambient Effect.provide is not captured");

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// WA18: mount-failure cleanup — root scope only; app and other roots untouched
// ============================================================================

describe("WA18: mount-failure cleanup", () => {
  it("fails with the tagged error; other roots live; root stays mountable", async () => {
    createTestDOM();
    const rootA = createRoot();
    const rootB = createRoot();
    const app = WeftApp.make();
    const region = await Effect.runPromise(SubscriptionRef.make<Renderable>("v1"));

    await Effect.runPromise(
      WeftApp.mount(app, h.div({}, [SubscriptionRef.changes(region)]), rootA),
    );
    await tick();

    const badApp = { type: 42, props: {} } as unknown as Renderable;
    const exit = await Effect.runPromiseExit(WeftApp.mount(app, badApp, rootB));
    assert.ok(Exit.isFailure(exit), "mount fails");
    const error = Exit.isFailure(exit) ? Option.getOrNull(Cause.findErrorOption(exit.cause)) : null;
    assert.ok(error instanceof UnsupportedNodeTypeError);

    // Root A untouched by B's failure.
    await Effect.runPromise(SubscriptionRef.set(region, "v2"));
    await tick();
    assert.equal(rootA.textContent, "v2", "existing root unaffected by mount failure");

    // The failed root element remains mountable.
    const handle = await Effect.runPromise(WeftApp.mount(app, h.div({}, "ok"), rootB));
    assert.equal(rootB.textContent, "ok", "no zombie resources on the failed root");
    assert.equal(handle.element, rootB);

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// WA19: hydration mechanics unchanged — markers adopt, streams patch after
// ============================================================================

describe("WA19: hydration mechanics unchanged", () => {
  it("adopts marker regions in place and patches on later emissions", async () => {
    createTestDOM();
    const root = createRoot();
    const regionRef = await Effect.runPromise(SubscriptionRef.make<Renderable>("srv"));
    const node = h.div({}, [SubscriptionRef.changes(regionRef)]);

    root.innerHTML = await Effect.runPromise(renderToStringHydratable(node));

    const app = WeftApp.make();
    await Effect.runPromise(WeftApp.hydrate(app, node, root));
    await tick();
    assert.equal(root.textContent, "srv", "first emission adopted in place");

    await Effect.runPromise(SubscriptionRef.set(regionRef, "live"));
    await tick();
    assert.equal(root.textContent, "live", "later emissions patch the region");

    await Effect.runPromise(WeftApp.dispose(app));
  });
});
