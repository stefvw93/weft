# Host scheduler: unclamped yields in browsers

> Tracking issue: [#178](https://github.com/stefvw93/weft/issues/178). Follow-up to
> [`./list-mount-fast-path.specs.md`](./list-mount-fast-path.specs.md), which measured
> the cause and left it open.

> Requirements come from the issue and the measurement in
> `list-mount-fast-path.specs.md`. The first draft skipped `/spec`'s interactive
> Q&A. Its open design questions were settled on the
> [PR #212 review](https://github.com/stefvw93/weft/pull/212) and are recorded under
> Technical Requirements.

## Overview & Purpose

Mounting 10,000 `List.each` rows was about twice as slow as plain array children.
Keyed bookkeeping was not the cause: most of the mount was idle.

Effect's fiber run loop yields every 2048 operations. It yields through
`setImmediate` where the host has it (Node), and through `setTimeout(0)` otherwise.
Browsers clamp nested `setTimeout(0)` to about 4 ms, so every yield of a long render
pass parks the thread. A 10k-row mount yields about 160 times.

Weft now gives its app runtime a scheduler that yields through a `MessageChannel`
task instead. A message task is still a macrotask, so input and paint can interleave,
but it is not clamped. Medians in headless Chromium for 10,000 rows:

| Variant              | Before   | After   |
| -------------------- | -------- | ------- |
| Plain array children | ~730 ms  | ~65 ms  |
| `List.each`          | ~1210 ms | ~170 ms |

The remaining `List.each` cost is per-item work: a forked scope, two markers, and an
Effect render per row. Merging `renderItem`'s two context provides into one made no
measurable difference, so this change leaves the reconciler alone.

## Acceptance Criteria

- [x] **RS1 (FIFO dispatch):** `makeMessageChannelSetImmediate` runs queued tasks
      once each, in the order they were queued, as separate message tasks.
- [x] **RS2 (cancel):** The function it returns cancels a task that has not run yet.
      Later tasks still run, in order.
- [x] **RS3 (host selection):** `hostSchedulerFor(host)` returns a `MixedScheduler`
      in `"async"` mode. It yields through the host's `setImmediate` and
      `clearImmediate` when the host has both, looked up per call. Otherwise it
      yields through the host's `MessageChannel`. With neither, it returns
      `Option.none()` (Effect's default).
- [x] **RS4 (user scheduler wins):** A `Scheduler` the app layer provides replaces
      the host scheduler for every app fiber.
- [x] **RS5 (render fibers):** In a browser, a reactive child whose source yields
      200 times paints with fewer than 100 zero-delay `setTimeout` calls (about 200
      before this change).
- [x] **RS6 (hydrate too):** The same holds for a `Stream` child under `hydrate`.
- [x] **RS7 (Node unchanged):** Under Node the host scheduler yields through
      `setImmediate`, as Effect's default does. Fake timers that patch `setImmediate`
      still apply.
- [x] **RS8 (scale guard):** `perf-list-mount.browser.test.ts` (FE7) stays green.
      It keeps its ratio bound only: RS5, RS6, RS11, and RS12 guard yields
      deterministically.
- [x] **RS9 (no held process):** On a host without `document`, the channel closes
      when its queue is empty after a task runs, even if the task throws. A task
      that schedules another keeps it open. On a host with `document`, the channel
      stays open and is reused after it drains.
- [x] **RS10 (caller scheduler ignored):** A `Scheduler` provided around `mount` or
      `hydrate` reaches no app fiber, like every other ambient service (WA17). This
      includes the flush fiber, which inherited it before this change.
- [x] **RS11 (handlers):** An event handler that yields 200 times dispatches fewer
      than 100 zero-delay `setTimeout` calls. Handlers run through `app.runtime`,
      as do effects passed to it directly.
- [x] **RS12 (flush fiber):** 50 rounds of `SubscriptionRef.set` and `awaitCommit`
      dispatch fewer than 25 zero-delay `setTimeout` calls.

## Technical Requirements

- **Scope: the app runtime** (settled on review). `WeftApp.make` wraps the app
  layer with `withHostScheduler`, so the runtime context carries the scheduler.
  Render passes, pumps, commit closures, handlers, and direct `app.runtime` runs
  all use it, with no per-fiber wiring. The flush fiber is forked from the
  caller's fiber, so `setupRoot` pins it to the app context's scheduler (RS10).
- **Precedence.** A `Scheduler` in the app layer wins (`Layer.provideMerge` keeps
  the layer's outputs on top). Otherwise the host scheduler applies, then Effect's
  default. Ambient services around `mount` never apply (WA17).
- **`setImmediate` first** (settled on review). Effect probes `setImmediate` at
  module load. Weft probes at the first `WeftApp.make`, so a polyfill loaded in
  between is used rather than missed. Calls look the function up on the host each
  time, as Effect's default does.
- **One scheduler, one channel.** The host scheduler is resolved once from
  `globalThis` and shared by every app. Its channel serves every fiber's dispatcher.
  One message is posted per task, and tasks run FIFO off a head index, so a long
  queue costs O(1) per task. Read slots are cleared, and a queue that never drains
  is compacted once its consumed prefix passes 1024 slots and half the array. A
  cancelled task drops its closure at once, but its slot stays until its message
  arrives, which keeps queue and messages in step.
- **Channel lifetime** (settled on review). A page keeps its channel open, so an
  isolated yield costs no channel setup. Hosts without `document` (Deno, workers)
  close it on drain (RS9).
- **No public API.** `scheduler.ts` is internal and absent from the client barrel.

## Dependencies & Integrations (workflow-step applicability)

- `/mock`: not applicable, no new public API surface.
- `type-tests: not applicable, every new symbol is internal and its types are plain
Effect Scheduler and Layer types checked by vp run check.`
- `/unit-test`: applies. `scheduler.test.ts` covers RS1-RS4, RS7, RS9, and RS10
  under Node, with a fake channel and fake hosts.
- `/e2e`: applies. `scheduler.browser.test.ts` covers RS1 and RS2 on the real
  channel, and RS4-RS6, RS11, and RS12 through `WeftApp`. RS5, RS6, RS11, and RS12
  fail against `main`'s wiring.
- `/document`: applies. `docs/explanation/rendering-model.md`,
  `docs/how-to/render-keyed-lists.md`, `list-mount-fast-path.specs.md`, and
  `weft-app.specs.md` (WA17).

## Expected Behavior & Edge Cases

- **Fake timers.** In a browser, yields no longer go through `setTimeout`, so
  `vi.useFakeTimers()` cannot stall a mount. `Effect.sleep` still uses timers.
- **Fairness.** Yield frequency is unchanged (`MaxOpsBeforeYield`, 2048). Only the
  cost of each yield drops.
- **Busy loops** (accepted on review). A loop on `Effect.yieldNow` with no sleep
  was capped by the 4 ms clamp, at about 250 iterations a second. It now spins a
  core, in a visible tab too. Browsers throttle timers in hidden tabs, not message
  tasks, so it also keeps full speed in the background. React's scheduler makes
  the same trade-off. Sources that poll should sleep.
- **Several apps.** Every app shares the one scheduler instance. Each fiber still
  gets its own dispatcher.
- **Effect children in `hydrate`.** `hydrate` probes an untagged Effect child with
  `runSyncExit`, which uses its own sync scheduler. Such children never yield to the
  event loop, before or after this change.
- **`Effect.runSync(mount(...))`.** The flush fiber used to inherit the sync
  scheduler from such a caller. It now runs on the app's scheduler (RS10).
