import * as assert from "node:assert/strict";
import { h } from "@weftui/core";
import { Context, Effect, Option, Scheduler, SubscriptionRef, pipe } from "effect";
import { JSDOM } from "jsdom";
import { describe, it, onTestFinished } from "vite-plus/test";
import {
  makeMessageChannelSetImmediate,
  renderSchedulerFor,
  withRenderScheduler,
} from "./scheduler";
import type { SchedulerHost } from "./scheduler";
import * as WeftApp from "./weft-app";

// Node half of scheduler.specs.md. A fake channel makes dispatch deterministic here;
// scheduler.browser.test.ts covers the real channel and the mount wiring (RS5/RS6).

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

/** A fake host: only the capabilities `renderSchedulerFor` probes. */
function host(capabilities: {
  readonly setImmediate?: boolean;
  readonly MessageChannel?: typeof MessageChannel;
}): SchedulerHost {
  return {
    ...(capabilities.setImmediate === true ? { setImmediate: () => undefined } : {}),
    ...(capabilities.MessageChannel !== undefined
      ? { MessageChannel: capabilities.MessageChannel }
      : {}),
  };
}

describe("makeMessageChannelSetImmediate", () => {
  it("RS1: one lazily created channel, one message per task, FIFO", () => {
    const { Channel, record, deliver } = fakeChannel();
    const setImmediate = makeMessageChannelSetImmediate(Channel);
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
    const setImmediate = makeMessageChannelSetImmediate(Channel);
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
    const setImmediate = makeMessageChannelSetImmediate(Channel);
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
    const setImmediate = makeMessageChannelSetImmediate(Channel);
    setImmediate(() => undefined);
    deliver();
    assert.deepEqual([record.created, record.closed], [1, 1]);

    setImmediate(() => undefined);
    deliver();
    assert.deepEqual([record.created, record.closed], [2, 2]);
  });

  it("RS9: a channel that never drains stays FIFO across compaction", () => {
    const { Channel, record, deliver } = fakeChannel();
    const setImmediate = makeMessageChannelSetImmediate(Channel);
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
    const setImmediate = makeMessageChannelSetImmediate(Channel);
    setImmediate(() => {
      throw new Error("boom");
    });
    assert.throws(deliver, /boom/);
    assert.equal(record.closed, 1);
  });
});

describe("renderSchedulerFor", () => {
  it("RS3: a host with MessageChannel and no setImmediate gets an async MixedScheduler on that channel", () => {
    const { Channel, record } = fakeChannel();
    const scheduler = Option.getOrThrow(renderSchedulerFor(host({ MessageChannel: Channel })));
    assert.ok(scheduler instanceof Scheduler.MixedScheduler);
    assert.equal(scheduler.executionMode, "async");

    scheduler.makeDispatcher().scheduleTask(() => undefined, 0);
    assert.deepEqual([record.created, record.posted], [1, 1]);
  });

  it("RS3: a host with setImmediate keeps Effect's default", () => {
    const { Channel } = fakeChannel();
    assert.ok(
      Option.isNone(renderSchedulerFor(host({ setImmediate: true, MessageChannel: Channel }))),
    );
  });

  it("RS3: a host without MessageChannel keeps Effect's default", () => {
    assert.ok(Option.isNone(renderSchedulerFor(host({}))));
  });
});

describe("withRenderScheduler", () => {
  it("RS4: a context that already provides a Scheduler is returned unchanged", () => {
    const own = new Scheduler.MixedScheduler("sync");
    const context = Context.make(Scheduler.Scheduler, own);
    const result = withRenderScheduler(context);
    assert.equal(result, context);
    assert.equal(Context.get(result, Scheduler.Scheduler), own);
  });

  it("RS7: under Node (setImmediate present) the context is unchanged", () => {
    const context = Context.empty();
    const result = withRenderScheduler(context);
    assert.equal(result, context);
    assert.equal(Context.getOrUndefined(result, Scheduler.Scheduler), undefined);
  });
});

describe("flush fiber", () => {
  it("RS7: the flush fiber inherits a scheduler provided around mount", async () => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Comment = dom.window.Comment;
    global.Text = dom.window.Text;
    const root = document.createElement("div");
    document.body.appendChild(root);

    let dispatched = 0;
    const counting = new Scheduler.MixedScheduler("async", (task) => {
      dispatched++;
      const timer = setTimeout(task, 0);
      return () => clearTimeout(timer);
    });

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

    // Only the flush fiber was forked under `counting`: the render pass and its
    // pumps run under the app context (WA17). Waking it to commit dispatches there.
    dispatched = 0;
    await Effect.runPromise(SubscriptionRef.set(count, 1));
    await Effect.runPromise(handle.awaitCommit);
    assert.equal(root.textContent, "1");
    assert.ok(dispatched > 0);
  });
});
