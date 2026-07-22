import type { Effect, Stream, Types } from "effect";
import { Predicate } from "effect";

/**
 * Unique brand identifying a {@link Subscribable}. Effect 4 dropped its own
 * `Subscribable`/`Readable` modules, so Weft carries this reactivity interface
 * locally; the string brand mirrors Effect 4's `"~effect/*"` TypeId convention
 * (e.g. `SubscriptionRef`) and backs the {@link isSubscribable} guard.
 */
export const TypeId = "~@weftui/core/Subscribable";

/**
 * Type of the {@link TypeId} brand.
 */
export type TypeId = typeof TypeId;

/**
 * Phantom variance carrier for {@link Subscribable}; all three channels are
 * covariant, matching the `Effect`/`Stream` channels the value wraps.
 */
export interface Variance<out A, out E, out R> {
  readonly _A: Types.Covariant<A>;
  readonly _E: Types.Covariant<E>;
  readonly _R: Types.Covariant<R>;
}

/**
 * A hot, await-first reactive value: a current value plus a stream of every
 * value (including the current one). The interface is brand-only; read it
 * through the {@link get} / {@link changes} module accessors, which mirror
 * Effect 4's `SubscriptionRef.get` / `SubscriptionRef.changes` so a
 * `Subscribable` and a `SubscriptionRef` read the same way at a call site.
 *
 * This is Weft's local replacement for the `Subscribable` module Effect 4
 * removed, preserved as public API so `Source`, `Boundary`, and the DOM
 * renderers share one reactivity surface.
 */
export interface Subscribable<out A, out E = never, out R = never> {
  readonly [TypeId]: Variance<A, E, R>;
}

// Internal data shape behind the brand; the brand key still stores the TypeId
// string at runtime, so isSubscribable keeps working unchanged.
interface SubscribableImpl<A, E, R> {
  readonly [TypeId]: TypeId;
  readonly get: Effect.Effect<A, E, R>;
  readonly changes: Stream.Stream<A, E, R>;
}

const toImpl = <A, E, R>(self: Subscribable<A, E, R>): SubscribableImpl<A, E, R> =>
  self as unknown as SubscribableImpl<A, E, R>;

/**
 * Build a {@link Subscribable} from a `get` effect and a `changes` stream. The
 * caller owns the semantics of the two channels (e.g. hot vs. cold, whether
 * `changes` replays the current value); `make` only stamps the brand.
 */
export const make = <A, E = never, R = never>(options: {
  readonly get: Effect.Effect<A, E, R>;
  readonly changes: Stream.Stream<A, E, R>;
}): Subscribable<A, E, R> =>
  ({
    [TypeId]: TypeId,
    get: options.get,
    changes: options.changes,
  }) as unknown as Subscribable<A, E, R>;

/**
 * Read the current value of a {@link Subscribable} as an `Effect`. Mirrors
 * `SubscriptionRef.get`; the only way to read the value, the interface exposes
 * no members.
 */
export const get = <A, E, R>(self: Subscribable<A, E, R>): Effect.Effect<A, E, R> =>
  toImpl(self).get;

/**
 * The `Stream` of every value of a {@link Subscribable}, starting with the
 * current one. Mirrors `SubscriptionRef.changes`; the only way to observe
 * changes, the interface exposes no members.
 */
export const changes = <A, E, R>(self: Subscribable<A, E, R>): Stream.Stream<A, E, R> =>
  toImpl(self).changes;

/**
 * Refinement guard: `true` when `u` carries the {@link TypeId} brand, i.e. was
 * produced by {@link make}. Used by `Source.toSubscribable` to thread an
 * existing `Subscribable` through by reference instead of re-wrapping it.
 */
export const isSubscribable = (u: unknown): u is Subscribable<unknown, unknown, unknown> =>
  Predicate.hasProperty(u, TypeId);
