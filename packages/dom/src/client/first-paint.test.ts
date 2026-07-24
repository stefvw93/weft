import * as assert from "node:assert/strict";
import { Boundary, h, List } from "@weftui/core";
import { Effect, Fiber, Option, Scope, Stream, SubscriptionRef, pipe } from "effect";
import { JSDOM } from "jsdom";
import { describe, it } from "vite-plus/test";
import { makeInlineHeadPump } from "./first-paint";
import * as WeftApp from "./weft-app";

// ============================================================================
// Test Setup (mirrors list.test.ts)
// ============================================================================

function createTestDOM() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Comment = dom.window.Comment;
  global.Text = dom.window.Text;
  return dom;
}

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  return root;
}

async function runMount(app: unknown, root: HTMLElement) {
  return await Effect.runPromise(WeftApp.mount(WeftApp.make(), app as never, root));
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const waitForStream = () => waitFor(100);

/**
 * Drains `n` microtasks without ever yielding to the macrotask queue. Used to
 * prove FP4/AS1: a synchronous region is painted *before* any of these, and an
 * async one is still absent after all of them.
 */
async function drainMicrotasks(n = 200): Promise<void> {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

interface Person {
  readonly id: string;
  readonly name: string;
}

const p = (id: string, name = id.toUpperCase()): Person => ({ id, name });

const itemIds = (root: HTMLElement): string[] =>
  Array.from(root.querySelectorAll("li")).map((li) => li.id);

// ============================================================================
// Capture window (CW): the slot in isolation, no DOM involved
// ============================================================================

/**
 * Forks a pump the way a mount-pass region does and seals the window with no
 * intervening `yield`, then returns what was captured.
 */
function forkAndSeal<A, E>(
  changes: Stream.Stream<A, E>,
  sink: (value: A) => Effect.Effect<void>,
  enabled = true,
): Effect.Effect<Option.Option<A>, never, Scope.Scope> {
  return Effect.gen(function* () {
    const scope = yield* Scope.Scope;
    const region = makeInlineHeadPump(changes, sink, enabled);
    yield* enabled
      ? Effect.forkIn(region.pump, scope, { startImmediately: true })
      : Effect.forkIn(region.pump, scope);
    return region.seal();
  });
}

const collector = <A>() => {
  const values: A[] = [];
  return { values, sink: (value: A) => Effect.sync(() => void values.push(value)) };
};

describe("first-paint: capture window (CW)", () => {
  it("CW1: captures a synchronously delivered head during the fork call", async () => {
    const { sink } = collector<readonly Person[]>();

    const head = await Effect.runPromise(
      Effect.scoped(forkAndSeal(Stream.make([p("a"), p("b")] as readonly Person[]), sink)),
    );

    assert.ok(Option.isSome(head), "a synchronous source must deliver its head during fork");
    assert.deepEqual(Option.getOrThrow(head), [p("a"), p("b")]);
  });

  it("CW2: the captured head is never written to the sink", async () => {
    const { values, sink } = collector<number>();

    await Effect.runPromise(Effect.scoped(forkAndSeal(Stream.make(1), sink)));

    assert.deepEqual(values, [], "the head is rendered inline, not committed via the cell");
  });

  it("CW3: values arriving after the seal go to the sink", async () => {
    const { values, sink } = collector<number>();

    const head = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const ref = yield* SubscriptionRef.make(1);
          const captured = yield* forkAndSeal(SubscriptionRef.changes(ref), sink);
          yield* SubscriptionRef.set(ref, 2);
          yield* SubscriptionRef.set(ref, 3);
          yield* Effect.sleep("30 millis");
          return captured;
        }),
      ),
    );

    assert.deepEqual(Option.getOrThrow(head), 1, "head captured inline");
    assert.deepEqual(values, [2, 3], "every later emission still reaches the sink");
  });

  it("CW3 (burst): a synchronous burst captures only the first element, the rest reach the sink", async () => {
    const { values, sink } = collector<number>();

    const head = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const captured = yield* forkAndSeal(Stream.make(1, 2, 3), sink);
          yield* Effect.sleep("30 millis");
          return captured;
        }),
      ),
    );

    assert.deepEqual(Option.getOrThrow(head), 1, "only the first element is the head");
    assert.deepEqual(values, [2, 3], "the rest of the burst is neither lost nor re-captured");
  });

  it("CW4: an asynchronous source captures nothing", async () => {
    const { values, sink } = collector<number>();

    const head = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const captured = yield* forkAndSeal(
            Stream.fromEffect(pipe(Effect.sleep("10 millis"), Effect.as(7))),
            sink,
          );
          yield* Effect.sleep("40 millis");
          return captured;
        }),
      ),
    );

    assert.ok(Option.isNone(head), "an async source has nothing available during the fork");
    assert.deepEqual(values, [7], "its first value takes the normal sink path");
  });

  it("CW5: the source is subscribed exactly once", async () => {
    let runs = 0;
    const { sink } = collector<number>();
    const source = Stream.fromEffect(
      Effect.sync(() => {
        runs++;
        return 1;
      }),
    );

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* forkAndSeal(source, sink);
          yield* Effect.sleep("30 millis");
        }),
      ),
    );

    assert.equal(runs, 1, "no probe + re-subscribe: a side-effecting source runs once");
  });

  it("CW6: concurrent regions each capture only their own head", async () => {
    const a = collector<string>();
    const b = collector<string>();

    const [headA, headB] = await Effect.runPromise(
      Effect.scoped(
        Effect.all([forkAndSeal(Stream.make("a"), a.sink), forkAndSeal(Stream.make("b"), b.sink)]),
      ),
    );

    assert.deepEqual(Option.getOrThrow(headA), "a");
    assert.deepEqual(Option.getOrThrow(headB), "b");
    assert.deepEqual([...a.values, ...b.values], [], "neither head leaked into a sink");
  });

  it("MG2 (unit): with the window disabled the head goes to the sink and seal yields None", async () => {
    const { values, sink } = collector<number>();

    const head = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const captured = yield* forkAndSeal(Stream.make(5), sink, false);
          yield* Effect.sleep("30 millis");
          return captured;
        }),
      ),
    );

    assert.ok(Option.isNone(head), "a disabled window never captures");
    assert.deepEqual(values, [5], "today's behaviour: the first value is committed via the cell");
  });
});

// ============================================================================
// Inline first paint (FP): asserted at mount resolve, with no waiting
// ============================================================================

describe("first-paint: inline first paint (FP)", () => {
  it("FP1: List.each over a static array returns its items in the mount node list", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      List.each({ of: [p("a"), p("b"), p("c")], by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, x.name),
      ),
      root,
    );

    assert.deepEqual(itemIds(root), ["a", "b", "c"], "items present at mount resolve");
  });

  it("FP2: a reactive child renders its first node between the markers at mount resolve", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div([h.span({ id: "reactive" }, [Stream.make("hello")])]), root);

    const span = root.querySelector("#reactive");
    assert.ok(span, "reactive child present at mount resolve");
    assert.equal(span?.textContent, "hello");
  });

  it("FP3: a reactive prop is applied at mount resolve", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.div({ id: "target", class: Stream.make("active") }, "x"), root);

    assert.equal(root.querySelector("#target")?.getAttribute("class"), "active");
  });

  it("FP4: sync regions are painted before any microtask drain", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      h.div([
        h.p({ id: "static" }, "sync sibling"),
        h.ul([
          List.each({ of: [p("a"), p("b")], by: (x) => x.id }, (x) => h.li({ id: x.id }, x.name)),
        ]),
        h.span({ id: "child" }, [Stream.make("now")]),
      ]),
      root,
    );

    assert.ok(root.querySelector("#static"), "plain sibling present");
    assert.deepEqual(itemIds(root), ["a", "b"], "list painted in the mount frame");
    assert.equal(
      root.querySelector("#child")?.textContent,
      "now",
      "child painted in the mount frame",
    );
  });

  it("FP5: SubscriptionRef.changes paints inline (the idiomatic Weft form)", async () => {
    createTestDOM();
    const root = createRoot();

    const app = Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make([p("a"), p("b")] as readonly Person[]);
      const count = yield* SubscriptionRef.make(0);
      return yield* h.div([
        h.ul([
          List.each({ of: SubscriptionRef.changes(rows), by: (x) => x.id }, (x) =>
            h.li({ id: x.id }, x.name),
          ),
        ]),
        h.span({ id: "count" }, [SubscriptionRef.changes(count)]),
      ]);
    });

    await runMount(app, root);

    assert.deepEqual(itemIds(root), ["a", "b"], "SubscriptionRef list painted at mount resolve");
    assert.equal(root.querySelector("#count")?.textContent, "0", "SubscriptionRef child painted");
  });

  it("FP6: emissions after the inline paint still commit through the flush fiber", async () => {
    createTestDOM();
    const root = createRoot();
    const rowsRef: { current?: SubscriptionRef.SubscriptionRef<readonly Person[]> } = {};

    const app = Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make([p("a")] as readonly Person[]);
      rowsRef.current = rows;
      return yield* h.ul([
        List.each({ of: SubscriptionRef.changes(rows), by: (x) => x.id }, (x) =>
          h.li({ id: x.id }, x.name),
        ),
      ]);
    });

    await runMount(app, root);
    assert.deepEqual(itemIds(root), ["a"], "inline first paint");

    await Effect.runPromise(SubscriptionRef.set(rowsRef.current!, [p("a"), p("b")]));
    await waitForStream();

    assert.deepEqual(itemIds(root), ["a", "b"], "later emission reconciled as today");
  });

  it("FP7: an empty first snapshot paints inline, needing no flush pass", async () => {
    createTestDOM();
    const root = createRoot();

    // An empty region has no items either way, so DOM content cannot tell the
    // two paths apart. The commit generation can: painting inline marks the
    // cell committed without a flush pass (LC4), whereas committing `[]`
    // through the flush fiber is a successful commit and advances it.
    const handle = await runMount(
      h.ul([
        List.each({ of: [] as readonly Person[], by: (x) => x.id }, (x) =>
          h.li({ id: x.id }, x.name),
        ),
      ]),
      root,
    );

    assert.deepEqual(itemIds(root), [], "no items");
    assert.ok(root.querySelector("ul"), "region markers still mounted");

    // Wait past the window in which a deferred first emission would commit:
    // `awaitCommit` alone is immediate while the pump has not written yet.
    await waitForStream();
    const generation = await Effect.runPromise(handle.commitGeneration);
    assert.equal(generation, 0, "the empty first emission never reached the flush fiber");
  });
});

// ============================================================================
// INVARIANT GUARDS (MG3, FE1-FE4, AS2)
//
// Everything below asserts behaviour the feature must *preserve*, so these
// cases pass both before and after `/implement`. That is the point: FE routing
// and AS async timing are specified as unchanged, and MG3 guards against a
// pump leak the implementation could introduce via #179. They are deliberately
// not part of the red set, which covers only the new behaviour.
// ============================================================================

// ============================================================================
// Mount-pass gate (MG)
// ============================================================================

describe("first-paint: mount-pass gate (MG)", () => {
  it("MG3: a nested region created by a later reconcile is interrupted when its item is removed", async () => {
    createTestDOM();
    const root = createRoot();

    let ticks = 0;
    const refs: {
      rows?: SubscriptionRef.SubscriptionRef<readonly Person[]>;
      inner?: SubscriptionRef.SubscriptionRef<number>;
    } = {};

    const app = Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make([p("a")] as readonly Person[]);
      const inner = yield* SubscriptionRef.make(0);
      refs.rows = rows;
      refs.inner = inner;
      // The item added later renders a nested reactive region. Its pump is
      // forked from the flush fiber, so it must NOT use startImmediately (#179)
      // and must still be interrupted when the item's scope closes.
      const tracked = Stream.tap(SubscriptionRef.changes(inner), () =>
        Effect.sync(() => {
          ticks++;
        }),
      );
      return yield* h.ul([
        // Only the later-added item carries the nested region, so `ticks` tracks
        // exactly the pump that must die with it. Item "a" mounts inline and
        // keeps its own subscriptions, which must not be confused for a leak.
        List.each({ of: SubscriptionRef.changes(rows), by: (x) => x.id }, (x) =>
          h.li({ id: x.id }, x.id === "b" ? [h.span([tracked])] : [x.name]),
        ),
      ]);
    });

    await runMount(app, root);

    // Add a second item: this render runs inside a flush-fiber commit.
    await Effect.runPromise(SubscriptionRef.set(refs.rows!, [p("a"), p("b")]));
    await waitForStream();
    assert.deepEqual(itemIds(root), ["a", "b"]);

    // Remove it, closing its item scope.
    await Effect.runPromise(SubscriptionRef.set(refs.rows!, [p("a")]));
    await waitForStream();
    assert.deepEqual(itemIds(root), ["a"]);

    const ticksAfterRemoval = ticks;
    await Effect.runPromise(SubscriptionRef.set(refs.inner!, 1));
    await Effect.runPromise(SubscriptionRef.set(refs.inner!, 2));
    await waitForStream();

    assert.equal(
      ticks,
      ticksAfterRemoval,
      "the removed item's nested pump must be interrupted, not leaked (#179 guard)",
    );
  });

  it("MG3: a region rendered into a Boundary fallback is interrupted on unmount", async () => {
    createTestDOM();
    const root = createRoot();

    // The fallback renders inside the forked boundary-recovery fiber, so a
    // reactive region created there takes the deferred path (#179).
    //
    // INVARIANT GUARD, not a red->green test: #179 does not reproduce against
    // effect 4.0.0-beta.98 (its own candidate repro shows startImmediately
    // children ARE interrupted by scope close), so this passes with or without
    // the `forkRendering` gate. It is here to catch a regression if a future
    // beta reintroduces the upstream bug.
    let ticks = 0;
    const refs: {
      tracked?: SubscriptionRef.SubscriptionRef<number>;
      trigger?: SubscriptionRef.SubscriptionRef<number>;
    } = {};

    const app = WeftApp.make();
    const node = Effect.gen(function* () {
      const tracked = yield* SubscriptionRef.make(0);
      const trigger = yield* SubscriptionRef.make(0);
      refs.tracked = tracked;
      refs.trigger = trigger;

      const counted = Stream.tap(SubscriptionRef.changes(tracked), () =>
        Effect.sync(() => {
          ticks++;
        }),
      );
      const failing = Stream.flatMap(SubscriptionRef.changes(trigger), (n) =>
        n > 0 ? Stream.fail(new Error("boom")) : Stream.make("ok"),
      );

      return yield* Boundary.catch({ fallback: () => h.div({ id: "fb" }, [counted]) }, [
        h.span({ id: "child" }, [failing]),
      ]);
    });

    const handle = await Effect.runPromise(WeftApp.mount(app, node as never, root));

    await Effect.runPromise(SubscriptionRef.set(refs.trigger!, 1));
    await waitForStream();
    assert.ok(root.querySelector("#fb"), "boundary swapped to its fallback");

    const ticksBeforeUnmount = ticks;
    assert.ok(ticksBeforeUnmount >= 1, "the fallback's region delivered its first value");

    await Effect.runPromise(handle.unmount());
    await Effect.runPromise(SubscriptionRef.set(refs.tracked!, 1));
    await Effect.runPromise(SubscriptionRef.set(refs.tracked!, 2));
    await waitForStream();

    assert.equal(ticks, ticksBeforeUnmount, "the fallback's pump must be interrupted on unmount");
    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// Errors (FE)
// ============================================================================

describe("first-paint: errors (FE)", () => {
  it("FE1: an inline duplicate-key failure routes to the Boundary and mount still succeeds", async () => {
    createTestDOM();
    const root = createRoot();

    // Both items project to the same key, synchronously available (KR1).
    await runMount(
      Boundary.catch({ fallback: () => h.div({ id: "fallback" }, "dup") }, [
        List.each({ of: [p("a"), p("a")], by: (x) => x.id }, (x) => h.li({ id: x.id }, x.name)),
      ]),
      root,
    );
    await waitForStream();

    assert.ok(root.querySelector("#fallback"), "boundary caught the inline failure");
  });

  it("FE2: with no Boundary, an inline failure reaches the app error hub", async () => {
    createTestDOM();
    const root = createRoot();

    const app = WeftApp.make();
    const received: WeftApp.UnhandledError[] = [];
    const fiber = Effect.runFork(
      Stream.runForEach(WeftApp.errors(app), (e) => Effect.sync(() => void received.push(e))),
    );

    await Effect.runPromise(
      WeftApp.mount(
        app,
        List.each({ of: [p("a"), p("a")], by: (x) => x.id }, (x) =>
          h.li({ id: x.id }, x.name),
        ) as never,
        root,
      ),
    );
    await waitForStream();

    assert.ok(received.length > 0, "unrouted inline failure published to the hub");
    // FE2 specifies the region label, not merely that something was published.
    assert.match(
      received[0]?.region ?? "",
      /^list:stream-\d+$/,
      "published under the region's label",
    );
    await Effect.runPromise(Effect.asVoid(Fiber.interrupt(fiber)));
  });

  it("FE3: a partially rendered inline emission leaves no nodes between the markers", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      Boundary.catch({ fallback: () => h.div({ id: "fallback" }, "boom") }, [
        h.ul([
          List.each({ of: [p("a"), p("b")], by: (x) => x.id }, (x) =>
            x.id === "b" ? Effect.fail(new Error("render boom")) : h.li({ id: x.id }, x.name),
          ),
        ]),
      ]),
      root,
    );
    await waitForStream();

    assert.ok(root.querySelector("#fallback"), "boundary swapped in");
    assert.deepEqual(itemIds(root), [], "the partially rendered item was cleared");
  });

  it("FE4: a source failing synchronously before emitting routes through supervision", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      Boundary.catch({ fallback: () => h.div({ id: "fallback" }, "src") }, [
        List.each(
          {
            of: Stream.fail(new Error("source boom")) as Stream.Stream<readonly Person[], Error>,
            by: (x) => x.id,
          },
          (x) => h.li({ id: x.id }, x.name),
        ),
      ]),
      root,
    );
    await waitForStream();

    assert.ok(root.querySelector("#fallback"), "synchronous source failure still routed");
  });
});

// ============================================================================
// Async sources are unchanged (AS)
//
// AS3 ("no new failure mode") is a suite-level criterion: it is discharged by
// the existing dom/list/loom/suspense/hydrate suites staying green, not by a
// test here.
// ============================================================================

describe("first-paint: async sources unchanged (AS)", () => {
  it("AS1: a cold async child is absent at mount resolve and after a microtask drain", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      h.div([
        h.span({ id: "sync" }, [Stream.make("here")]),
        h.span({ id: "async" }, [
          Stream.fromEffect(pipe(Effect.sleep("20 millis"), Effect.as("late"))),
        ]),
      ]),
      root,
    );

    // The host element always mounts; it is the region's *content* that is
    // deferred, leaving only the stream markers between the brackets.
    assert.equal(root.querySelector("#sync")?.textContent, "here", "sync sibling painted");
    assert.equal(root.querySelector("#async")?.textContent, "", "async content absent at resolve");

    await drainMicrotasks();
    assert.equal(
      root.querySelector("#async")?.textContent,
      "",
      "still absent after 200 microtasks",
    );

    await waitForStream();
    assert.equal(root.querySelector("#async")?.textContent, "late", "arrives once awaited");
  });

  it("AS2: a cold async list is absent at mount resolve and reconciles later", async () => {
    createTestDOM();
    const root = createRoot();

    const of = Stream.fromEffect(
      pipe(Effect.sleep("20 millis"), Effect.as([p("a")] as readonly Person[])),
    );

    await runMount(
      h.ul([List.each({ of, by: (x) => x.id }, (x) => h.li({ id: x.id }, x.name))]),
      root,
    );

    assert.deepEqual(itemIds(root), [], "no items at mount resolve");

    await waitForStream();
    assert.deepEqual(itemIds(root), ["a"], "committed by the flush fiber as today");
  });
});

// ============================================================================
// Suspense (HS)
// ============================================================================

describe("first-paint: suspense (HS)", () => {
  it("HS1: a synchronous reactive child settles its suspense fallback without a tick", async () => {
    createTestDOM();
    const root = createRoot();

    const Child = () => Effect.succeed(h.span({ id: "content" }, "ready"));

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Loading") }, [
        h.div([h.span({ id: "reactive" }, [Stream.make("ready")])]),
        Child(),
      ]),
      root,
    );

    assert.equal(root.querySelector(".fallback"), null, "no fallback frame for a sync child");
    assert.equal(root.querySelector("#reactive")?.textContent, "ready");
  });
});
