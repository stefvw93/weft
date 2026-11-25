import { Effect, Option, Stream } from "effect";

/**
 * A region's pump paired with a capture slot for its first value.
 *
 * The pump is forked with `{ startImmediately: true }` during a mount pass, so a
 * source with synchronously available elements delivers them *during* the fork
 * call. The newest lands in the slot instead of the Loom cell, letting the
 * caller render it inline and paint it in the mount frame.
 */
export interface InlineHeadPump<A, E, R> {
  /**
   * The subscription effect to fork. This is the region's only subscription to
   * the source: values delivered while the window is open conflate into the slot,
   * every later value goes to the sink.
   */
  readonly pump: Effect.Effect<void, E, R>;
  /**
   * Closes the capture window and yields the newest captured value. Call
   * synchronously after forking {@link pump}, before any `yield`, so a value
   * arriving later cannot be mistaken for the head. Idempotent.
   */
  readonly seal: () => Option.Option<A>;
}

/**
 * Builds a region's pump with an inline capture window for its first value.
 * Forking is left to the caller. With `enabled` false the window never opens and
 * every value goes to `onLater`.
 */
export function makeInlineHeadPump<A, E, R>(
  changes: Stream.Stream<A, E, R>,
  onLater: (value: A) => Effect.Effect<void>,
  enabled: boolean,
): InlineHeadPump<A, E, R> {
  let open = enabled;
  let head: Option.Option<A> = Option.none();

  // Latest value wins inside the window too: a synchronous burst paints only its
  // newest element, matching how the cell conflates a burst (LM conflation).
  const pump = Stream.runForEach(changes, (value) => {
    if (open) {
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
