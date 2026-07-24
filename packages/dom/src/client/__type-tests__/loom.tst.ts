// Pins the internal Loom scheduler type surface: register's generic inference
// (the cell type follows the commit callback's value), the commit error
// channel (any failure allowed, no requirements), and the numeric commit-ack
// effects. Assertions are evaluated by `vp run test:types` (TSTyche), not
// `vp run check`.
import { expect, test } from "tstyche";
import { Effect, Fiber, Option, Scope } from "effect";
import type { BoundaryContext, Loom, LoomCell, RenderContext } from "../../data";
import { ensureFlushFiber, makeLoomUnsafe } from "../loom";

// ── Fixtures ──────────────────────────────────────────────────────────────────

declare const loom: Loom;
declare const scope: Scope.Scope;
declare const boundary: Option.Option<BoundaryContext["Service"]>;
declare const reportUnhandled: RenderContext["Service"]["reportUnhandled"];
declare const numberCell: LoomCell<number>;

class CommitError {
  readonly _tag = "CommitError";
}
interface SomeService {
  readonly _: unique symbol;
}

declare const failingCommit: (value: string) => Effect.Effect<void, CommitError>;
declare const voidFiber: Fiber.Fiber<void>;
declare const requiringCommit: (value: string) => Effect.Effect<void, never, SomeService>;

// ── Tests ─────────────────────────────────────────────────────────────────────

test("makeLoomUnsafe allocates a Loom; ensureFlushFiber is a plain void effect", () => {
  expect(makeLoomUnsafe()).type.toBe<Loom>();
  expect(ensureFlushFiber(loom, scope)).type.toBe<Effect.Effect<void>>();
});

test("register infers the cell type from the commit callback", () => {
  const registered = loom.register({
    label: "child:stream-1",
    scope,
    boundary,
    reportUnhandled,
    commit: (_value: number) => Effect.void,
    onFirstCommit: Effect.void,
    onDiscard: Effect.void,
  });
  expect(registered).type.toBe<Effect.Effect<LoomCell<number>>>();
});

test("commit may fail with any error, but must not require services", () => {
  // The commit error channel is `unknown`: a typed failure is accepted.
  const registered = loom.register({
    label: "attribute:class",
    scope,
    boundary,
    reportUnhandled,
    commit: failingCommit,
  });
  expect(registered).type.toBe<Effect.Effect<LoomCell<string>>>();

  // A commit with unmet requirements is rejected (commits run on the flush
  // fiber, which provides nothing).
  expect(loom.register).type.not.toBeCallableWith({
    label: "attribute:class",
    scope,
    boundary,
    reportUnhandled,
    commit: requiringCommit,
  });
});

test("cell write is value-typed; everWritten is a sync probe", () => {
  expect(numberCell.write(1)).type.toBe<Effect.Effect<void>>();
  expect(numberCell.write).type.not.toBeCallableWith("nope");
  expect(numberCell.everWritten()).type.toBe<boolean>();
  // Any pump fiber shape attaches (covariant channels), synchronously.
  expect(numberCell.attachPumpFiber(voidFiber)).type.toBe<void>();
});

test("commit-ack effects resolve with the numeric generation", () => {
  expect(loom.awaitCommit).type.toBe<Effect.Effect<number>>();
  expect(loom.commitGeneration).type.toBe<Effect.Effect<number>>();
});
