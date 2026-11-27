import { Layer, Option, Scheduler, pipe } from "effect";

/** The host capabilities {@link hostSchedulerFor} probes. */
export interface SchedulerHost {
  readonly setImmediate?: unknown;
  readonly clearImmediate?: unknown;
  readonly MessageChannel?: typeof MessageChannel | undefined;
  readonly document?: unknown;
}

/**
 * A `setImmediate` replacement on a `MessageChannel`: FIFO, one message per task, and
 * cancellable. `closeWhenIdle` closes a drained channel so it never holds a process open.
 */
export function makeMessageChannelSetImmediate(
  Channel: typeof MessageChannel,
  closeWhenIdle: boolean,
): (task: () => void) => () => void {
  let channel: MessageChannel | undefined;
  // A head index, not `shift()`: many fibers can queue at once during a large mount.
  // Read slots are cleared and the consumed prefix compacted, so nothing is retained.
  const queue: Array<{ run: (() => void) | undefined } | undefined> = [];
  let head = 0;

  return (run) => {
    if (channel === undefined) {
      const created = new Channel();
      created.port1.onmessage = () => {
        // Advance before running, so a throwing task cannot desync queue and messages.
        const next = queue[head];
        queue[head++] = undefined;
        try {
          next?.run?.();
        } finally {
          // Checked after the run: a fiber that yields again reuses this channel.
          if (head === queue.length) {
            queue.length = 0;
            head = 0;
            if (closeWhenIdle) {
              created.port1.close();
              channel = undefined;
            }
          } else if (head >= COMPACT_AFTER && head * 2 >= queue.length) {
            queue.splice(0, head);
            head = 0;
          }
        }
      };
      channel = created;
    }
    const entry: { run: (() => void) | undefined } = { run };
    queue.push(entry);
    channel.port2.postMessage(undefined);
    return () => {
      // Drops the closure now; the slot itself is consumed by its message.
      entry.run = undefined;
    };
  };
}

/** Consumed queue slots tolerated before compacting a channel that never drains. */
const COMPACT_AFTER = 1024;

/** A host whose `setImmediate` pair {@link hostSchedulerFor} yields through. */
interface ImmediateHost {
  readonly setImmediate: (task: () => void) => unknown;
  readonly clearImmediate: (handle: unknown) => void;
}

function hasImmediate(host: SchedulerHost): host is SchedulerHost & ImmediateHost {
  return typeof host.setImmediate === "function" && typeof host.clearImmediate === "function";
}

/**
 * An unclamped scheduler for `host`, or none to keep Effect's default. Browsers lack
 * `setImmediate`, so Effect yields through `setTimeout(0)`, which nested timers clamp
 * to about 4 ms. A `MessageChannel` yield is not clamped.
 */
export function hostSchedulerFor(host: SchedulerHost): Option.Option<Scheduler.Scheduler> {
  // Probed at first use, not at Effect's module load, so a `setImmediate` polyfill
  // loaded in between is picked up rather than missed.
  if (hasImmediate(host)) {
    return Option.some(
      new Scheduler.MixedScheduler("async", (task) => {
        // Looked up per call, as Effect's default does, so installed fake timers apply.
        try {
          const handle = host.setImmediate(task);
          return () => host.clearImmediate(handle);
        } catch {
          // Effect's own fallback, for hosts that reject timers in some contexts. It
          // also covers a polyfill that was removed after the probe.
          return setMicrotask(task);
        }
      }),
    );
  }
  if (typeof host.MessageChannel !== "function") {
    return Option.none();
  }
  // A page never needs the close (RS9), and closing on every drain would churn one
  // channel per isolated yield.
  const closeWhenIdle = !("document" in host);
  return Option.some(
    new Scheduler.MixedScheduler(
      "async",
      makeMessageChannelSetImmediate(host.MessageChannel, closeWhenIdle),
    ),
  );
}

/** Runs `task` in a microtask unless the returned function cancels it first. */
function setMicrotask(task: () => void): () => void {
  let isCancelled = false;
  queueMicrotask(() => {
    if (!isCancelled) task();
  });
  return () => {
    isCancelled = true;
  };
}

/** This host's scheduler, resolved on first use and shared by every app. */
let globalHostScheduler: Option.Option<Scheduler.Scheduler> | undefined;

/**
 * Adds this host's scheduler to an app layer, so every fiber the app runtime runs
 * (render, pumps, flush, handlers) yields unclamped. A `Scheduler` the layer itself
 * provides wins.
 */
export function withHostScheduler<R, E>(layer: Layer.Layer<R, E>): Layer.Layer<R, E> {
  globalHostScheduler ??= hostSchedulerFor(globalThis);
  return Option.match(globalHostScheduler, {
    onNone: () => layer,
    // `provideMerge` keeps the app layer's own outputs on top.
    onSome: (scheduler) =>
      pipe(layer, Layer.provideMerge(Layer.succeed(Scheduler.Scheduler, scheduler))),
  });
}
