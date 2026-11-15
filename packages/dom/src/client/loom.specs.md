# Loom — app-level render scheduler (conflation, commit-ack, centralized supervision)

Spec source: approved plan `~/.claude/plans/quizzical-brewing-thompson.md`
(fixes #167, #168, #169). All requirement decisions were locked there.

## Overview & Purpose

Every reactive subscription in the DOM renderer is an independent
`Stream.runForEach` pump today. Each pump processes every emission and forks two
fibers (`forkSupervised` = pump + `Fiber.await` watcher). Three verified
performance issues share this root cause:

- **#167:** a burst of 200 child-stream emissions renders all 200 stale trees;
  the DOM lags ~2s behind state.
- **#168:** `List.each` reconciles every queued snapshot; `Source.toSubscribable`
  adds an extra Stream→SubscriptionRef pump fiber per list.
- **#169:** 3,000 streamed props = 6,000+ long-lived fibers, per-emission
  per-prop scheduled writes, and a sequential teardown cliff.

**Loom** is one scheduler service per `WeftApp`: N latest-value cells (one per
reactive region or prop) drained by one shared flush fiber. Pumps shrink to
"overwrite cell, wake loom." Conflation is structural: a cell holds only the
newest value. Flush completion is the commit acknowledgement. Supervision is
centralized. All commits become async; nothing relies on `runSync`-driven
synchronous commits anymore.

_(amended by first-paint.specs.md, issue #182)_ "All commits become async" now
means all **flush-pass** commits. A region whose source delivers its first value
synchronously paints that value inline during the mount pass, before `mount`
resolves, and marks its cell committed via `LoomCell.markCommitted` without a
flush pass. Only the **first** emission can do this, and only on a mount pass.
Every later emission still goes through the cell and the flush fiber unchanged,
so conflation, ordering, supervision, and `awaitCommit` are untouched. The commit
generation still counts flush passes only, so an inline first paint does not
advance it.

The name follows the library metaphor: the loom is where all threads meet the
fabric. Individual sources spin as fast as they like; the loom weaves only the
latest state of each thread into the DOM, one pass at a time.

Out of scope (follow-up issues, locked): LIS monotonic-append fast path,
parallel scope teardown, rAF/microtask flush policy, per-root `awaitCommit`.

### Public API

Only the `RootHandle` additions are public. Loom itself is internal
(`packages/dom/src/client/loom.ts`, not exported from `client/index.ts`); its
types live in `packages/dom/src/data.ts` next to `HydrationReady`.

```ts
// packages/dom/src/client/weft-app.ts — RootHandle additions (public)
export interface RootHandle {
  // ...existing members...
  /** Resolves when everything dirty at call time has committed or been
   *  discarded. Returns the commit generation. App-scoped: with multiple
   *  roots it may wait on sibling roots' work (documented superset). */
  readonly awaitCommit: Effect.Effect<number>;
  /** Current commit generation (monotonic, app-scoped). */
  readonly commitGeneration: Effect.Effect<number>;
}

// packages/dom/src/data.ts — internal types
interface LoomRegisterOptions<A> {
  readonly label: string; // "child:stream-3", "attribute:class"
  readonly scope: Scope.Scope; // finalizer unregisters the cell
  readonly commit: (value: A) => Effect.Effect<void, unknown>; // runs ONLY on flush fiber, one at a time
  readonly boundary: Option.Option<BoundaryContext["Service"]>; // captured at subscribe time
  readonly reportUnhandled: RenderContext["Service"]["reportUnhandled"];
  readonly onFirstCommit?: Effect.Effect<void>; // fires once after first successful commit
  readonly onDiscard?: Effect.Effect<void>; // fires if cell dies before first commit
}
interface LoomCell<A> {
  readonly write: (value: A) => Effect.Effect<void>; // overwrite + mark dirty + wake
  readonly everWritten: () => boolean;
  // called once right after the pump is forked; lets a failed commit
  // fork-interrupt its source (LM16)
  readonly attachPumpFiber: (fiber: Fiber.Fiber<unknown, unknown>) => void;
}
interface Loom {
  readonly register: <A>(o: LoomRegisterOptions<A>) => Effect.Effect<LoomCell<A>>;
  readonly awaitCommit: Effect.Effect<number>; // immediate when idle; resolves on dispose
  readonly commitGeneration: Effect.Effect<number>;
}

// packages/dom/src/client/loom.ts — internals
// makeLoomUnsafe(): Loom          (pure allocation, mirrors the hub in weft-app make)
// ensureFlushFiber(loom, appScope) (sync check-and-set fork into the app scope)

// packages/core/src/source/source.ts — public core addition
export const changes: <A, E, R>(source: Source<A, E, R>) => Stream.Stream<A, E, R>;
// Subscribable → subscribable.changes; Stream → identity;
// Effect → Stream.fromEffect; static value → Stream.make(value)
```

`RenderContext` gains a required `readonly loom: Loom` (the server never
imports `RenderContext`; verified).

## Acceptance Criteria

### Conflation (latest-value-wins)

- [x] **LM1 (conflate to last):** With the flush fiber gated (first commit held
      open), N writes to one cell followed by release produce exactly **one**
      commit, with the **last** value. Intermediate values are never committed.
- [x] **LM2 (no added latency):** A single isolated write commits on the next
      wake-drain pass. No timers, no debounce; jsdom-safe.
- [x] **LM3 (burst conflation end-to-end):** A burst of child-stream emissions
      published faster than commits drain yields materially fewer commits than
      emissions, and the final DOM reflects the last emission (perf AC LM25
      pins the bound).

### Ordering & lifecycle

- [x] **LM4 (outer before inner):** Within one flush pass, dirty cells commit
      in ascending registration order (`seq`). A child cell registered during
      its parent's commit always has `child.seq > parent.seq`; seqs are never
      reused.
- [x] **LM5 (stale children skipped):** When a parent re-emission closes the
      previous content scope inside its commit, the old children's finalizers
      run (`alive = false`) before the pass reaches them; the pass skips them.
      No commit ever runs for a cell whose scope is closed.
- [x] **LM6 (scope-driven unregistration):** Closing `options.scope`
      unregisters the cell (via `Scope.addFinalizer`). A dirty-but-dead cell is
      skipped, not committed.

### Commit-ack & generation

- [x] **LM7 (idle immediate):** `awaitCommit` while nothing is dirty resolves
      immediately with the current generation.
- [x] **LM8 (pending barrier):** `awaitCommit` while cells are dirty resolves
      only after everything dirty at call time has committed or been discarded,
      and returns the new generation.
- [x] **LM9 (monotonic generation):** `commitGeneration` is monotonic and
      increments exactly once per flush pass that committed anything.
- [x] **LM10 (dispose resolves barriers):** `WeftApp.dispose` (flush-fiber
      interrupt) resolves all outstanding `awaitCommit` barriers; no caller
      hangs across dispose.
- [x] **LM11 (RootHandle surface):** `RootHandle.awaitCommit` and
      `RootHandle.commitGeneration` expose the app's Loom ack. After
      `set → awaitCommit`, the DOM and handlers reflect the latest value with
      no `waitFor` polling. App-scoped semantics are documented as a superset
      (may over-wait with multiple roots).

### Ack-or-exit settle (hydration & suspense)

All three routes are idempotent via the existing `makeSettleOnce`
(render.ts:2029):

- [x] **LM12 (settle on real commit):** Hydration readiness settles on the
      first **successful commit** (`onFirstCommit`), not on the first stream
      value received. `hydrate` no longer returns before the DOM is real.
- [x] **LM13 (settle on discard):** A cell that dies before its first commit
      settles via `onDiscard` (parent re-render, boundary recovery, unmount,
      commit failure). `awaitReady` never hangs on a discarded region.
- [x] **LM14 (settle on silent exit):** A stream that ends or fails without
      ever writing settles via the pump's
      `Effect.ensuring(everWritten ? void : settleOnce)`. Empty, errored, and
      interrupted streams never hang hydration.
- [x] **LM15 (suspense settles on commit):** `renderComponent` passes
      `{ onFirstCommit: suspenseCtx.settle }`; the `Stream.zipWithIndex`
      settle wrapper is deleted. **Behavior change to spec:** an empty stream
      under suspense now settles (fallback resolves) instead of hanging the
      fallback forever.

### Error routing & supervision

- [x] **LM16 (commit failure routed, flush survives):** A commit that fails
      routes its cause to the cell's captured `boundary` when `Some`, else to
      `reportUnhandled(label)`. The cell is unregistered (firing `onDiscard` if
      it never committed) and its pump fiber is fork-interrupted. The flush
      fiber survives and keeps committing other cells.
- [x] **LM17 (single-fiber supervision):** `forkSupervised` forks **one**
      fiber; the pump self-reports via `Effect.onExit` (non-interrupt failure →
      captured boundary else `reportUnhandled`). No watcher fiber. All existing
      call-site signatures unchanged.
- [x] **LM18 (interrupt tightening):** The with-boundary branch now filters
      teardown causes (it did not before). Unmounting a boundary-enclosed
      region does **not** trigger recovery. Mixed causes (fail + interrupt)
      still route to the boundary. A cause is teardown noise when every reason
      is an interrupt **or** the internal `Cause.Done` producer-shutdown
      signal (a pump can surface `Done` when its source queue closes
      mid-teardown; discovered during implement, previously suppressed only by
      the watcher-fiber race).
- [x] **LM19 (defensive flush loop):** Lifecycle hooks (`onFirstCommit`,
      `onDiscard`) and error routing (`boundary.reportError`,
      `reportUnhandled`) are contained per cell: their own failure or defect
      is logged and never unwinds the pass. A defect that still escapes the
      pass body is caught by an outer `Effect.catchCause` that logs, restores
      the flushing flag, resolves outstanding barriers, and continues the
      loop. On interrupt, outstanding barriers resolve (see LM10).
- [x] **LM20 (doomed late write harmless):** A pump that writes once more into
      a cell killed by commit failure is harmless: the dead cell is skipped
      (`alive === false`).

### Pump routing coverage

- [x] **LM21 (all pumps through Loom):** `handleStreamChild`, `hydrateReactive`,
      `renderList`, `hydrateList`, and `subscribeToStream` all register cells
      and route writes through the Loom. `subscribeToStream` covers
      `setProperty`, `setAttribute`, `handleStyle`, `setStyleFromObject`, and
      `setEventHandler` with zero call-site edits. One-shot forks stay direct:
      boundary recovery, suspense swap, `Boundary.rpc`, event-dispatch
      `runFork`.
- [x] **LM22 (existing suites unchanged):** All existing unit, type, and
      browser suites pass without modification (they are fully async already;
      the wake-drain adds at most one tick).

### Source.changes (core)

- [x] **LM23 (variant mapping):** `Source.changes` returns
      `Subscribable.changes` for subscribables, the stream itself for streams,
      `Stream.fromEffect` for effects, and `Stream.make(value)` for static
      values. Channel inference: `Source<A, E, R> → Stream<A, E, R>`.
- [x] **LM24 (lists drop the hop):** `renderList` and `hydrateList` consume
      `Source.changes(of)` directly. The SubscriptionRef + latch + pump hop is
      gone. `toSubscribable` is untouched (server rendering and the
      `get`/`NoPropValue` contract preserved). `reconcileList` still sees
      strictly sequential snapshots (single pump writes, single flush fiber
      commits).

### Performance (permanent browser tests)

Structural assertions primary; generous timing caps. Bursts published via
`Effect.runPromise(Effect.forEach(...))`, never `runSync`. No failing REPORT
assertions.

- [x] **LM25 (stream backlog, #167):** Depth-320 tree, 200 publishes: final
      generation reaches 200 (`vi.waitFor`); MutationObserver sees ≤ 50
      distinct commits (baseline: 200); drain < 5s.
      (`perf-stream-backlog.browser.test.ts`)
- [x] **LM26 (list backlog, #168):** 5k rows + 200 appends: final `li` count
      5,200; `commitGeneration` delta ≤ 50 (baseline: 200 reconciles);
      drain < 10s. (`perf-list-backlog.browser.test.ts`)
- [x] **LM27 (reactive props, #169):** 3,000 tiles × 64 bumps: all tiles reach
      `.generation-64`; attribute mutations ≤ 3,000×16 (baseline: ×64);
      update < 15s; unmount < 30s (cliff cap only).
      (`perf-reactive-props.browser.test.ts`)

## Technical Requirements

- **Cell record (internal):** `{ seq, label, latest, dirty, alive, everWritten,
committedOnce, commit, boundary, reportUnhandled, onFirstCommit, onDiscard,
pumpFiber }`. RenderContext snapshot and content-scope rotation are **not**
  cell fields; they live lexically in the `commit` closure (today's
  `runForEach` body verbatim).
- **Registry:** insertion-ordered `Map<number, CellState>`, `dirty: Set`,
  rotated `Deferred<void>` wake latch, `barriers: Deferred<number>[]`,
  `generation`, `flushing`.
- **Flush loop** (continuous wake-signal drain; no timers):

  ```
  forever:
    await wake; wake = fresh Deferred          // rotate BEFORE draining
    while dirty nonempty:
      for cell of [...dirty].sort(by seq):     // ascending seq = outer before inner
        dirty.delete(cell); if !cell.alive continue
        exit = Effect.exit(cell.commit(cell.latest))
        success → committedAny; first success → onFirstCommit (once)
        non-interrupt failure → route to cell.boundary ?? reportUnhandled(label);
          unregister cell (fires onDiscard if never committed); fork-interrupt cell.pumpFiber
    if committedAny: generation++
    resolve all barriers with generation
  ```

  Hook and routing effects run contained (failure/defect logged, pass
  continues). Loop body wrapped in defensive `Effect.catchCause` → log,
  reset flushing, resolve barriers, continue; `onInterrupt` resolves
  outstanding barriers. After each commit the cell's liveness is re-checked:
  a cell that died mid-commit (unmount racing the flush) fires no hooks and
  routes no errors; a successful write still counts toward the generation.

- **Wiring (`weft-app.ts`):** `AppState` gains `loom` (the flush-started
  check-and-set lives in the loom's module-private state; `ensureFlushFiber`
  is idempotent); `makeImpl`
  allocates via `makeLoomUnsafe()` (pure, mirrors the hub allocation);
  `setupRoot` does a sync check-and-set fork of the flush fiber into
  `state.appScope` and adds `loom` to the render context.
- **`render.ts` surgery:**
  - `forkSupervised` (:345) → single-fiber `onExit` form.
  - `subscribeToStream` (:388) → register cell
    (`commit: v => Effect.sync(() => void onValue(v))`), pump =
    `runForEach(stream, cell.write)`, store `cell.pumpFiber`.
  - `handleStreamChild` (:1164) → cell whose commit closure is today's
    per-emission body including content-scope rotation; gains optional
    `{ onFirstCommit }`.
  - `renderComponent` (:1119) → delete the suspense `zipWithIndex` wrapper;
    pass `{ onFirstCommit: suspenseCtx.settle }`.
  - `renderList` (:1533) → `Source.changes(of)` replaces
    `toSubscribable`+`changes` (drops the cast); reconcile body becomes the
    cell commit.
  - `hydrateReactive` (:2044) / `hydrateList` (:2672) → same treatment; inline
    `settleOnce` moves to `onFirstCommit`/`onDiscard`/pump-ensuring;
    `hydrationReady.register` stays pre-fork.
- **Docs style note:** conflation is documented as latest-value-wins;
  intermediate states are observably skipped (no existing test asserts every
  value; audited).

## Dependencies & Integrations

- Type-level surface is meaningful — `/type-tests` applies
  (`__type-tests__/loom.tst.ts`): `register` generic inference, `commit` error
  channel accepts `unknown`, `awaitCommit: Effect<number>`; amend
  `weft-app.tst.ts` for the `RootHandle` additions; `Source.changes` channel
  inference in core (`Source<A, E, R> → Stream<A, E, R>` across all four
  variants).
- `/e2e` applies: the three permanent perf tests (LM25–LM27) plus a
  `weft-app.browser.test.ts` `awaitCommit` case (set → awaitCommit → assert
  DOM, no `waitFor`).

## Expected Behavior & Edge Cases

- Conflation is observable: intermediate states are skipped by design
  (latest-value-wins). No existing test asserts every intermediate value.
- `awaitCommit` is quiescence-scoped: it covers what is dirty at call time,
  not future first values of descendant pumps registered later. Documented;
  per-root filtering is follow-up.
- Fixed 100/150ms windows in existing unit tests absorb the ≤1-tick wake-drain
  delay. Fallback if flaky: migrate helpers to `awaitCommit`.
- A doomed pump may write once into a dead cell after commit failure; harmless
  (LM20).
- An in-flight commit is NOT cancelled when its region scope closes
  concurrently (unmount, boundary recovery): it completes on the flush
  fiber, and the post-commit liveness re-check suppresses its hooks and
  error routing. Accepted semantics: exceptions from writes against
  torn-down DOM are captured by the per-commit exit and suppressed; a dead
  commit's anchors are detached, so it cannot corrupt replacement content;
  unmount leaves rendered DOM in place by contract; settle latches are
  idempotent. Parent content-scope rotation cannot race a child commit at
  all: rotations run inside parent commits, sequentially on the flush fiber.
  True cancellation was probed three ways against effect 4.0.0-beta.98
  (scope-attached fork with `startImmediately`, fiber-handle interrupt from
  the discard finalizer, death-latch `raceFirst`): each either fails to
  interrupt or leaves a handoff window. Recorded as follow-up work
  (revisit alongside the rAF flush policy).

## Open Questions

- The 4 intentional `runSyncExit` sync probes (render.ts:873, :1880;
  render-to-stream.ts:500, :644) **stay** in this feature. They are the only
  true runSync-inside-Effect instances (audit complete). Whether a fully-async
  render can remove them is a recorded follow-up question, not part of this
  work.

## Relationship to existing specs (amendments due in /document)

- **`hydrate-ready.specs.md`** (:120): settle semantics change from
  first-value to ack-or-exit (LM12–LM14).
- **`suspense.specs.md`:** empty stream under suspense now settles instead of
  hanging the fallback (LM15).
- **`dom.specs.md`:** commits are scheduled by the Loom; latest-value-wins
  conflation note.
- **`list.specs.md`:** lists consume `Source.changes` directly; snapshot
  bursts conflate (LM24).
- **`boundary.specs.md`:** interrupt-only causes no longer reach boundary
  recovery (LM18).
- **`weft-app.specs.md`:** `RootHandle` gains `awaitCommit`/`commitGeneration`
  (LM11); flush fiber lives in the app scope; dispose resolves barriers
  (LM10).
