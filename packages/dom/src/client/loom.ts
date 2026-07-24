import { Cause, Deferred, Effect, Exit, Fiber, Option, Scope, pipe } from "effect";
import type { BoundaryContext, Loom, LoomCell, LoomRegisterOptions, RenderContext } from "~/data";

/** Internal per-cell record. `commit` runs only on the flush fiber. */
interface CellState {
  readonly seq: number;
  readonly label: string;
  latest: unknown;
  everWritten: boolean;
  committedOnce: boolean;
  alive: boolean;
  readonly commit: (value: unknown) => Effect.Effect<void, unknown>;
  readonly boundary: Option.Option<BoundaryContext["Service"]>;
  readonly reportUnhandled: RenderContext["Service"]["reportUnhandled"];
  readonly onFirstCommit: Effect.Effect<void> | undefined;
  readonly onDiscard: Effect.Effect<void> | undefined;
  pumpFiber: Fiber.Fiber<unknown, unknown> | undefined;
}

/** Module-private per-loom state, keyed off the public loom object. */
interface LoomState {
  nextSeq: number;
  readonly cells: Map<number, CellState>;
  readonly dirty: Set<CellState>;
  /** Rotated wake latch: writes resolve it, the flush loop replaces it per pass. */
  wake: Deferred.Deferred<void>;
  /** `awaitCommit` barriers outstanding for the current/next pass. */
  barriers: Deferred.Deferred<number>[];
  generation: number;
  /** True while a flush pass is draining (dirty may be transiently empty). */
  flushing: boolean;
  flushStarted: boolean;
}

const states = new WeakMap<Loom, LoomState>();

function stateOf(loom: Loom): LoomState {
  const state = states.get(loom);
  if (state === undefined) {
    throw new Error("Expected a Loom created by makeLoomUnsafe");
  }
  return state;
}

/**
 * Kills a cell: unregisters it and, when it never committed, fires `onDiscard`
 * exactly once. Shared by the scope finalizer and the commit-failure path.
 */
function discard(state: LoomState, cell: CellState): Effect.Effect<void> {
  return Effect.suspend(() => {
    if (!cell.alive) {
      return Effect.void;
    }
    cell.alive = false;
    state.cells.delete(cell.seq);
    state.dirty.delete(cell);
    return !cell.committedOnce && cell.onDiscard !== undefined
      ? contained(cell.onDiscard)
      : Effect.void;
  });
}

/**
 * Runs a lifecycle hook or error-routing effect so that its own failure or
 * defect can never unwind the flush pass: the cause is logged and swallowed.
 */
function contained(effect: Effect.Effect<void, unknown>): Effect.Effect<void> {
  return pipe(
    Effect.exit(effect),
    Effect.flatMap((exit) =>
      Exit.isFailure(exit)
        ? pipe(Effect.logError(exit.cause), Effect.annotateLogs("weft.region", "loom:flush"))
        : Effect.void,
    ),
  );
}

/** Resolves and clears all outstanding barriers with the current generation. */
function resolveBarriers(state: LoomState): Effect.Effect<void> {
  return Effect.suspend(() => {
    const barriers = state.barriers;
    state.barriers = [];
    return Effect.forEach(barriers, (barrier) => Deferred.succeed(barrier, state.generation), {
      discard: true,
    });
  });
}

/**
 * One flush pass: await the wake signal, rotate it, then drain dirty cells in
 * ascending registration order (outer before inner) until none remain. Cells
 * dirtied mid-pass (e.g. children registered during a parent's commit) drain in
 * the same pass. Ends by bumping the generation (if anything committed) and
 * resolving `awaitCommit` barriers.
 */
function flushPass(state: LoomState): Effect.Effect<void> {
  return Effect.gen(function* () {
    yield* Deferred.await(state.wake);
    state.flushing = true;
    state.wake = Deferred.makeUnsafe<void>(); // rotate BEFORE draining
    let committedAny = false;

    while (state.dirty.size > 0) {
      const batch = [...state.dirty].sort((a, b) => a.seq - b.seq);
      for (const cell of batch) {
        state.dirty.delete(cell);
        if (!cell.alive) {
          continue;
        }
        // Commits dispatch inline on this fiber. An in-flight commit is NOT
        // cancelled when its region scope closes concurrently (unmount,
        // boundary recovery); it completes, and the liveness re-check below
        // then suppresses its hooks and error routing. Accepted semantics:
        // exceptions from writes against torn-down DOM are captured by the
        // exit and suppressed, a dead commit's anchors are detached so it
        // cannot corrupt replacement content, and unmount leaves DOM in place
        // by contract. True cancellation was probed three ways against the
        // current Effect beta (scope-attached fork, fiber-handle interrupt,
        // death-latch race) and each leaves a window or fails to interrupt;
        // recorded as follow-up work in loom.specs.md.
        const exit = yield* Effect.exit(cell.commit(cell.latest));
        if (!cell.alive) {
          // The cell died while its commit was in flight. The region is torn
          // down: never fire hooks or route errors for it. A write that still
          // succeeded counts toward the generation (the DOM did change);
          // anything else is a teardown artifact.
          if (Exit.isSuccess(exit)) {
            committedAny = true;
          }
          continue;
        }
        if (Exit.isSuccess(exit)) {
          committedAny = true;
          if (!cell.committedOnce) {
            cell.committedOnce = true;
            if (cell.onFirstCommit !== undefined) {
              yield* contained(cell.onFirstCommit);
            }
          }
        } else if (!Cause.hasInterruptsOnly(exit.cause)) {
          // Route the failure, kill the cell, fork-interrupt its pump; the
          // flush fiber itself survives and keeps draining (LM16). Routing
          // and hooks are contained: their own defects cannot abort the pass.
          yield* contained(
            Option.isSome(cell.boundary)
              ? cell.boundary.value.reportError(exit.cause)
              : cell.reportUnhandled(exit.cause, cell.label),
          );
          yield* discard(state, cell);
          if (cell.pumpFiber !== undefined) {
            yield* pipe(Fiber.interrupt(cell.pumpFiber), Effect.forkDetach);
          }
        }
      }
    }

    if (committedAny) {
      state.generation++;
    }
    state.flushing = false;
    yield* resolveBarriers(state);
  });
}

/**
 * Allocates a {@link Loom} with an empty registry and no running flush fiber.
 * Pure, synchronous allocation (mirrors the hub allocation in `WeftApp.make`);
 * pair with {@link ensureFlushFiber} at first root setup.
 */
export function makeLoomUnsafe(): Loom {
  const state: LoomState = {
    nextSeq: 0,
    cells: new Map(),
    dirty: new Set(),
    wake: Deferred.makeUnsafe<void>(),
    barriers: [],
    generation: 0,
    flushing: false,
    flushStarted: false,
  };

  const loom: Loom = {
    register: <A>(options: LoomRegisterOptions<A>) =>
      Effect.gen(function* () {
        const cellState: CellState = {
          seq: state.nextSeq++,
          label: options.label,
          latest: undefined,
          everWritten: false,
          committedOnce: false,
          alive: true,
          commit: options.commit as (value: unknown) => Effect.Effect<void, unknown>,
          boundary: options.boundary,
          reportUnhandled: options.reportUnhandled,
          onFirstCommit: options.onFirstCommit,
          onDiscard: options.onDiscard,
          pumpFiber: undefined,
        };
        state.cells.set(cellState.seq, cellState);
        yield* Scope.addFinalizer(options.scope, discard(state, cellState));

        const cell: LoomCell<A> = {
          write: (value) =>
            Effect.suspend(() => {
              if (!cellState.alive) {
                return Effect.void; // doomed late write: harmless (LM20)
              }
              cellState.latest = value;
              cellState.everWritten = true;
              state.dirty.add(cellState);
              return Effect.asVoid(Deferred.succeed(state.wake, undefined));
            }),
          everWritten: () => cellState.everWritten,
          attachPumpFiber: (fiber) => {
            cellState.pumpFiber = fiber;
          },
        };
        return cell;
      }),

    awaitCommit: Effect.suspend((): Effect.Effect<number> => {
      if (state.dirty.size === 0 && !state.flushing) {
        return Effect.succeed(state.generation);
      }
      const barrier = Deferred.makeUnsafe<number>();
      state.barriers.push(barrier);
      return Deferred.await(barrier);
    }),

    commitGeneration: Effect.sync(() => state.generation),
  };

  states.set(loom, state);
  return loom;
}

/**
 * Starts the loom's flush fiber in `appScope` on first call; subsequent calls
 * are no-ops (synchronous check-and-set, safe across concurrent root setups).
 * The fiber drains dirty cells on every wake signal, commits in ascending
 * registration order, and resolves `awaitCommit` barriers per pass. On
 * interrupt (app dispose) it resolves all outstanding barriers.
 */
export function ensureFlushFiber(loom: Loom, appScope: Scope.Scope): Effect.Effect<void> {
  return Effect.suspend(() => {
    const state = stateOf(loom);
    if (state.flushStarted) {
      return Effect.void;
    }
    state.flushStarted = true;
    return pipe(
      flushPass(state),
      // Defensive belt: a defect escaping the pass body is logged and the
      // loop continues. Restore the invariants the aborted pass left broken,
      // else `awaitCommit`'s idle fast path would stay blocked and its
      // outstanding barriers would hang until an unrelated future write.
      Effect.catchCause((cause) =>
        pipe(
          Effect.logError(cause),
          Effect.annotateLogs("weft.region", "loom:flush"),
          Effect.andThen(
            Effect.suspend(() => {
              state.flushing = false;
              return resolveBarriers(state);
            }),
          ),
        ),
      ),
      Effect.forever,
      Effect.onInterrupt(() =>
        // App dispose: no awaitCommit caller may hang (LM10).
        Effect.suspend(() => {
          state.flushing = false;
          return resolveBarriers(state);
        }),
      ),
      Effect.forkIn(appScope),
      Effect.asVoid,
    );
  });
}
