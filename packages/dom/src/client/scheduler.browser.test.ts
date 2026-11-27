import { AppRpcClientTag, h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { renderToStringHydratable } from "@weftui/dom/server";
import { Effect, Layer, Scheduler, Stream, SubscriptionRef, pipe } from "effect";
import { describe, expect, it, onTestFinished, vi } from "vite-plus/test";
import { makeMessageChannelSetImmediate } from "./scheduler";

// Browser half of scheduler.specs.md. Chromium clamps nested `setTimeout(0)` to
// about 4 ms. Render tests count zero-delay timeouts rather than time the render, so
// host speed cannot flake them: Effect's default yields with one per yield.

const YIELDS = 200;

/** Counts `setTimeout(_, 0)` calls from now until the test ends. */
function countZeroDelayTimeouts(): () => number {
  const spy = vi.spyOn(globalThis, "setTimeout");
  onTestFinished(() => spy.mockRestore());
  return () => spy.mock.calls.filter(([, delay]) => delay === undefined || delay <= 0).length;
}

/** An effect that yields to the scheduler `count` times, then succeeds with `value`. */
function yieldTimes(count: number, value: string): Effect.Effect<string> {
  return Effect.gen(function* () {
    for (let i = 0; i < count; i++) {
      yield* Effect.yieldNow;
    }
    return value;
  });
}

function makeContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  onTestFinished(() => container.remove());
  return container;
}

function track<R, E>(app: WeftApp.WeftApp<R, E>): WeftApp.WeftApp<R, E> {
  onTestFinished(() => Effect.runPromise(WeftApp.dispose(app)));
  return app;
}

describe("makeMessageChannelSetImmediate", () => {
  it("RS1: runs tasks once each, FIFO, as separate tasks", async () => {
    const setImmediate = makeMessageChannelSetImmediate(MessageChannel);
    const order: string[] = [];
    setImmediate(() => {
      order.push("a");
      // Runs before "b" only if "b" is a later task, not the same one.
      queueMicrotask(() => order.push("a:microtask"));
    });
    setImmediate(() => order.push("b"));
    setImmediate(() => order.push("c"));
    expect(order).toEqual([]);

    await vi.waitFor(() => expect(order).toHaveLength(4));
    expect(order).toEqual(["a", "a:microtask", "b", "c"]);
  });

  it("RS2: a cancelled task is skipped and later tasks still run in order", async () => {
    const setImmediate = makeMessageChannelSetImmediate(MessageChannel);
    const order: string[] = [];
    setImmediate(() => order.push("a"));
    const cancel = setImmediate(() => order.push("b"));
    setImmediate(() => order.push("c"));
    cancel();

    await vi.waitFor(() => expect(order).toEqual(["a", "c"]));
  });
});

describe("render fibers", () => {
  it("RS5: a mount whose reactive child yields 200 times paints without timer yields", async () => {
    const container = makeContainer();
    const app = track(WeftApp.make());

    const zeroDelayTimeouts = countZeroDelayTimeouts();
    await Effect.runPromise(
      WeftApp.mount(app, h.div({ id: "out" }, [yieldTimes(YIELDS, "done")]), container),
    );
    await vi.waitFor(() => expect(container.textContent).toBe("done"), { timeout: 5_000 });
    expect(zeroDelayTimeouts()).toBeLessThan(YIELDS / 2);
  });

  it("RS6: hydrate resolves a yielding first emission without timer yields", async () => {
    const container = makeContainer();
    const NoRpc = Layer.succeed(AppRpcClientTag, {
      call: () => Effect.die(new Error("no rpc in this test")),
    });
    // A Stream, not an Effect: hydrate probes an Effect child with `runSyncExit`, whose
    // sync scheduler never yields to the event loop.
    const tree = () => h.div({ id: "out" }, [Stream.fromEffect(yieldTimes(YIELDS, "done"))]);

    // The server render is not under test: a sync scheduler keeps it fast.
    container.innerHTML = await Effect.runPromise(
      pipeServer(renderToStringHydratable(tree()), NoRpc),
    );
    expect(container.textContent).toBe("done");

    const app = track(WeftApp.make(NoRpc));
    const zeroDelayTimeouts = countZeroDelayTimeouts();
    // `hydrate` waits for every region's first emission (hydrate-ready.specs.md).
    await Effect.runPromise(WeftApp.hydrate(app, tree(), container));
    expect(zeroDelayTimeouts()).toBeLessThan(YIELDS / 2);
    expect(container.textContent).toBe("done");
  });

  it("RS4: a Scheduler from the app layer wins over the render scheduler", async () => {
    const container = makeContainer();
    let dispatched = 0;
    const counting = new Scheduler.MixedScheduler("async", (task) => {
      dispatched++;
      const timer = setTimeout(task, 0);
      return () => clearTimeout(timer);
    });
    const app = track(WeftApp.make(Layer.succeed(Scheduler.Scheduler, counting)));

    await Effect.runPromise(
      WeftApp.mount(app, h.div({ id: "out" }, [yieldTimes(10, "done")]), container),
    );
    await vi.waitFor(() => expect(container.textContent).toBe("done"));
    expect(dispatched).toBeGreaterThanOrEqual(10);
  });

  it("RS10: a Scheduler provided around mount still drives the flush fiber", async () => {
    const container = makeContainer();
    let dispatched = 0;
    const counting = new Scheduler.MixedScheduler("async", (task) => {
      dispatched++;
      const timer = setTimeout(task, 0);
      return () => clearTimeout(timer);
    });
    const app = track(WeftApp.make());
    const count = await Effect.runPromise(SubscriptionRef.make(0));
    const handle = await Effect.runPromise(
      pipe(
        WeftApp.mount(app, h.div({}, [SubscriptionRef.changes(count)]), container),
        Effect.provideService(Scheduler.Scheduler, counting),
      ),
    );
    expect(container.textContent).toBe("0");

    dispatched = 0;
    await Effect.runPromise(SubscriptionRef.set(count, 1));
    await Effect.runPromise(handle.awaitCommit);
    expect(container.textContent).toBe("1");
    expect(dispatched).toBeGreaterThan(0);
  });
});

/** Provides the rpc stub and a sync scheduler to a server render. */
function pipeServer<A, E>(
  render: Effect.Effect<A, E, AppRpcClientTag>,
  rpc: Layer.Layer<AppRpcClientTag>,
): Effect.Effect<A, E> {
  return pipe(
    render,
    Effect.provide(rpc),
    Effect.provideService(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync")),
  );
}
