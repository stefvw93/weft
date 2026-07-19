import { Effect, Stream } from "effect";

/**
 * Type guard for Effect `Stream` values. Uses `any` for the error and
 * requirements channels so it matches streams regardless of `E`/`R`.
 */
export function isStream(value: unknown): value is Stream.Stream<unknown, any, any> {
  return typeof value === "object" && value != null && Stream.TypeId in value;
}

/**
 * Normalizes a static value, `Effect`, or `Stream` into a `Stream`, the weft
 * equivalent of Vue's `unref`. Static values become a single-element stream,
 * Effects become a one-shot stream, and existing Streams pass through unchanged.
 */
export function toStream<A>(value: A | Effect.Effect<A> | Stream.Stream<A>): Stream.Stream<A> {
  if (isStream(value)) {
    return value;
  }
  if (Effect.isEffect(value)) {
    return Stream.fromEffect(value);
  }
  return Stream.make(value);
}
