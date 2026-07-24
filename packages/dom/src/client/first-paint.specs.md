# Synchronous First Paint — `first-paint.ts`

> Tracking issue: [#182](https://github.com/stefvw93/weft/issues/182)
> Related specs: [`./loom.specs.md`](./loom.specs.md), [`./list.specs.md`](./list.specs.md),
> [`./suspense.specs.md`](./suspense.specs.md)

## Overview & Purpose

A reactive region (a `List.each`, a reactive child, a reactive prop) places only its
markers during the mount pass and defers its **first** content to the Loom flush fiber.
The Effect scheduler resumes that fiber one **macrotask** later, so the region paints a
frame after its synchronous siblings. This holds even when the source had its value
available all along: a `List.each` over a static 10-item array shows 0 items when `mount`
resolves, still 0 after 200 microtasks, and all 10 only after one `setTimeout(0)`.

This feature makes the first emission paint **inline, during the mount pass**, whenever
the source delivers it synchronously. Later emissions keep going through the Loom exactly
as today, and sources that are genuinely async keep today's behavior unchanged.

## Mechanism: one subscription, an inline capture window

The pump fiber is forked with `{ startImmediately: true }`, which runs it on the caller's
own fiber until its first async boundary. A source whose first element is synchronously
available therefore delivers it **during the `forkIn` call itself**. The pump's callback
routes that first element into a capture slot instead of the Loom cell; the call site then
renders it inline and returns it in the node list.

This is a **single subscription**. There is no probe, no re-subscription, and therefore no
possibility of running a source's side effects twice. It also needs no source-kind
discrimination: any source that can deliver synchronously does, and any source that cannot
simply delivers nothing during the fork, leaving today's behavior byte-for-byte intact.
There is no separate fallback path to write.

Measured against `effect@4.0.0-beta.98`:

| source                               | first element during `forkIn`? |
| ------------------------------------ | ------------------------------ |
| static value / iterable              | yes                            |
| synchronous `Effect`                 | yes                            |
| `SubscriptionRef.changes(ref)`       | yes                            |
| synchronous cold `Stream`            | yes                            |
| async `Effect` / async cold `Stream` | no (unchanged behavior)        |

### The `#179` gate

[#179](https://github.com/stefvw93/weft/issues/179) records that
`forkIn(child, scope, { startImmediately: true })` may fail to interrupt on scope close
**when the `forkIn` itself runs inside another forked fiber**.

**Measured, 2026-07-24, `effect@4.0.0-beta.98`: #179 does not reproduce.** Its own
candidate repro reports `child interrupted by scope close: true` for both
`startImmediately: true` and `false`, and a Weft-shaped variant (an outer forked fiber
forking a `SubscriptionRef` pump into a region scope, then closing only that region scope)
is likewise interrupted cleanly. So the gate below is **defensive, not a fix for an
observed leak**, and #179 itself should be re-verified before any upstream posting.

The gate is kept for two independent reasons: it costs nothing, and it states the feature's
semantics honestly, since inline first paint is a property of the mount pass and updates
remain async by design ([#173](https://github.com/stefvw93/weft/issues/173) owns update
flush policy).

`RenderContext` therefore carries a `syncFirstPaint` flag: **true** during a mount pass,
**false** inside every Loom commit, every hydration path, and every forked continuation
that renders. `startImmediately` is passed only when the flag is set.

Regions are created from three kinds of place, and all three are covered:

1. the mount pass, on the caller's own fiber (flag true, inline paint applies);
2. `reconcileList` / `updateStreamChild` Loom commits, on the flush fiber (`deferred()`);
3. **forked continuations that render**, namely `renderBoundary`'s recovery fiber (it
   renders `props.match(cause)` only once a live failure arrives) and
   `renderServerBoundary`'s rpc swap (it renders `props.render(resource)` only once the
   call resolves). Both go through `forkRendering`, which clears the flag at the fork so
   the invariant lives in one place. `renderSuspenseBoundary`'s swap fiber is exempt: it
   renders its children _before_ forking and the fiber only moves finished nodes.

## Acceptance Criteria

### Capture window (CW)

- [x] **CW1 — synchronous head is captured.** Given a source that delivers its first
      element synchronously, When its pump is forked with the window open, Then the
      element is captured in the slot and is available to the caller **immediately after
      the fork call returns**, without any `yield`.
- [x] **CW2 — head is not written to the cell.** Given CW1, Then the captured element is
      **not** written to the Loom cell, so it is never committed a second time by the
      flush fiber.
- [x] **CW3 — window seals after the fork.** Given the caller seals the window right after
      forking, When the source emits again, Then that emission and every later one go to
      the Loom cell via `write`, exactly as today.
- [x] **CW4 — async source captures nothing.** Given a source with no synchronously
      available first element, When its pump is forked, Then the slot is empty, the caller
      returns markers only, and the first emission is committed by the flush fiber exactly
      as today.
- [x] **CW5 — single subscription.** Given any source, When a region mounts, Then the
      source is subscribed exactly **once**. A source with an observable side effect per
      subscription runs it exactly once, as it does today.
- [x] **CW6 — window is per region.** Given nested regions mounting in one pass, When each
      forks its pump, Then each captures only its own source's head; no slot is shared.

### Inline first paint (FP)

- [x] **FP1 — `renderList` inline items.** Given `List.each` whose source delivers
      `[a, b, c]` synchronously, When the region mounts, Then `renderList` returns
      `[startMarker, ...itemRanges, endMarker]`, already containing each item's
      `list-item-start` marker, nodes, and `list-item-end` marker in MR1 order.
- [x] **FP2 — `handleStreamChild` inline child.** Given a reactive child whose source
      delivers synchronously, When it mounts, Then the first value's rendered node is
      returned between the two stream markers.
- [x] **FP3 — reactive props inline.** Given a reactive `setProperty` / `setAttribute` /
      `setEventHandler` value delivering synchronously, When the element mounts, Then the
      first value is applied before mount resolves (property set, attribute present,
      listener attached).
- [x] **FP4 — painted at mount resolve.** Given a root containing FP1/FP2/FP3 regions
      alongside plain synchronous siblings, When `mount` resolves, Then all of their
      content is already in the DOM, with **no** microtask drain and **no** macrotask wait.
- [x] **FP5 — `SubscriptionRef.changes` qualifies.** Given the idiomatic
      `List.each({ of: SubscriptionRef.changes(rows) })` and
      `h.div([SubscriptionRef.changes(count)])`, When they mount, Then both paint inline.
      This is the headline case and is asserted directly.
- [x] **FP6 — later emissions unchanged.** Given a region that painted inline, When the
      source emits again, Then the emission is written to the cell and committed by the
      flush fiber exactly as today: reconcile semantics, `ListState`, content-scope
      rotation, and conflation are all unchanged.
- [x] **FP7 — empty first snapshot.** Given a source delivering `[]` synchronously, Then
      the region paints inline as "no items" and returns `[startMarker, endMarker]` (MR3
      unchanged).

### Mount-pass gate (MG)

- [x] **MG1 — flag set during mount.** `RenderContext.syncFirstPaint` is `true` for the
      render pass driven by `mount` on the caller's own fiber.
- [x] **MG2 — flag cleared in commits.** Every Loom commit closure re-provides
      `RenderContext` with `syncFirstPaint: false`, so regions created while reconciling a
      list item or rotating a child's content fork **without** `startImmediately`.
- [x] **MG3 — no leaked pumps.** Given a list item added by a later reconcile whose render
      creates a nested reactive region, When that item is removed and its scope closes,
      Then the nested pump fiber is interrupted and receives no further emissions. This is
      the direct guard against #179.
- [x] **MG4 — hydration cleared.** `hydrate` builds its context with
      `syncFirstPaint: false`. Note this is belt-and-braces for `hydrateReactive` /
      `hydrateList` themselves: they never consult the flag, because they build their pumps
      directly and call `forkSupervised` without `startImmediately`, bypassing
      `makeInlineHeadPump` entirely. The flag has teeth only for a region created
      _downstream_ of hydration, i.e. inside a divergence patch or a post-hydration
      `reconcileList`. Either way, server HTML supplies the first paint and the eager
      adoption path is untouched.

### Loom integration (LC)

- [x] **LC1 — `markCommitted`.** `LoomCell` gains a synchronous `markCommitted` effect
      that sets `everWritten` and `committedOnce` and fires `onFirstCommit` in `contained`
      form, exactly as `flushPass` would on a successful first commit.
- [x] **LC2 — no double `onFirstCommit`.** Given a cell marked via LC1, When a later
      emission commits through the flush pass, Then `onFirstCommit` does **not** fire again.
- [x] **LC3 — no `onDiscard` after inline paint.** Given a cell marked via LC1, When its
      scope closes without any flush-pass commit, Then `onDiscard` does **not** fire.
- [x] **LC4 — generation counts flush passes.** Given a region that painted inline, When
      `mount` resolves, Then `commitGeneration` is unchanged and `awaitCommit` resolves
      immediately. Subsequent updates advance the generation exactly as today.
- [x] **LC5 — `reportAndDiscard`.** `LoomCell` gains `reportAndDiscard(cause)`, which routes
      a cause to the cell's boundary (else `reportUnhandled`), unregisters the cell, and
      fork-interrupts its pump, in `contained` form. It is the routing `flushPass` already
      applies to a failed commit, exposed so an inline first paint fails identically.

### Errors (FE)

- [x] **FE1 — inline failure routes to the boundary.** Given a captured first value whose
      render fails (duplicate-key `RenderError`, `UnsupportedNodeTypeError`, a failing item
      render), When it renders inline, Then the cause is routed to the nearest
      `BoundaryContext` exactly as `flushPass` routes it, the cell is discarded, its pump
      fiber is interrupted, and `mount` still **succeeds** with markers in place.
- [x] **FE2 — no boundary.** Given the same failure with no enclosing `BoundaryContext`,
      Then the cause is published via `reportUnhandled` under the region's label, matching
      today's routing.
- [x] **FE3 — partial DOM is cleared.** Given an inline render that mutated the DOM before
      failing, When the failure is routed, Then everything between the region's markers is
      removed, leaving the region as an async failure would leave it.
- [x] **FE4 — source failure during the window.** Given a source that fails synchronously
      before emitting, When its pump is forked, Then the slot is empty and the failure is
      routed by the existing `forkSupervised` supervision, unchanged.

### Async sources are unchanged (AS)

- [x] **AS1 — cold async child.** Given a reactive child over a cold async `Stream`, When
      `mount` resolves, Then its content is absent, and appears only after awaiting.
- [x] **AS2 — cold async list.** Given `List.each` over a cold async source, Then
      `renderList` returns `[startMarker, endMarker]` and the pump + flush path is
      unchanged.
- [x] **AS3 — no new failure mode.** Given the existing suites (`dom.test.ts`,
      `list.*.test.ts`, `loom.test.ts`, `suspense.*.test.ts`, `hydrate.*.test.ts`), When run
      against this change, Then all pass without modification, except where a test asserted
      the _absence_ of content at mount for a now-synchronous source.

### Suspense (HS)

- [x] **HS1 — fallback settles without a tick.** Given a `Boundary.suspense` whose child is
      a synchronously-delivering reactive child, When it mounts, Then `onFirstCommit`
      (`settleOnce`) has already fired at mount resolve and the fallback is gone, with no
      intermediate fallback frame.
- [x] **HS2 — server renderer untouched.** `@weftui/dom/server` is not modified; SSR
      already renders the first emission eagerly.

## Technical Requirements

- `packages/dom/src/client/first-paint.ts` builds the pump effect and its capture slot. It
  takes the change stream and the "later value" sink, and performs **no forking itself**,
  so it imports only `effect` and never `render.ts`: no import cycle, and the slot is
  unit-testable without a DOM.
- `forkSupervised` (`render.ts`) gains an options parameter carrying `startImmediately`.
  Supervision, error routing, and scope attachment are otherwise unchanged.
- `RenderContext` gains `readonly syncFirstPaint: boolean`.
- `LoomCell` gains `markCommitted` and `reportAndDiscard`; `LoomRegisterOptions` is
  unchanged. Both reuse `loom.ts`'s existing private `contained` / `discard` helpers, so
  hook-firing and error-routing semantics stay defined in one place.
- No public `@weftui/dom` API changes. The slot, the flag, and `markCommitted` are internal.

## Dependencies & Integrations

- `Source.changes` — `packages/core/src/source/source.ts`
- `Loom` / `LoomCell` — `packages/dom/src/client/loom.ts`, `packages/dom/src/data.ts`
- `forkSupervised`, `renderList`, `handleStreamChild`, `subscribeToStream` — `render.ts`
- `Effect.forkIn(..., { startImmediately })` semantics — constrained by
  [#179](https://github.com/stefvw93/weft/issues/179); see the gate above.

## Expected Behavior & Edge Cases

- **Nested regions.** A region inline-painted at mount renders its items on the mount
  fiber, so nested regions inside them also qualify and the whole subtree paints
  synchronously. A region created by a later commit does not (MG2).
- **Route changes / SPA navigation.** These render inside a reactive child's commit, so
  they keep today's async first paint. Updates remaining async is the design.
- **Earlier subscription for async sources.** `startImmediately` starts an async source's
  first step during mount rather than a tick later. No emission is observable earlier, but
  subscription-time side effects move earlier within the same mount pass.
- **Interaction with #180 / #181.** Those PRs add mount and append fast paths inside
  `reconcileList`. The inline path calls `reconcileList` against empty state, so it uses
  whichever fast path exists; merging needs only trivial conflict resolution in
  `renderList`.

## Non-goals

- Hydration paths (MG4) and the server renderer (HS2).
- Inline first paint for regions created during a commit (MG2), pending #179 upstream.
- Changing the Loom flush policy for **updates**; that is
  [#173](https://github.com/stefvw93/weft/issues/173).
- Advancing `commitGeneration` for an inline paint (LC4).

## Workflow step applicability

`type-tests: not applicable, every added type is internal (RenderContext, Loom and LoomCell
are absent from the public barrel, which exports only the four error classes) and
makeInlineHeadPump's three parameters are plain pass-through inference from its stream
argument with no constraints, overloads, conditional types, or rejection surface, so the
main typecheck already enforces everything a TSTyche assertion could state.`

Assessed against the final mock surface, not just the original one: the `startImmediately`
redesign replaced a single-parameter probe with `makeInlineHeadPump<A, E, R>`, so the
verdict was re-derived rather than carried over. `A`/`E`/`R` are inferred from `changes`
and reappear unchanged in `pump: Effect<void, E, R>` and `seal(): Option<A>`. A caller who
mistyped `onLater` or forked a pump with unmet requirements fails `vp run check`, which is
where that error belongs.

`e2e: applicable and mandatory, the entire observable claim ("content is in the DOM at
mount resolve") is browser-observable timing that jsdom cannot settle on its own.`

Written as `first-paint.browser.test.ts`, covering FP4/FP5 (static-array list,
`SubscriptionRef` list, stream child, `Effect` child, reactive prop, all against a plain
synchronous sibling), FP6 (later emissions still reconcile), and AS1 as the negative
control.

Two deliberate departures from the usual browser-test conventions, both forced by what
this feature asserts:

- The positive assertions are **not** wrapped in `vi.waitFor`. The claim is about _when_
  the paint happens, and a retrying matcher would keep polling until the deferred path had
  also painted, so the guard would pass with the bug still present. The DOM is snapshotted
  synchronously, with no `await` between `mount` resolving and the read.
- The negative control asserts on `textContent`, not element presence: the host element
  always mounts, and it is the region's _content_ that is deferred.

Verified as a real red→green signal rather than assumed: with `syncFirstPaint` forced to
`false`, the guard fails in Chromium with `expected +0 to be 10`; restored, it passes.

## Amendments

_(2026-07-24, pause rule during `/mock`)_ The original approved spec used a
`Stream.runHead` probe under `Effect.runSyncExitWith`, gated by source kind. Two
measurements retired it: the idiomatic Weft form is `SubscriptionRef.changes(ref)`, a
`Stream`, which that gating excluded; and a probe plus pump re-subscription provably runs a
`Stream.fromEffect(Effect.sync(f))` source twice. The `startImmediately` capture window
replaces it with a single subscription that covers every source kind. Criteria `PB1`-`PB7`
(probe kinds), the one-shot pump skip, and the identity-dedupe criterion are withdrawn;
`CW1`-`CW6` and `MG1`-`MG4` replace them.
