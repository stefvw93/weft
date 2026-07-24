import * as assert from "node:assert/strict";
import { Cause, Deferred, Effect, Exit, Fiber, Option, Scope, pipe } from "effect";
import { describe, it } from "vite-plus/test";
import type { BoundaryContext, Loom, LoomRegisterOptions, RenderContext } from "~/data";
import { ensureFlushFiber, makeLoomUnsafe } from "./loom";

// ============================================================================
// Harness
// ============================================================================

interface Harness {
  readonly loom: Loom;
  readonly appScope: Scope.Closeable;
  /** Regions reported via `reportUnhandled`, in order. */
  readonly unhandled: string[];
  readonly reportUnhandled: RenderContext["Service"]["reportUnhandled"];
}

function makeHarness(): Harness {
  const unhandled: string[] = [];
  return {
    loom: makeLoomUnsafe(),
    appScope: Scope.makeUnsafe("sequential"),
    unhandled,
    reportUnhandled: (_cause, region) => Effect.sync(() => void unhandled.push(region)),
  };
}

/** Run a test body against a fresh loom with a started flush fiber. */
function run<A>(body: (h: Harness) => Effect.Effect<A, unknown>): Promise<A> {
  const h = makeHarness();
  return Effect.runPromise(
    pipe(
      ensureFlushFiber(h.loom, h.appScope),
      Effect.andThen(Effect.suspend(() => body(h))),
      Effect.ensuring(Scope.close(h.appScope, Exit.void)),
    ),
  ) as Promise<A>;
}

/** Register with harness defaults; override per test. */
function register<A>(
  h: Harness,
  options: Partial<LoomRegisterOptions<A>> & Pick<LoomRegisterOptions<A>, "commit">,
) {
  return h.loom.register<A>({
    label: "test:cell",
    scope: options.scope ?? h.appScope,
    boundary: Option.none(),
    reportUnhandled: h.reportUnhandled,
    ...options,
  });
}

const sleep = (ms: number) => Effect.promise(() => new Promise((r) => setTimeout(r, ms)));

// ============================================================================
// Conflation (LM1, LM2)
// ============================================================================

describe("Loom conflation", () => {
  it("LM1: writes during a blocked pass conflate to one commit with the last value", () =>
    run((h) =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();
        const blockerCommits: string[] = [];
        const commits: number[] = [];

        // Blocker: first commit signals `started`, then blocks on `gate`.
        const blocker = yield* register<string>(h, {
          label: "test:blocker",
          commit: (value) =>
            pipe(
              Deferred.succeed(started, undefined),
              Effect.andThen(Deferred.await(gate)),
              Effect.andThen(Effect.sync(() => void blockerCommits.push(value))),
            ),
        });
        const cell = yield* register<number>(h, {
          commit: (value) => Effect.sync(() => void commits.push(value)),
        });

        yield* blocker.write("x");
        yield* Deferred.await(started); // flush is now mid-pass, blocked
        for (const n of [1, 2, 3, 4, 5]) {
          yield* cell.write(n);
        }
        yield* Deferred.succeed(gate, undefined);
        yield* h.loom.awaitCommit;

        assert.deepEqual(blockerCommits, ["x"]);
        assert.deepEqual(commits, [5]);
      }),
    ));

  it("LM2: a single write commits on the next wake-drain pass (no timers)", () =>
    run((h) =>
      Effect.gen(function* () {
        const commits: string[] = [];
        const cell = yield* register<string>(h, {
          commit: (value) => Effect.sync(() => void commits.push(value)),
        });
        yield* cell.write("only");
        yield* h.loom.awaitCommit;
        assert.deepEqual(commits, ["only"]);
      }),
    ));

  it("LM1: everWritten flips once the pump has written", () =>
    run((h) =>
      Effect.gen(function* () {
        const cell = yield* register<number>(h, { commit: () => Effect.void });
        assert.equal(cell.everWritten(), false);
        yield* cell.write(1);
        assert.equal(cell.everWritten(), true);
      }),
    ));
});

// ============================================================================
// Ordering & lifecycle (LM4, LM5, LM6)
// ============================================================================

describe("Loom ordering & lifecycle", () => {
  it("LM4: dirty cells commit in ascending registration order (outer before inner)", () =>
    run((h) =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();
        const order: string[] = [];

        const blocker = yield* register<void>(h, {
          label: "test:blocker",
          commit: () =>
            pipe(Deferred.succeed(started, undefined), Effect.andThen(Deferred.await(gate))),
        });
        const outer = yield* register<void>(h, {
          label: "test:outer",
          commit: () => Effect.sync(() => void order.push("outer")),
        });
        const inner = yield* register<void>(h, {
          label: "test:inner",
          commit: () => Effect.sync(() => void order.push("inner")),
        });

        yield* blocker.write(undefined);
        yield* Deferred.await(started);
        // Dirty the inner cell first: registration order must still win.
        yield* inner.write(undefined);
        yield* outer.write(undefined);
        yield* Deferred.succeed(gate, undefined);
        yield* h.loom.awaitCommit;

        assert.deepEqual(order, ["outer", "inner"]);
      }),
    ));

  it("LM4: a cell registered and written during a commit drains after its parent in the same pass", () =>
    run((h) =>
      Effect.gen(function* () {
        const order: string[] = [];
        const parent = yield* register<void>(h, {
          label: "test:parent",
          commit: () =>
            Effect.gen(function* () {
              order.push("parent");
              const child = yield* register<void>(h, {
                label: "test:child",
                commit: () => Effect.sync(() => void order.push("child")),
              });
              yield* child.write(undefined);
            }),
        });
        yield* parent.write(undefined);
        yield* h.loom.awaitCommit;
        assert.deepEqual(order, ["parent", "child"]);
      }),
    ));

  it("LM5/LM6: closing the cell scope before the pass reaches it skips the commit and fires onDiscard", () =>
    run((h) =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();
        const commits: number[] = [];
        let discarded = 0;

        const blocker = yield* register<void>(h, {
          label: "test:blocker",
          commit: () =>
            pipe(Deferred.succeed(started, undefined), Effect.andThen(Deferred.await(gate))),
        });
        const cellScope = yield* Scope.fork(h.appScope, "sequential");
        const doomed = yield* register<number>(h, {
          scope: cellScope,
          commit: (value) => Effect.sync(() => void commits.push(value)),
          onDiscard: Effect.sync(() => void discarded++),
        });

        yield* blocker.write(undefined);
        yield* Deferred.await(started);
        yield* doomed.write(42); // dirty while the pass is blocked
        yield* Scope.close(cellScope, Exit.void); // dies before the pass reaches it
        yield* Deferred.succeed(gate, undefined);
        yield* h.loom.awaitCommit;

        assert.deepEqual(commits, []);
        assert.equal(discarded, 1);
      }),
    ));

  it("LM6: a cell that already committed does not fire onDiscard when its scope closes", () =>
    run((h) =>
      Effect.gen(function* () {
        let discarded = 0;
        const cellScope = yield* Scope.fork(h.appScope, "sequential");
        const cell = yield* register<number>(h, {
          scope: cellScope,
          commit: () => Effect.void,
          onDiscard: Effect.sync(() => void discarded++),
        });
        yield* cell.write(1);
        yield* h.loom.awaitCommit;
        yield* Scope.close(cellScope, Exit.void);
        assert.equal(discarded, 0);
      }),
    ));
});

// ============================================================================
// Commit-ack & generation (LM7, LM8, LM9, LM10)
// ============================================================================

describe("Loom commit-ack", () => {
  it("LM7: awaitCommit resolves immediately with the current generation when idle", () =>
    run((h) =>
      Effect.gen(function* () {
        assert.equal(yield* h.loom.awaitCommit, 0);
        assert.equal(yield* h.loom.commitGeneration, 0);
        const cell = yield* register<number>(h, { commit: () => Effect.void });
        yield* cell.write(1);
        yield* h.loom.awaitCommit;
        assert.equal(yield* h.loom.awaitCommit, 1);
      }),
    ));

  it("LM8: awaitCommit while dirty resolves only after the pass drains", () =>
    run((h) =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();
        const cell = yield* register<void>(h, {
          commit: () =>
            pipe(Deferred.succeed(started, undefined), Effect.andThen(Deferred.await(gate))),
        });
        yield* cell.write(undefined);
        yield* Deferred.await(started);

        let resolved = false;
        const waiter = yield* pipe(
          h.loom.awaitCommit,
          Effect.tap(() => Effect.sync(() => void (resolved = true))),
          Effect.forkDetach,
        );
        yield* sleep(50);
        assert.equal(resolved, false);

        yield* Deferred.succeed(gate, undefined);
        const generation = yield* Fiber.join(waiter);
        assert.equal(resolved, true);
        assert.equal(generation, 1);
      }),
    ));

  it("LM9: generation is monotonic and +1 per committing pass, even with multiple cells", () =>
    run((h) =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();
        const blocker = yield* register<void>(h, {
          commit: () =>
            pipe(Deferred.succeed(started, undefined), Effect.andThen(Deferred.await(gate))),
        });
        const a = yield* register<number>(h, { commit: () => Effect.void });
        const b = yield* register<number>(h, { commit: () => Effect.void });

        // One blocked pass, two more cells dirtied: a single generation bump.
        yield* blocker.write(undefined);
        yield* Deferred.await(started);
        yield* a.write(1);
        yield* b.write(2);
        yield* Deferred.succeed(gate, undefined);
        const first = yield* h.loom.awaitCommit;
        assert.equal(first, 1);

        // A later single-cell pass bumps again.
        yield* a.write(3);
        const second = yield* h.loom.awaitCommit;
        assert.equal(second, 2);
      }),
    ));

  it("LM10: closing the app scope resolves outstanding awaitCommit barriers", async () => {
    const h = makeHarness();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* ensureFlushFiber(h.loom, h.appScope);
        const gate = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();
        const cell = yield* register<void>(h, {
          commit: () =>
            pipe(Deferred.succeed(started, undefined), Effect.andThen(Deferred.await(gate))),
        });
        yield* cell.write(undefined);
        yield* Deferred.await(started);

        const waiter = yield* pipe(h.loom.awaitCommit, Effect.forkDetach);
        yield* sleep(20);
        // Dispose the app while the pass is blocked: the barrier must resolve.
        yield* Scope.close(h.appScope, Exit.void);
        return yield* Fiber.join(waiter);
      }),
    );
    assert.equal(typeof result, "number");
  });
});

// ============================================================================
// Ack lifecycle hooks (LM12-shape at loom level)
// ============================================================================

describe("Loom first-commit hooks", () => {
  it("onFirstCommit fires exactly once, after the first successful commit", () =>
    run((h) =>
      Effect.gen(function* () {
        let firsts = 0;
        const cell = yield* register<number>(h, {
          commit: () => Effect.void,
          onFirstCommit: Effect.sync(() => void firsts++),
        });
        yield* cell.write(1);
        yield* h.loom.awaitCommit;
        yield* cell.write(2);
        yield* h.loom.awaitCommit;
        assert.equal(firsts, 1);
      }),
    ));
});

// ============================================================================
// Error routing (LM16, LM19, LM20)
// ============================================================================

describe("Loom error routing", () => {
  it("LM16: a failing commit with no boundary routes to reportUnhandled(label) and the flush survives", () =>
    run((h) =>
      Effect.gen(function* () {
        const commits: number[] = [];
        let discarded = 0;
        const failing = yield* register<number>(h, {
          label: "test:failing",
          commit: () => Effect.fail("commit went wrong"),
          onDiscard: Effect.sync(() => void discarded++),
        });
        const healthy = yield* register<number>(h, {
          commit: (value) => Effect.sync(() => void commits.push(value)),
        });

        yield* failing.write(1);
        yield* h.loom.awaitCommit;
        assert.deepEqual(h.unhandled, ["test:failing"]);
        assert.equal(discarded, 1);

        // Flush fiber survives: a healthy cell still commits afterwards.
        yield* healthy.write(7);
        yield* h.loom.awaitCommit;
        assert.deepEqual(commits, [7]);
      }),
    ));

  it("LM16: a failing commit with a boundary routes the cause to the boundary, not reportUnhandled", () =>
    run((h) =>
      Effect.gen(function* () {
        const reported: unknown[] = [];
        const boundary: BoundaryContext["Service"] = {
          reportError: (cause) => Effect.sync(() => void reported.push(Cause.squash(cause))),
        };
        const failing = yield* register<number>(h, {
          label: "test:bounded",
          boundary: Option.some(boundary),
          commit: () => Effect.fail("routed to boundary"),
        });
        yield* failing.write(1);
        yield* h.loom.awaitCommit;
        assert.deepEqual(reported, ["routed to boundary"]);
        assert.deepEqual(h.unhandled, []);
      }),
    ));

  it("LM16: a failed cell's pump fiber is interrupted", () =>
    run((h) =>
      Effect.gen(function* () {
        let interrupted = false;
        const pump = yield* pipe(
          Effect.never,
          Effect.onInterrupt(() => Effect.sync(() => void (interrupted = true))),
          Effect.forkIn(h.appScope),
        );
        const failing = yield* register<number>(h, {
          label: "test:failing-pump",
          commit: () => Effect.fail("boom"),
        });
        failing.attachPumpFiber(pump);
        yield* failing.write(1);
        yield* h.loom.awaitCommit;
        yield* sleep(20); // interruption is forked, give it a beat
        assert.equal(interrupted, true);
      }),
    ));

  it("LM20: a write into a cell killed by commit failure is harmless and never commits", () =>
    run((h) =>
      Effect.gen(function* () {
        let calls = 0;
        const failing = yield* register<number>(h, {
          label: "test:doomed",
          commit: () =>
            Effect.suspend(() => {
              calls++;
              return Effect.fail("boom");
            }),
        });
        yield* failing.write(1);
        yield* h.loom.awaitCommit;
        assert.equal(calls, 1);

        // Doomed pump writes once more into the dead cell: skipped, no rerun.
        yield* failing.write(2);
        yield* h.loom.awaitCommit;
        assert.equal(calls, 1);
        assert.deepEqual(h.unhandled, ["test:doomed"]);
      }),
    ));

  it("LM16: a commit defect (die) routes like a failure; the loop keeps draining other cells", () =>
    run((h) =>
      Effect.gen(function* () {
        const commits: number[] = [];
        const dying = yield* register<number>(h, {
          label: "test:defect",
          commit: () => Effect.die(new Error("defect in commit")),
        });
        const healthy = yield* register<number>(h, {
          commit: (value) => Effect.sync(() => void commits.push(value)),
        });
        yield* dying.write(1);
        yield* h.loom.awaitCommit;
        yield* healthy.write(9);
        yield* h.loom.awaitCommit;
        assert.deepEqual(commits, [9]);
        assert.deepEqual(h.unhandled, ["test:defect"]);
      }),
    ));

  it("LM19: a defect in the error routing itself is contained; barriers still resolve", () =>
    run((h) =>
      Effect.gen(function* () {
        const commits: number[] = [];
        // The failure ROUTING itself dies: reportUnhandled defects. The pass
        // must contain it, keep draining, and resolve awaitCommit barriers.
        const dying = yield* h.loom.register<number>({
          label: "test:routing-defect",
          scope: h.appScope,
          boundary: Option.none(),
          reportUnhandled: () => Effect.die(new Error("reporter defect")),
          commit: () => Effect.fail("boom"),
        });
        const healthy = yield* register<number>(h, {
          commit: (value) => Effect.sync(() => void commits.push(value)),
        });
        yield* dying.write(1);
        assert.equal(typeof (yield* h.loom.awaitCommit), "number");
        // The flush fiber survived: later writes still commit and ack.
        yield* healthy.write(9);
        yield* h.loom.awaitCommit;
        assert.deepEqual(commits, [9]);
      }),
    ));

  it("LM16/LM20: teardown racing an in-flight commit suppresses its hooks and routing", () =>
    run((h) =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();
        let firsts = 0;
        let discarded = 0;
        const cellScope = yield* Scope.fork(h.appScope, "sequential");
        const cell = yield* register<number>(h, {
          scope: cellScope,
          commit: () =>
            pipe(
              Deferred.succeed(started, undefined),
              Effect.andThen(Deferred.await(gate)),
              // The commit's tail fails: were the cell alive, this would
              // route to reportUnhandled. Dead-cell suppression must eat it.
              Effect.andThen(Effect.fail("late failure in torn-down region")),
            ),
          onFirstCommit: Effect.sync(() => void firsts++),
          onDiscard: Effect.sync(() => void discarded++),
        });
        yield* cell.write(1);
        yield* Deferred.await(started); // commit in flight on the flush fiber
        yield* Scope.close(cellScope, Exit.void); // unmount racing the commit
        assert.equal(discarded, 1); // died before first commit: onDiscard fired
        yield* Deferred.succeed(gate, undefined); // commit completes (accepted semantics)
        yield* h.loom.awaitCommit;
        assert.equal(firsts, 0, "no onFirstCommit for a torn-down region");
        assert.deepEqual(h.unhandled, [], "no spurious error routing for a dead cell");
      }),
    ));
});

// ============================================================================
// Settle waits for the commit, not the value (LM12 at loom level)
// ============================================================================

describe("Loom settle-on-commit ordering", () => {
  it("LM12: onFirstCommit fires only after the commit completes, not on write", () =>
    run((h) =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();
        let firsts = 0;
        const cell = yield* register<number>(h, {
          commit: () =>
            pipe(Deferred.succeed(started, undefined), Effect.andThen(Deferred.await(gate))),
          onFirstCommit: Effect.sync(() => void firsts++),
        });
        yield* cell.write(1);
        yield* Deferred.await(started); // value delivered, commit in flight
        assert.equal(firsts, 0);
        yield* Deferred.succeed(gate, undefined);
        yield* h.loom.awaitCommit;
        assert.equal(firsts, 1);
      }),
    ));
});
