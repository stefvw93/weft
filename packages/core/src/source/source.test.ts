import * as assert from "node:assert/strict";
import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  Scope,
  Stream,
  SubscriptionRef,
  pipe,
} from "effect";
import { describe, it } from "vite-plus/test";
import { NoPropValue, Source } from "~/source/source";
import * as Subscribable from "~/subscribable";
import { Cause } from "effect";

// Run an Effect inside a managed Scope (Effect.scoped closes the scope when done).
const scoped = <A>(eff: Effect.Effect<A, any, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(eff));

describe("Source.toSubscribable", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // AC-3: static normalization
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-3 static normalization", () => {
    it("get succeeds with the static value", async () => {
      const value = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable("hello");
          return yield* sub.get;
        }),
      );
      assert.equal(value, "hello");
    });

    it("changes emits the value exactly once then completes", async () => {
      const values = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(42);
          return yield* pipe(sub.changes, Stream.runCollect);
        }),
      );
      assert.deepEqual(values, [42]);
    });

    it("never raises NoPropValue", async () => {
      const exit = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const sub = yield* Source.toSubscribable("x");
            return yield* Effect.exit(sub.get);
          }),
        ),
      );
      assert.ok(Exit.isSuccess(exit));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-4: Effect normalization (memoized, runs once)
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-4 effect normalization", () => {
    it("resolves get to the effect value", async () => {
      const value = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(Effect.succeed("from-effect"));
          return yield* sub.get;
        }),
      );
      assert.equal(value, "from-effect");
    });

    it("changes emits the resolved value exactly once", async () => {
      const values = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(Effect.succeed(7));
          return yield* pipe(sub.changes, Stream.runCollect);
        }),
      );
      assert.deepEqual(values, [7]);
    });

    it("underlying effect runs exactly once across multiple get/changes consumers", async () => {
      let runs = 0;
      const source = Effect.sync(() => {
        runs++;
        return "once";
      });

      await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(source);
          // Consume via get twice and via changes once.
          const v1 = yield* sub.get;
          const v2 = yield* sub.get;
          const items = yield* pipe(sub.changes, Stream.runCollect);
          assert.equal(v1, "once");
          assert.equal(v2, "once");
          assert.deepEqual(items, ["once"]);
          assert.equal(runs, 1);
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-5: stream await-first (latest value returned without waiting)
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-5 stream await-first (latest)", () => {
    it("get returns the most recent emitted value without re-awaiting", async () => {
      const source = Stream.make("first");
      const value = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(source);
          // Drain the first emission so the ref is populated.
          yield* pipe(sub.changes, Stream.take(1), Stream.runDrain);
          return yield* sub.get;
        }),
      );
      assert.equal(value, "first");
    });

    it("get returns last of multiple emitted values", async () => {
      const value = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(Stream.make(1, 2));
          // Wait until the latest broadcast value is the final one. Robust to
          // whether the hot SubscriptionRef replays the intermediate `1` or only
          // the current value, unlike a fixed `take(2)` (which races the pump).
          yield* pipe(
            sub.changes,
            Stream.takeUntil((v) => v === 2),
            Stream.runDrain,
          );
          return yield* sub.get;
        }),
      );
      assert.equal(value, 2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-6: stream await-first (parks until first emission)
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-6 stream await-first (pending)", () => {
    it("get parks and resolves with the first emitted value", async () => {
      const gate = await Effect.runPromise(Deferred.make<string>());
      const source = Stream.fromEffect(Deferred.await(gate));

      const value = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(source);
          // Fork get: it should park because the gate is not yet open.
          const getFiber = yield* Effect.forkChild(sub.get);
          // Open the gate, supplying the first (and only) value.
          yield* Deferred.succeed(gate, "parked-value");
          return yield* Fiber.join(getFiber);
        }),
      );
      assert.equal(value, "parked-value");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-7: stream ends without emitting → NoPropValue (with key)
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-7 stream ends empty", () => {
    it("get fails with NoPropValue when source completes without emitting", async () => {
      const error = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(Stream.empty, "myProp");
          return yield* Effect.flip(sub.get);
        }),
      );
      assert.ok(error instanceof NoPropValue);
      assert.equal(error.key, "myProp");
    });

    it("NoPropValue carries no key when key is omitted", async () => {
      const error = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(Stream.empty);
          return yield* Effect.flip(sub.get);
        }),
      );
      assert.ok(error instanceof NoPropValue);
      assert.equal(error.key, undefined);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-10: stream failure propagates on `changes` (not swallowed by the pump)
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-10 stream failure on changes", () => {
    class Boom {
      readonly _tag = "Boom";
    }

    it("changes fails when the source fails after emitting", async () => {
      const source = Stream.concat(Stream.make("a"), Stream.fail(new Boom()));
      const exit = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(source);
          return yield* pipe(sub.changes, Stream.runDrain, Effect.exit);
        }),
      );
      assert.ok(Exit.isFailure(exit), "changes surfaces the source failure");
      assert.ok(
        Exit.isFailure(exit) &&
          Option.exists(Cause.findErrorOption(exit.cause), (e) => e instanceof Boom),
        "the failure carries the original source error",
      );
    });

    it("get still resolves to the emitted value despite the later failure", async () => {
      const source = Stream.concat(Stream.make("a"), Stream.fail(new Boom()));
      const value = await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(source);
          // Drain the first emission (the failure fires afterwards).
          yield* pipe(sub.changes, Stream.take(1), Stream.runDrain, Effect.ignore);
          return yield* sub.get;
        }),
      );
      assert.equal(value, "a");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-8: hot / shared (source runs once regardless of consumer count)
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-8 hot / shared source", () => {
    it("stream source runs exactly once across multiple get consumers", async () => {
      let runs = 0;
      const source = Stream.fromEffect(
        Effect.sync(() => {
          runs++;
          return "shared";
        }),
      );

      await scoped(
        Effect.gen(function* () {
          const sub = yield* Source.toSubscribable(source);
          // Wait for the pump to process the single emission.
          yield* pipe(sub.changes, Stream.take(1), Stream.runDrain);
          const v1 = yield* sub.get;
          const v2 = yield* sub.get;
          assert.equal(v1, "shared");
          assert.equal(v2, "shared");
          assert.equal(runs, 1);
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-9: identity pass-through
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-9 identity pass-through", () => {
    it("returns the same Subscribable reference when given an existing one", async () => {
      const ref = await Effect.runPromise(SubscriptionRef.make("x"));
      const existing = Subscribable.make({
        get: SubscriptionRef.get(ref),
        changes: SubscriptionRef.changes(ref),
      });
      const result = await scoped(Source.toSubscribable(existing));
      assert.equal(result, existing);
    });

    it("forks no fiber for an existing Subscribable (scope stays clean)", async () => {
      const ref = await Effect.runPromise(SubscriptionRef.make("y"));
      const existing = Subscribable.make({
        get: SubscriptionRef.get(ref),
        changes: SubscriptionRef.changes(ref),
      });
      const exit = await Effect.runPromise(
        pipe(
          Effect.scoped(
            Effect.gen(function* () {
              const sub = yield* Source.toSubscribable(existing);
              assert.equal(sub, existing);
              return yield* sub.get;
            }),
          ),
          Effect.exit,
        ),
      );
      assert.ok(Exit.isSuccess(exit));
      assert.equal(Exit.isSuccess(exit) ? exit.value : null, "y");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Integration: prop key carried on error
  // ─────────────────────────────────────────────────────────────────────────

  it("NoPropValue carries the supplied key on empty stream", async () => {
    const cause = await Effect.runPromise(
      Effect.scoped(
        pipe(
          Effect.gen(function* () {
            const sub = yield* Source.toSubscribable(Stream.empty, "label");
            // @effect-diagnostics-next-line missingReturnYieldStar:off
            yield* sub.get;
          }),
          Effect.sandbox,
          Effect.flip,
        ),
      ),
    );
    const failure = Cause.findErrorOption(cause);
    assert.ok(Option.isSome(failure));
    assert.ok(failure.value instanceof NoPropValue);
    assert.equal(failure.value.key, "label");
  });
});
