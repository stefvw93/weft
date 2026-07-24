import { Effect, Option, Stream } from "effect";

/**
 * A region's pump paired with a one-shot capture slot for its first value.
 *
 * The pump is forked with `{ startImmediately: true }` during a mount pass, so a
 * source whose first element is synchronously available delivers it *during* the
 * fork call. That element lands in the slot instead of the Loom cell, letting the
 * caller render it inline and paint it in the mount frame.
 */
export interface InlineHeadPump<A, E, R> {
  /**
   * The subscription effect to fork. This is the region's only subscription to
   * the source: the first value is captured while the window is open, every
   * later value goes to the sink.
   */
  readonly pump: Effect.Effect<void, E, R>;
  /**
   * Closes the capture window and yields whatever was captured. Call
   * synchronously after forking {@link pump}, before any `yield`, so a value
   * arriving later cannot be mistaken for the head. Idempotent.
   */
  readonly seal: () => Option.Option<A>;
}

/**
 * Builds a region's pump with an inline capture window for its first value.
 *
 * Forking is left to the caller (`forkSupervised`), so this module stays free of
 * renderer imports and the slot is testable without a DOM.
 *
 * @param changes - the region's change stream, subscribed exactly once
 * @param onLater - sink for every value after the head, normally `cell.write`
 * @param enabled - when false the window never opens and every value, including
 *   the first, goes to `onLater`; this is today's behavior, used inside Loom
 *   commits and hydration where `startImmediately` forks are unsafe (see #179)
 */
export function makeInlineHeadPump<A, E, R>(
  changes: Stream.Stream<A, E, R>,
  onLater: (value: A) => Effect.Effect<void>,
  enabled: boolean,
): InlineHeadPump<A, E, R> {
  let open = enabled;
  let head: Option.Option<A> = Option.none();

  // Only the FIRST element is captured. A source that emits several elements
  // synchronously (`Stream.make(1, 2, 3)`) still sends 2..n to the sink, since
  // `head` is already `Some` by then, so nothing is lost or double-counted.
  const pump = Stream.runForEach(changes, (value) => {
    if (open && Option.isNone(head)) {
      head = Option.some(value);
      return Effect.void;
    }
    return onLater(value);
  });

  return {
    pump,
    seal: () => {
      open = false;
      return head;
    },
  };
}
