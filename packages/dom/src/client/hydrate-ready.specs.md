# hydrate interactivity barrier ("hydrate-ready") — Specification

> Status: **IMPLEMENTED** (2026-06-07). Latch threaded via `RenderContext.hydrationReady`
> (the `HydrationReady` type in `data.ts`, built by `makeHydrationReady`); instrumented at
> `hydrateReactive` / `hydrateList`; awaited in `hydrate` between the adopt-walk and
> handle return. Covered by `hydrate-ready.test.ts` (AC-R1..R9). `mount` symmetry was
> prototyped on the same latch and **rejected as unsound** — see the `mount` symmetry
> section. Captures the fix for the forked-fiber hydration-timing gap discovered while
> writing `examples/router-ssr/src/refetch.browser.test.ts` (Stage 7 of the
> `Boundary.rpc` refetch feature).

## Overview

`hydrate` (`render.ts:1818`) adopts the server DOM, attaches event handlers and
reactive subscriptions in place, and resolves to a handle (now `RootHandle`,
see weft-app.specs.md). Today the
returned promise resolving does **not** mean the page is fully interactive:
reactive regions are hydrated in **forked fibers**, so their event listeners (and
nested regions) finish attaching _after_ `hydrate` returns.

The two forked spots reached during a hydrate walk:

- **Reactive region** (`hydrateReactive`): the first (server-rendered) emission is
  hydrated inside `Stream.runForEach`, forked via `Effect.forkIn(effect,
context.scope)` — `render.ts:2080`. `hydrate` does **not** await that fiber.
- **Keyed list** (`hydrateList`): the first emission is materialized by
  `hydrateFirstListEmission` inside the same forked `runForEach` —
  `render.ts:2512`. Again not awaited.

The router **outlet** is a reactive region (`outlet.ts:80` → a `Stream` child), so
_every_ SSR-hydrated router page's interactive content lives behind one of these
forks. Concretely: a `button.click()` / `dispatchEvent` issued immediately after
`await hydrate(...)` is **silently lost** — the listener is not attached yet. The
gap is normally sub-millisecond (the first-emission work is synchronous: decode →
build → attach), but:

1. It makes the returned handle a misleading "done" signal — `await hydrate(...);
el.click()` races. (This is exactly what forced the Stage-7 test to re-dispatch
   the click inside `vi.waitFor`.)
2. The gap grows with nesting depth and with any genuinely-async first emission.
3. It surprises both test authors and app authors who sequence post-hydrate code.

## Goal / contract

> **When `hydrate(app, root)` resolves, every initial reactive region's first
> emission has been hydrated and its event listeners are attached.** The page is
> interactive at the moment the promise settles.

"Initial" = the regions reachable in the first adopt-walk, transitively (a first
emission may itself contain reactive regions; those count too). It explicitly does
**not** include later emissions, ongoing stream activity, or network work.

## Design

### A readiness latch threaded through `RenderContext`

Reuse the mechanism the Suspense boundary already uses (`render.ts:548-559`): a
countdown `Ref<number>` plus a `Deferred<void>` that completes when the count
returns to zero, guarded by a sentinel so a fast child cannot settle the latch
early.

- Add an optional `hydrationReady` field to `RenderContext` (or a dedicated
  `HydrationReady` service provided only for the duration of a `hydrate` call):
  `{ register: Effect<void>; settle: Effect<void>; await: Effect<void> }`, backed
  by `Ref<number>` + `Deferred<void>` exactly like `suspenseService`.
- `hydrate` seeds the latch at **1** (sentinel) before the adopt-walk, runs the
  walk, releases the sentinel (`settle`), then `await`s the latch **before**
  constructing/returning the handle (now in `weft-app.ts` `hydrate`). Fast path: if
  the count is already 0 after the sentinel release, `await` returns immediately
  (no extra tick), preserving today's behaviour for fully-static pages.
- Each forked first-emission region **`register`s before `Effect.forkIn`** and
  **`settle`s once its first-emission hydration completes** — for
  `hydrateReactive` (`render.ts:2080`) and `hydrateList` (`render.ts:2512`).
  "Completes" means the first `runForEach` iteration's
  `hydrateFirstEmission` / `hydrateFirstListEmission` has returned, whether it
  matched cleanly, took the recoverable-divergence patch path
  (`render.ts:2113-2119`), or failed (settle in `ensuring`/`onExit` so an errored
  first emission never hangs the latch — the error still routes to its boundary as
  today).
- Nested regions hydrated **inside** a first emission register on the **same**
  latch (it is threaded via `RenderContext`/the provided service), so the barrier
  is the transitive closure of initial regions, not just the top level.

### Bounded: first emission only, never the stream lifetime

The latch settles after the **first** `runForEach` iteration, not on stream
completion. An infinite/long-lived reactive region (the common case — outlets,
`SubscriptionRef.changes`) settles as soon as its first value is hydrated; the
subscription keeps running in the background. This is what makes the barrier safe:
it can never wait on an unbounded stream.

### Empty-stream guard

If a region's stream **completes with zero emissions**, `register` would otherwise
never be matched by a `settle`. The fork must therefore also `settle` on stream
completion (the `runForEach` effect's exit), so a region that emits nothing still
releases its latch slot. Equivalent guard for an interrupted/failed subscription
fiber.

### Async first emission is awaited (and that is correct)

If a first emission is genuinely async (a component whose body suspends on an
async effect), `hydrate` now waits for it. This matches the server, which awaited
the same work to produce the markup, so the wait is bounded by what SSR already
paid. (Suspense-during-hydrate is transparent: the SSR patch already resolved the
boundary and the children are inline — `render.ts:~1949` dispatches
`hydrateChildren` — so a hydrated Suspense adds no fork of its own; only its
nested reactive regions register, as above.)

## Acceptance criteria

- **AC-R1 (interactive on resolve):** after `await hydrate(app, root)`, a click
  dispatched on a button rendered inside a reactive region (incl. a router outlet)
  fires its handler on the **first** dispatch — no lost first click. Repro: the
  Stage-7 scenario without the `vi.waitFor` re-dispatch workaround.
- **AC-R2 (no flash / identity preserved):** the barrier does not change adopt-walk
  output — for a clean hydrate nothing is mutated and node identity is preserved
  (existing AC in `hydrate.specs.md` still holds).
- **AC-R3 (fast path):** a fully static page (no reactive regions) resolves without
  an added scheduler tick relative to today (latch already 0 after sentinel).
- **AC-R4 (transitive):** a reactive region whose first emission contains a nested
  reactive region with an event handler — the nested handler is also attached when
  `hydrate` resolves.
- **AC-R5 (list regions):** AC-R1 holds for a `List.each` keyed region (first
  emission via `hydrateFirstListEmission`).
- **AC-R6 (no deadlock — infinite stream):** hydrating a page with a never-completing
  reactive region (e.g. `SubscriptionRef.changes`) resolves promptly after the
  first emission; it does **not** wait for stream completion.
- **AC-R7 (no deadlock — empty stream):** hydrating a region whose stream emits
  nothing and completes still resolves.

_(amended by loom.specs.md LM12–LM14)_ Settle semantics are now **ack-or-exit**
via the app's Loom scheduler: a region settles on its first **committed** DOM
state (`onFirstCommit`), when its cell is discarded before one (`onDiscard`,
e.g. an outer re-emission replacing it), or when its pump exits without ever
writing (empty or failed stream). All AC-R1..R7 behaviors hold unchanged; the
barrier now additionally guarantees the first emissions are real DOM, not
merely received values.

- **AC-R8 (errored first emission):** if a first emission fails, `hydrate` still
  resolves (or rejects via the existing error contract — to be decided in
  implementation) and never hangs; the failure routes to its boundary exactly as
  today.
- **AC-R9 (recoverable divergence):** if a first emission diverges and takes the
  patch fallback (`render.ts:2113`), the latch still settles for that region.

## Edge cases & open questions

- **Error propagation contract:** does an errored initial first emission make
  `hydrate` **reject**, or resolve with the error already routed to a boundary?
  Current hydrate surfaces `HydrationMismatchError` etc. as recoverable (logged).
  Decide: keep recoverable + always-resolve, or surface fatal first-emission
  errors through the returned effect. (Lean: keep current recoverable semantics;
  the latch only governs _timing_, not which errors are fatal.)
- **Timeout / escape hatch:** none proposed — the barrier is structurally bounded
  (first emission only). If a future async first emission is pathologically slow,
  that is a server-render problem too. Revisit only if real cases appear.

## Non-goals

- Not awaiting subsequent emissions, ongoing streams, or any network/data work
  (that is `Boundary.suspend`'s job, not hydrate's).
- Not changing flash-free adoption or which errors are fatal.
- Not introducing a user-visible loading state.

## `mount` symmetry — investigated and REJECTED (2026-06-07)

`mount` (`api.ts` / `render.ts:1694`) has the **same** forked first-render pattern
(`handleStreamChild`, `renderList`), so a blanket `mount` interactivity barrier was
prototyped on the shared `HydrationReady`. **It is unsound and was reverted.**

The asymmetry the latch can't bridge: a `mount` region's first emission may be
genuinely **event-/data-driven** and arrive _after_ `mount` resolves (websocket,
user action, a controlled `Deferred`). Awaiting it deadlocks. Concrete repro from
the existing suite: `boundary.test.ts > AC19 "boundary markers survive after
post-mount stream failure swap"` mounts `Stream.fromEffect(Deferred.await(signal))`
and only fails `signal` **after** `await mount(...)` — the barrier waits for a first
emission that the caller is waiting on `mount` to trigger ⇒ deadlock (5s timeout).
There is no static way to tell "synchronous first emission not yet flushed" from
"first emission gated on a post-mount event," so the barrier can't be scoped safely.

Why hydrate is different (and stays barriered): every hydrated region's first
emission **already exists** (the server rendered it) and is re-derived imminently,
so the wait is bounded by work SSR already paid. And hydrate's leak is _insidious_
— the server-rendered button is in the DOM but its listener isn't wired yet (silent
lost click). Mount's "leak" is benign by comparison: at resolve the reactive content
isn't in the DOM at all (`querySelector` returns `null`), so callers already must
wait — no "looks ready but isn't wired" trap.

If a fast "shell mounted" + separate "interactive" signal is ever wanted for mount,
use the rejected `handle.ready` opt-in below rather than blocking `mount` itself.

## Rejected alternative

- **`handle.ready` opt-in** (`hydrate` resolves fast; users `await handle.ready`
  for interactivity): keeps the leaky default and pushes the footgun onto every
  caller. Rejected as the default; could still be added later for callers who want
  the fast "shell adopted" signal separately from "interactive".

## Reuse (don't reinvent)

- Suspense readiness latch — `render.ts:548-559` (`pendingRef` + `allSettled` +
  sentinel + `settle`). Generalized into `makeHydrationReady` (the `HydrationReady` type in
  `data.ts`), threaded via `RenderContext.hydrationReady`.
- Forked first-emission spots to instrument — `hydrateReactive` `render.ts:2080`,
  `hydrateList` `render.ts:2512`.
- `hydrate` entry / handle construction — `render.ts:1818-1872` (await the latch
  between the adopt-walk at `:1852` and the handle return at `:1860`).

## Test plan (TDD: spec → mock → test → implement)

- jsdom unit (mirror `server-boundary-hydrate.test.ts`): a region with a delayed
  first emission — assert the `hydrate` effect does not complete until the listener
  is attached (AC-R1); a click in the first turn after resolve fires (AC-R1);
  nested-region handler attached (AC-R4); list region (AC-R5); infinite stream
  resolves (AC-R6); empty stream resolves (AC-R7); errored first emission resolves
  (AC-R8).
- Browser e2e: drop the `vi.waitFor` re-dispatch workaround in
  `examples/router-ssr/src/refetch.browser.test.ts` and assert a single
  post-hydrate `dispatchEvent` patches the region (the original intent).
- Regression: full `hydrate.specs.md` / `list.specs.md` / `suspense.specs.md`
  suites stay green (AC-R2/R3).
