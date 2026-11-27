import { Context, Option, Scheduler } from "effect";

/** The host capabilities {@link renderSchedulerFor} probes. */
export interface SchedulerHost {
  readonly setImmediate?: unknown;
  readonly MessageChannel?: typeof MessageChannel | undefined;
}

/**
 * A `setImmediate` replacement built on a `MessageChannel`. Tasks run in FIFO order,
 * one per message, and the returned function cancels a pending task. The channel
 * closes once the queue drains, so an idle port never holds a process open.
 */
export function makeMessageChannelSetImmediate(
  Channel: typeof MessageChannel,
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
            created.port1.close();
            channel = undefined;
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

/**
 * A scheduler for render fibers on `host`, or none to keep Effect's default.
 * Browsers lack `setImmediate`, so Effect yields through `setTimeout(0)`, which
 * nested timers clamp to about 4 ms. A `MessageChannel` yield is not clamped.
 */
export function renderSchedulerFor(host: SchedulerHost): Option.Option<Scheduler.Scheduler> {
  // Effect's own probe. Effect runs it at module load, this at first mount, so a
  // `setImmediate` polyfill loaded in between would keep the clamped default.
  if ("setImmediate" in host || typeof host.MessageChannel !== "function") {
    return Option.none();
  }
  return Option.some(
    new Scheduler.MixedScheduler("async", makeMessageChannelSetImmediate(host.MessageChannel)),
  );
}

/** This host's render scheduler, resolved on first use and shared by every app. */
let globalRenderScheduler: Option.Option<Scheduler.Scheduler> | undefined;

/**
 * Adds this host's render scheduler to `context`. A `Scheduler` the app layer
 * already provides wins, as does Effect's default where no override applies.
 */
export function withRenderScheduler<R>(context: Context.Context<R>): Context.Context<R> {
  // `getOrUndefined`: a Reference's `getOption` yields its default, not absence.
  if (Context.getOrUndefined(context, Scheduler.Scheduler) !== undefined) {
    return context;
  }
  globalRenderScheduler ??= renderSchedulerFor(globalThis);
  return Option.match(globalRenderScheduler, {
    onNone: () => context,
    onSome: (scheduler) => Context.add(context, Scheduler.Scheduler, scheduler),
  });
}
