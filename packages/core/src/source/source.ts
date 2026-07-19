import {
  pipe,
  Cause,
  Effect,
  Filter,
  Scope,
  Stream,
  Deferred,
  SubscriptionRef,
  Option,
  Data,
  identity,
} from "effect";
import * as Subscribable from "~/subscribable";
import { isStream } from "~/stream";

/**
 * Raised by `toSubscribable` when a `Stream`-sourced prop completes without
 * ever emitting a value. The only source kind that can be legitimately absent.
 */
export class NoPropValue extends Data.TaggedError("NoPropValue")<{
  readonly key?: string;
}> {}

export namespace Source {
  /**
   * The caller-facing prop vocabulary: a slot typed `Source<T>` accepts a
   * static value, a `Stream`, an `Effect`, or an existing `Subscribable`, and the
   * caller can switch between them freely. An incoming `Subscribable` is threaded
   * through by reference (no re-wrap); the rest normalize via `toSubscribable`.
   */
  export type Source<A, E = any, R = any> =
    | A
    | Stream.Stream<A, E, R>
    | Effect.Effect<A, E, R>
    | Subscribable.Subscribable<A, E, R>;

  /**
   * Extract the emitted value type `A` from any {@link Source} kind, mirroring
   * Effect's `Effect.Effect.Success`. A `Stream`/`Effect`/`Subscribable`
   * contributes its value channel; a static value is itself.
   *
   * Checked in the same order as `OpenPropSource` (`combinator/types.ts`) so an
   * `Effect`, which is itself iterable for generators, never reaches the static
   * fallback. The props-object analog is `PropsE`/`PropsR` in `combinator/types.ts`.
   */
  export type Success<S> =
    S extends Stream.Stream<infer A, any, any>
      ? A
      : S extends Effect.Effect<infer A, any, any>
        ? A
        : S extends Subscribable.Subscribable<infer A, any, any>
          ? A
          : S;

  /** Extract the error channel `E` from any {@link Source} kind; a static value ⇒ `never`. */
  export type Error<S> =
    S extends Stream.Stream<any, infer E, any>
      ? E
      : S extends Effect.Effect<any, infer E, any>
        ? E
        : S extends Subscribable.Subscribable<any, infer E, any>
          ? E
          : never;

  /** Extract the requirement channel `R` from any {@link Source} kind; a static value ⇒ `never`. */
  export type Context<S> =
    S extends Stream.Stream<any, any, infer R>
      ? R
      : S extends Effect.Effect<any, any, infer R>
        ? R
        : S extends Subscribable.Subscribable<any, any, infer R>
          ? R
          : never;

  /**
   * Normalize a `Source<A>` into an await-first, hot `Subscribable`.
   *
   * - existing `Subscribable` → returned by reference (no new ref/fiber);
   * - static `A` → `get` succeeds immediately, `changes` emits once;
   * - `Effect<A>` → memoized, `changes` emits the resolved value once;
   * - `Stream<A>` → forks a scoped pump fiber holding the latest value in a
   *   `SubscriptionRef`; `get` is await-first and fails `NoPropValue` if the
   *   source ends before emitting.
   *
   * Scoped: the pump fiber terminates when the enclosing scope closes.
   *
   * @param source - The caller-supplied value.
   * @param key - Optional key carried on `NoPropValue` for diagnostics.
   */
  export function toSubscribable<A, E = never, R = never>(
    source: Source.Source<A, E, R>,
    key?: string,
  ): Effect.Effect<Subscribable.Subscribable<A, E | NoPropValue, R>, never, Scope.Scope> {
    // Identity: already a Subscribable, so return by reference, no new ref/fiber.
    if (Subscribable.isSubscribable(source)) {
      return Effect.succeed(source);
    }

    // Stream: hot/shared pump via SubscriptionRef + first-value latch.
    if (isStream(source)) {
      return Effect.gen(function* () {
        const ref = yield* SubscriptionRef.make(Option.none<A>());
        const latch = yield* Deferred.make<A, NoPropValue>();
        // Carries a genuine source failure to `changes` consumers (the
        // SubscriptionRef broadcast can't itself fail). Left pending forever when
        // the source completes normally or the scope interrupts the pump.
        const failure = yield* Deferred.make<never, E>();

        // Pump: drain source into ref and resolve the first-value latch.
        const pump = pipe(
          Stream.runForEach(source, (value) =>
            pipe(
              SubscriptionRef.set(ref, Option.some(value)),
              Effect.andThen(Deferred.succeed(latch, value)),
              Effect.asVoid,
            ),
          ),
          // On completion: if no value was ever emitted, fail the latch.
          Effect.ensuring(
            pipe(
              SubscriptionRef.get(ref),
              Effect.flatMap((opt) =>
                Option.isNone(opt)
                  ? Effect.asVoid(Deferred.fail(latch, new NoPropValue({ key })))
                  : Effect.void,
              ),
            ),
          ),
          // Surface a real source failure on `changes`; ignore scope-close
          // interruption (teardown is not an error).
          Effect.onError((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.asVoid(Deferred.failCause(failure, cause)),
          ),
        );

        // Fork pump into the enclosing scope: it dies when the scope closes.
        yield* Effect.forkScoped(pump);

        // get: return latest if available; otherwise await the first emission.
        const get = pipe(
          SubscriptionRef.get(ref),
          Effect.flatMap((opt) =>
            Option.isSome(opt) ? Effect.succeed(opt.value) : Deferred.await(latch),
          ),
        );

        // changes: the SubscriptionRef broadcast (present values only). A genuine
        // source-pump failure is injected via `interruptWhen` so it propagates to
        // subscribers instead of being swallowed; on normal completion the
        // `failure` deferred stays pending and never interrupts. `interruptWhen`
        // keeps the primary `SubscriptionRef.changes(ref)` subscription in the foreground, so the
        // emission timing the await-first contract relies on is preserved (unlike a
        // concurrent `merge`, which would fork it a hop later).
        const changes = pipe(
          SubscriptionRef.changes(ref),
          Stream.filterMap(Filter.fromPredicateOption(identity)),
          Stream.interruptWhen(Deferred.await(failure)),
        ) as Stream.Stream<A, NoPropValue>;

        return Subscribable.make({ get, changes });
      }) as Effect.Effect<Subscribable.Subscribable<A, NoPropValue>, never, Scope.Scope>;
    }

    // Effect: memoize so the source runs at most once across all consumers.
    if (Effect.isEffect(source)) {
      return Effect.gen(function* () {
        const memoized = yield* Effect.cached(source);
        const changes = Stream.fromEffect(memoized);
        return Subscribable.make({ get: memoized, changes });
      });
    }

    // Static value: succeed immediately, emit once, no fiber.
    return Effect.succeed(
      Subscribable.make({
        get: Effect.succeed(source),
        changes: Stream.make(source),
      }),
    );
  }
}
