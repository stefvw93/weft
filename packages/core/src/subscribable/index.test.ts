import * as assert from "node:assert/strict";
import { Data, Effect, Exit, Stream, pipe } from "effect";
import { describe, it } from "vite-plus/test";
import * as Subscribable from "~/subscribable";

class ReadError extends Data.TaggedError("ReadError")<{ readonly detail: string }> {}

describe("Subscribable (data-first)", () => {
  // ───────────────────────────────────────────────────────────────────────
  // AC: TypeId is exported as the literal string (value side)
  // ───────────────────────────────────────────────────────────────────────

  describe("TypeId", () => {
    it("is the literal ~@weftui/core/Subscribable", () => {
      assert.equal(Subscribable.TypeId, "~@weftui/core/Subscribable");
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // AC: make accepts { get, changes } and stamps the TypeId brand at runtime
  // ───────────────────────────────────────────────────────────────────────

  describe("make", () => {
    it("stamps the TypeId string on the produced value (runtime shape unchanged)", () => {
      const sub = Subscribable.make({
        get: Effect.succeed(1),
        changes: Stream.make(1),
      });
      assert.equal(
        (sub as unknown as Record<string, unknown>)[Subscribable.TypeId],
        Subscribable.TypeId,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // AC: get(self) returns the underlying Effect
  // ───────────────────────────────────────────────────────────────────────

  describe("get", () => {
    it("returns the underlying get effect (happy path)", async () => {
      const sub = Subscribable.make({
        get: Effect.succeed("current"),
        changes: Stream.make("current"),
      });
      const value = await Effect.runPromise(Subscribable.get(sub));
      assert.equal(value, "current");
    });

    it("propagates the tagged error of a failing get effect", async () => {
      const sub = Subscribable.make({
        get: Effect.fail(new ReadError({ detail: "boom" })),
        changes: Stream.empty,
      });
      const error = await Effect.runPromise(Effect.flip(Subscribable.get(sub)));
      assert.ok(error instanceof ReadError);
      assert.equal(error.detail, "boom");
    });

    it("returns the same effect each call (pass-through, no wrapping)", () => {
      const get = Effect.succeed(7);
      const sub = Subscribable.make({ get, changes: Stream.make(7) });
      assert.equal(Subscribable.get(sub), get);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // AC: changes(self) returns the underlying Stream
  // ───────────────────────────────────────────────────────────────────────

  describe("changes", () => {
    it("returns the underlying changes stream (happy path)", async () => {
      const sub = Subscribable.make({
        get: Effect.succeed(3),
        changes: Stream.make(1, 2, 3),
      });
      const values = await Effect.runPromise(pipe(Subscribable.changes(sub), Stream.runCollect));
      assert.deepEqual(values, [1, 2, 3]);
    });

    it("propagates the tagged error of a failing changes stream", async () => {
      const sub = Subscribable.make({
        get: Effect.succeed(0),
        changes: Stream.fail(new ReadError({ detail: "stream-boom" })),
      });
      const exit = await Effect.runPromiseExit(pipe(Subscribable.changes(sub), Stream.runCollect));
      assert.ok(Exit.isFailure(exit));
    });

    it("returns the same stream each call (pass-through, no wrapping)", () => {
      const changes = Stream.make(1);
      const sub = Subscribable.make({ get: Effect.succeed(1), changes });
      assert.equal(Subscribable.changes(sub), changes);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // AC: isSubscribable guards on the TypeId brand
  // ───────────────────────────────────────────────────────────────────────

  describe("isSubscribable", () => {
    it("returns true for values produced by make", () => {
      const sub = Subscribable.make({
        get: Effect.succeed(1),
        changes: Stream.make(1),
      });
      assert.equal(Subscribable.isSubscribable(sub), true);
    });

    it("returns false for null, undefined, and primitives", () => {
      assert.equal(Subscribable.isSubscribable(null), false);
      assert.equal(Subscribable.isSubscribable(undefined), false);
      assert.equal(Subscribable.isSubscribable(42), false);
      assert.equal(Subscribable.isSubscribable("sub"), false);
    });

    it("returns false for objects without the brand", () => {
      assert.equal(
        Subscribable.isSubscribable({ get: Effect.succeed(1), changes: Stream.make(1) }),
        false,
      );
    });
  });
});
