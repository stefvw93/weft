# Render scheduler: unclamped yields in browsers

> Tracking issue: [#178](https://github.com/stefvw93/weft/issues/178). Follow-up to
> [`./list-mount-fast-path.specs.md`](./list-mount-fast-path.specs.md), which measured
> the cause and left it open.

> Requirements come from the issue and the measurement in
> `list-mount-fast-path.specs.md`. There was no interactive Q&A. Design decisions are
> recorded under Technical Requirements, for review on the PR.

## Overview & Purpose

Mounting 10,000 `List.each` rows was about twice as slow as plain array children.
Keyed bookkeeping was not the cause: most of the mount was idle.

Effect's fiber run loop yields every 2048 operations. It yields through
`setImmediate` where the host has it (Node), and through `setTimeout(0)` otherwise.
Browsers clamp nested `setTimeout(0)` to about 4 ms, so every yield of a long render
pass parks the thread. A 10k-row mount yields about 160 times.

Weft now gives its render fibers a scheduler that yields through a `MessageChannel`
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
- [x] **RS3 (host selection):** `renderSchedulerFor(host)` returns a
      `MixedScheduler` in `"async"` mode, built on the host's `MessageChannel`, when
      the host has `MessageChannel` and no `setImmediate`. It returns `Option.none()`
      (Effect's default) when the host has `setImmediate` or lacks `MessageChannel`.
      The `setImmediate` probe is Effect's own (`"setImmediate" in host`).
- [x] **RS4 (user scheduler wins):** `withRenderScheduler(context)` returns
      `context` unchanged when it already provides `Scheduler.Scheduler`. An app
      layer that provides a `Scheduler` therefore keeps it for rendering.
- [x] **RS5 (render fibers use it):** In a browser, the mount pass, its pumps, and
      the Loom flush fiber run under the render scheduler. A reactive child whose
      source yields 200 times paints with fewer than 100 zero-delay `setTimeout`
      calls (about 200 before this change).
- [x] **RS6 (hydrate too):** `hydrate` renders under the same context as `mount`,
      so hydration and post-hydration commits use the render scheduler. Same
      measure as RS5, through a `Stream` source.
- [x] **RS7 (no behavior change in Node):** Under Node (unit tests, jsdom, SSR
      tooling) with no app-layer `Scheduler`, the render context is unchanged and
      the flush fiber inherits the caller's scheduler.
      Effect's `setImmediate` yield is already unclamped.
- [x] **RS10 (caller scheduler reaches the flush fiber):** On every host, a
      `Scheduler` provided around the first `mount` still drives the flush fiber,
      as before this change.
- [x] **RS8 (scale guard):** `perf-list-mount.browser.test.ts` (FE7) stays green.
      It keeps its ratio bound only: RS5 and RS6 guard yields deterministically.
- [x] **RS9 (no held process):** The channel closes when its queue is empty after
      a task runs, even if the task throws. A task that schedules another keeps the
      channel open, so a long render reuses one channel. An idle port never holds a
      process open, on any host, without relying on `ref`/`unref`.

## Technical Requirements

- **Scope: render fibers only.** The scheduler is added to the context `mount` and
  `hydrate` render under. The Loom flush fiber is forked with it only when that
  context has one (RS7). Effects that the
  app runs through `app.runtime` (event handlers, `runFork` calls) keep the runtime's
  own scheduler. Commit closures re-provide the context captured at their
  subscribe site, so commits pick it up with no change to `render.ts`.
- **One scheduler, one channel at a time.** `withRenderScheduler` resolves one
  scheduler from `globalThis` on first use, and every app shares it. Its channel
  serves every fiber's dispatcher and lives while tasks are queued (RS9). One
  message is posted per task, and tasks run FIFO off a head index, so a long queue
  costs O(1) per task. Read slots are cleared, and a queue that never drains is
  compacted once its consumed prefix passes 1024 slots and half the array. A
  cancelled task drops its closure at once, but its slot stays until its message
  arrives, which keeps queue and messages in step.
- **Detection by capability, not user agent.** `setImmediate` present means Effect's
  default is already fine, so Node never gets the channel. Other hosts without
  `setImmediate` (Deno, some workers) do, which is why RS9 exists.
- **Flush fiber precedence.** Highest first: a `Scheduler` the caller provides
  around the first `mount`/`hydrate` (as before this change), then one from the
  app layer (RS4: commits are rendering), then the render scheduler, then Effect's
  default. The render pass itself never sees ambient services (WA17).
- **No public API.** `scheduler.ts` is internal and absent from the client barrel.

## Dependencies & Integrations (workflow-step applicability)

- `/mock`: not applicable, no new public API surface.
- `type-tests: not applicable, every new symbol is internal and its types are plain
Effect Scheduler types checked by vp run check.`
- `/unit-test`: applies. `scheduler.test.ts` covers RS1-RS4, RS7, and RS9 under
  Node, with a fake channel. The RS7 flush-fiber test fails when the flush fiber is
  always forked with an explicit scheduler.
- `/e2e`: applies. `scheduler.browser.test.ts` covers RS1 and RS2 on the real
  channel, RS5, RS6, RS10, and RS4 through `WeftApp`. RS10 fails without the
  caller-scheduler check. RS5 and RS6 fail against the
  previous wiring (202 zero-delay timeouts each).
- `/document`: applies. `docs/how-to/render-keyed-lists.md`,
  `list-mount-fast-path.specs.md`, and `weft-app.specs.md` (WA17 render context).

## Expected Behavior & Edge Cases

- **Fake timers.** Render yields no longer go through `setTimeout`, so
  `vi.useFakeTimers()` in a browser test cannot stall a mount. `Effect.sleep` still
  uses timers.
- **Fairness.** Yield frequency is unchanged (`MaxOpsBeforeYield`, 2048). Only the
  cost of each yield drops.
- **Handler fibers.** Effects run through `app.runtime` keep Effect's default, so a
  handler that exhausts its 2048-op budget during a long render yields through a
  clamped timer. Handlers rarely do, and browsers prioritize input events.
- **Background tabs.** Browsers throttle timers in hidden tabs, not message tasks.
  A render-context source that loops on `Effect.yieldNow` with no sleep now runs at
  full speed in the background. This is the trade-off React's scheduler makes too.
  Sources that poll should sleep.
- **Several apps.** Every app shares the one scheduler instance. Each fiber still
  gets its own dispatcher.
- **Effect children in `hydrate`.** `hydrate` probes an untagged Effect child with
  `runSyncExit`, which uses its own sync scheduler. Such children never yield to the
  event loop, before or after this change.
- **Caller-provided scheduler.** The render pass and its pumps ignore a scheduler
  provided around the `mount` call, like every other ambient service (WA17). Only
  the flush fiber inherits it (RS10), from the first root's caller, as before this
  change. That includes `Effect.runSync(mount(...))`,
  whose sync scheduler yields through microtasks, as before this change.
