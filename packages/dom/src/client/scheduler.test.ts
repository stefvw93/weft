import * as assert from "node:assert/strict";
import { h } from "@weftui/core";
import { Effect, Layer, Option, Scheduler, SubscriptionRef, pipe } from "effect";
import { JSDOM } from "jsdom";
import { describe, it, onTestFinished } from "vite-plus/test";
import { hostSchedulerFor, makeMessageChannelSetImmediate, withHostScheduler } from "./scheduler";
import type { SchedulerHost } from "./scheduler";
import * as WeftApp from "./weft-app";

// Node half of scheduler.specs.md. A fake channel makes dispatch deterministic here;
// scheduler.browser.test.ts covers the real channel and the yield counts.

/** A fake `MessageChannel` that queues posts until `deliver` and records closes. */
function fakeChannel() {
  const record = { created: 0, posted: 0, closed: 0 };
  let onmessage: (() => void) | null = null;
  class FakeChannel {
    readonly port1 = {
      set onmessage(handler: () => void) {
        onmessage = handler;
      },
      close: () => {
        record.closed++;
      },
    };
    readonly port2 = {
      postMessage: () => {
        record.posted++;
      },
    };
    constructor() {
      record.created++;
    }
  }
  /** Delivers one pending message, as the event loop would. */
  const deliver = () => {
    assert.ok(record.posted > 0, "no message pending");
    record.posted--;
    onmessage?.();
  };
  return { Channel: FakeChannel as unknown as typeof MessageChannel, record, deliver };
}

/** A fake host: only the capabilities `hostSchedulerFor` probes. */
function host(capabilities: {
  readonly immediate?: {
    readonly set: (task: () => void) => unknown;
    readonly clear: (handle: unknown) => void;
  };
  readonly MessageChannel?: typeof MessageChannel;
  readonly document?: boolean;
}): SchedulerHost {
  return {
    ...(capabilities.immediate !== undefined
      ? { setImmediate: capabilities.immediate.set, clearImmediate: capabilities.immediate.clear }
      : {}),
    ...(capabilities.MessageChannel !== undefined
      ? { MessageChannel: capabilities.MessageChannel }
      : {}),
    ...(capabilities.document === true ? { document: {} } : {}),
  };
}

/** A counting async scheduler that yields through `setTimeout`. */
function countingScheduler() {
  const record = { dispatched: 0 };
  const scheduler = new Scheduler.MixedScheduler("async", (task) => {
    record.dispatched++;
    const timer = setTimeout(task, 0);
    return () => clearTimeout(timer);
  });
  return { scheduler, record };
}

/** Installs a JSDOM document for one test and returns an attached root. */
function makeRoot(): HTMLElement {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Comment = dom.window.Comment;
  global.Text = dom.window.Text;
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

describe("makeMessageChannelSetImmediate", () => {
  it("RS1: one lazily created channel, one message per task, FIFO", () => {
    const { Channel, record, deliver } = fakeChannel();
    const setImmediate = makeMessageChannelSetImmediate(Channel, true);
    assert.equal(record.created, 0);

    const order: string[] = [];
    setImmediate(() => order.push("a"));
    setImmediate(() => order.push("b"));
    assert.deepEqual([record.created, record.posted, order], [1, 2, []]);

    deliver();
    deliver();
    assert.deepEqual(order, ["a", "b"]);
  });

  it("RS2: a cancelled task is skipped and later tasks still run", () => {
    const { Channel, deliver } = fakeChannel();
    const setImmediate = makeMessageChannelSetImmediate(Channel, true);
    const order: string[] = [];
    setImmediate(() => order.push("a"));
    const cancel = setImmediate(() => order.push("b"));
    setImmediate(() => order.push("c"));
    cancel();

    deliver();
    deliver();
    deliver();
    assert.deepEqual(order, ["a", "c"]);
  });

  it("RS9: a task that schedules another reuses the open channel", () => {
    const { Channel, record, deliver } = fakeChannel();
    const setImmediate = makeMessageChannelSetImmediate(Channel, true);
    const order: string[] = [];
    setImmediate(() => {
      order.push("a");
      setImmediate(() => order.push("b"));
    });
    deliver();
    assert.deepEqual([record.created, record.closed], [1, 0]);
    deliver();
    assert.deepEqual([record.created, record.closed, order], [1, 1, ["a", "b"]]);
  });

  it("RS9: the channel closes once drained and a later task opens a new one", () => {
    const { Channel, record, deliver } = fakeChannel();
    const setImmediate = makeMessageChannelSetImmediate(Channel, true);
    setImmediate(() => undefined);
    deliver();
    assert.deepEqual([record.created, record.closed], [1, 1]);

    setImmediate(() => undefined);
    deliver();
    assert.deepEqual([record.created, record.closed], [2, 2]);
  });

  it("RS9: a channel that never drains stays FIFO across compaction", () => {
    const { Channel, record, deliver } = fakeChannel();
    const setImmediate = makeMessageChannelSetImmediate(Channel, true);
    const order: number[] = [];
    // Two tasks always pending: each run queues its successor, so the queue never
    // empties and only compaction can release consumed slots.
    const chain = (n: number) => () => {
      order.push(n);
      if (n < 5_000) setImmediate(chain(n + 2));
    };
    setImmediate(chain(0));
    setImmediate(chain(1));
    while (record.posted > 0) deliver();
    assert.equal(order.length, 5_002);
    assert.ok(order.every((n, i) => n === i));
    assert.deepEqual([record.created, record.closed], [1, 1]);
  });

  it("RS9: the channel still closes when the last task throws", () => {
    const { Channel, record, deliver } = fakeChannel();
    const setImmediate = makeMessageChannelSetImmediate(Channel, true);
    setImmediate(() => {
      throw new Error("boom");
    });
    assert.throws(deliver, /boom/);
    assert.equal(record.closed, 1);
  });

  it("RS9: without closeWhenIdle, a drained channel stays open and is reused", () => {
    const { Channel, record, deliver } = fakeChannel();
    const setImmediate = makeMessageChannelSetImmediate(Channel, false);
    const order: string[] = [];
    setImmediate(() => order.push("a"));
    deliver();
    setImmediate(() => order.push("b"));
    deliver();
    assert.deepEqual([record.created, record.closed, order], [1, 0, ["a", "b"]]);
  });
});

describe("hostSchedulerFor", () => {
  it("RS3: a host with setImmediate yields through it, looked up per call", () => {
    const calls: string[] = [];
    const immediateHost = host({
      immediate: { set: () => calls.push("first"), clear: () => undefined },
    });
    const scheduler = Option.getOrThrow(hostSchedulerFor(immediateHost));
    assert.ok(scheduler instanceof Scheduler.MixedScheduler);
    assert.equal(scheduler.executionMode, "async");

    // A later patch (fake timers, a polyfill) is honoured.
    Object.assign(immediateHost, { setImmediate: () => calls.push("patched") });
    scheduler.makeDispatcher().scheduleTask(() => undefined, 0);
    assert.deepEqual(calls, ["patched"]);
  });

  it("RS3: setImmediate wins over MessageChannel", () => {
    const { Channel, record } = fakeChannel();
    let scheduled = 0;
    const scheduler = Option.getOrThrow(
      hostSchedulerFor(
        host({
          immediate: { set: () => scheduled++, clear: () => undefined },
          MessageChannel: Channel,
        }),
      ),
    );
    scheduler.makeDispatcher().scheduleTask(() => undefined, 0);
    assert.deepEqual([scheduled, record.created], [1, 0]);
  });

  it("RS3: a setImmediate removed after the probe falls back to a microtask", async () => {
    const immediateHost = host({ immediate: { set: () => undefined, clear: () => undefined } });
    const scheduler = Option.getOrThrow(hostSchedulerFor(immediateHost));
    Object.assign(immediateHost, { setImmediate: undefined });
    await new Promise<void>((resolve) => {
      scheduler.makeDispatcher().scheduleTask(resolve, 0);
    });
  });

  it("RS3: a host with only MessageChannel yields through that channel", () => {
    const { Channel, record } = fakeChannel();
    const scheduler = Option.getOrThrow(hostSchedulerFor(host({ MessageChannel: Channel })));
    assert.equal(scheduler.executionMode, "async");
    scheduler.makeDispatcher().scheduleTask(() => undefined, 0);
    assert.deepEqual([record.created, record.posted], [1, 1]);
  });

  it("RS9: a host with document keeps its channel open after it drains", () => {
    const { Channel, record, deliver } = fakeChannel();
    const page = Option.getOrThrow(
      hostSchedulerFor(host({ MessageChannel: Channel, document: true })),
    );
    page.makeDispatcher().scheduleTask(() => undefined, 0);
    deliver();
    assert.equal(record.closed, 0);

    const { Channel: WorkerChannel, record: worker, deliver: deliverWorker } = fakeChannel();
    const headless = Option.getOrThrow(hostSchedulerFor(host({ MessageChannel: WorkerChannel })));
    headless.makeDispatcher().scheduleTask(() => undefined, 0);
    deliverWorker();
    assert.equal(worker.closed, 1);
  });

  it("RS3: a host with neither keeps Effect's default", () => {
    assert.ok(Option.isNone(hostSchedulerFor(host({}))));
  });
});

describe("withHostScheduler", () => {
  it("RS7: under Node the app runtime yields through setImmediate", async () => {
    const scheduler = await Effect.runPromise(
      pipe(Effect.service(Scheduler.Scheduler), Effect.provide(withHostScheduler(Layer.empty))),
    );
    const original = globalThis.setImmediate;
    let calls = 0;
    // Patched after the scheduler was built: the per-call lookup must still see it.
    globalThis.setImmediate = ((task: () => void) => {
      calls++;
      return original(task);
    }) as typeof setImmediate;
    onTestFinished(() => {
      globalThis.setImmediate = original;
    });
    await new Promise<void>((resolve) => {
      scheduler.makeDispatcher().scheduleTask(resolve, 0);
    });
    // At least: other code in the worker may call `setImmediate` meanwhile.
    assert.ok(calls >= 1);
  });

  it("RS4: a Scheduler the app layer provides wins", async () => {
    const own = new Scheduler.MixedScheduler("sync");
    const resolved = await Effect.runPromise(
      pipe(
        Effect.service(Scheduler.Scheduler),
        Effect.provide(withHostScheduler(Layer.succeed(Scheduler.Scheduler, own))),
      ),
    );
    assert.equal(resolved, own);
  });
});

describe("caller scheduler", () => {
  it("RS10: a Scheduler provided around mount drives neither render nor flush fibers", async () => {
    const root = makeRoot();
    const { scheduler: counting, record } = countingScheduler();
    const app = WeftApp.make();
    onTestFinished(() => Effect.runPromise(WeftApp.dispose(app)));
    const count = await Effect.runPromise(SubscriptionRef.make(0));
    const handle = await Effect.runPromise(
      pipe(
        WeftApp.mount(app, h.div({}, [SubscriptionRef.changes(count)]), root),
        Effect.provideService(Scheduler.Scheduler, counting),
      ),
    );
    assert.equal(root.textContent, "0");

    record.dispatched = 0;
    for (let i = 1; i <= 5; i++) {
      await Effect.runPromise(SubscriptionRef.set(count, i));
      await Effect.runPromise(handle.awaitCommit);
    }
    assert.equal(root.textContent, "5");
    assert.equal(record.dispatched, 0);
  });
});
