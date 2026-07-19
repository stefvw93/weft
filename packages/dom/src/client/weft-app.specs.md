# WeftApp — dedicated app runtime, multi-root mounting, final error boundary

## Overview & Purpose

Today every `mount`/`hydrate` call creates its own implicit `ManagedRuntime` via
the context-capture trick. Real apps end up in a double-runtime pattern
(`ManagedRuntime.make(RouterLive(...))` outside + the internal one inside), layers
and reactive state cannot be shared across multiple DOM roots, there is no
app-level owner for lifetime, and unhandled errors have no single destination:
event-handler failures are silently swallowed in production and defects are never
observed.

`WeftApp` replaces this model: **one app = one lazy `ManagedRuntime` + one root
`Scope` + one unhandled-error hub; each root (mount/hydrate) = a child scope.**
Shared reactive state across DOM islands falls out of layer memoization
(`Subscribable` threads by reference through the source identity branch in
`packages/core/src/source/source.ts`).

**No backwards compatibility.** `mount`, `mountScoped`, `hydrate`,
`hydrateScoped`, and `MountHandle` are deleted; every caller in the repo migrates
to the `WeftApp` API. Ambient context capture is removed — services come
exclusively from the app layer; `Effect.provide` wrapped around a mount call no
longer feeds components.

### Public API (new file `packages/dom/src/client/weft-app.ts`)

Data-first statics, Effect-returning only, exported as
`export * as WeftApp from "./weft-app"` from the client barrel (mirrors the
`Boundary` namespacing convention in `@weftui/core`):

```ts
export type MountError = UnsupportedNodeTypeError | StreamSubscriptionError | RenderError;
export type HydrateError = MountError | HydrationMismatchError;

export interface UnhandledError {
  readonly cause: Cause.Cause<unknown>;
  readonly region: string; // e.g. "attribute:class" | "child:stream-3" | "event:onClick" | "boundary:outermost"
  readonly root: RootHandle;
}

export interface RootHandle {
  readonly element: HTMLElement;
  unmount(): Effect.Effect<void>; // closes root scope only; idempotent; does NOT touch the runtime
}

export interface WeftApp<in R = never, out E = never> {
  readonly [TypeId]: typeof TypeId;
  readonly runtime: ManagedRuntime.ManagedRuntime<R, E>;
  // + module-private internal state (app scope, hub, subscriber count, disposed flag)
}

export const make: {
  (): WeftApp<never, never>;
  <R, E>(
    layer: Layer.Layer<R, E, never>,
    options?: { readonly memoMap?: Layer.MemoMap },
  ): WeftApp<R, E>;
}; // synchronous; layer builds lazily on first mount/run (ManagedRuntime.make semantics)

export const mount: <R, E>(
  app: WeftApp<R, E>,
  node: Renderable,
  root: HTMLElement,
) => Effect.Effect<RootHandle, E | MountError>; // self-contained: R channel = never

export const hydrate: <A extends Renderable, R, E>(
  app: WeftApp<R, E>,
  node: A,
  root: HTMLElement,
) => [AssertNoServerOnly<CoreNode.Context<A>>] extends [CoreNode.Context<A>]
  ? Effect.Effect<RootHandle, E | HydrateError>
  : ServerOnlyLeak; // preserves the compile-time server-only-leak guard from today's hydrate

export const errors: <R, E>(app: WeftApp<R, E>) => Stream.Stream<UnhandledError>; // subscribing suppresses the default log

export const dispose: <R, E>(app: WeftApp<R, E>) => Effect.Effect<void>; // roots → layers → hub shutdown; idempotent
```

There is deliberately **no `makeScoped`**; an `Effect.acquireRelease(make, dispose)`
recipe lives in the JSDoc instead.

## Acceptance Criteria

### App lifecycle

- [x] **WA1 (lazy make):** `WeftApp.make(layer)` is synchronous and performs no
      layer construction. The layer builds lazily on the first `mount`/`hydrate`
      (or first direct `app.runtime` run), per `ManagedRuntime.make` semantics. A
      layer whose construction has an observable side effect shows that effect
      only after the first mount, never at `make` time.
- [x] **WA2 (mount):** `WeftApp.mount(app, node, root)` returns
      `Effect.Effect<RootHandle, E | MountError>` with `R = never` — runnable via
      bare `Effect.runPromise` with no `Effect.provide`. On success the tree is
      rendered into `root` and the returned handle exposes `element === root`.
      Layer-construction failure (`E`) surfaces on the first mount.
- [x] **WA3 (hydrate):** `WeftApp.hydrate(app, node, root)` behaves as WA2 over
      existing server-rendered DOM, with error channel `E | HydrateError`
      (adds `HydrationMismatchError`), and preserves today's compile-time
      `AssertNoServerOnly` → `ServerOnlyLeak` guard for server-only nodes.
- [x] **WA4 (root isolation):** Two roots mounted from one app run independently:
      after `unmount()` of root A, root B's streams and event handlers keep
      working; A's subscriptions are interrupted.
- [x] **WA5 (idempotent unmount):** `handle.unmount()` closes that root's scope
      only (interrupting its subscriptions and handler-forked work) and does not
      dispose the runtime or affect other roots. Calling it repeatedly is safe;
      teardown side effects fire once. Unmount does not remove the rendered DOM
      nodes from `root` (same contract as the old `unmount`).
- [x] **WA6 (dispose ordering):** `WeftApp.dispose(app)` tears down in order:
      all root scopes close first (sequential fork order), then the runtime's
      layers release (`runtime.disposeEffect`), then the error hub shuts down.
      Observable via an ordered log: root finalizers record before layer
      finalizers.
- [x] **WA7 (idempotent dispose):** Calling `dispose` more than once is safe;
      teardown effects run once.
- [x] **WA8 (mount-after-dispose):** `mount`/`hydrate` on a disposed app **fails
      — it does not hang.** The precise error is whatever the disposed runtime's
      `contextEffect` produces (pinned loosely on purpose; beta-line behavior).
- [x] **WA9 (shared services):** Two roots mounted from one app share layer-built
      service state by reference: a `SubscriptionRef`-backed service updated via
      an event handler in root A is observed reactively in root B (layer
      memoization + `Subscribable` identity threading).

### Unhandled-error hub

- [x] **WA10 (stream-pump failures):** A failure or defect escaping a rendered
      stream subscription with **no enclosing `Boundary`** is published to the
      hub as `{ cause, region, root }` with the existing region string (e.g.
      `"attribute:class"`, `"child:stream-3"`). Interrupt-only causes are not
      published (existing `Cause.hasInterruptsOnly` filter kept).
- [x] **WA11 (boundary outermost escape):** An error that escapes the
      **outermost** `Boundary` recovery (mount and hydrate paths) is published
      with region `"boundary:outermost"`.
- [x] **WA12 (event-handler failures AND defects):** An event-handler effect
      that fails **or dies** publishes `{ cause, region: "event:" + handlerName }`
      to the hub, in production and development alike (the old
      `NODE_ENV`-gated prod swallow is deleted). Interrupt-only causes are not
      published. Each failing dispatch publishes **exactly once** (no
      double-reporting).
- [x] **WA13 (default log fallback):** With zero `errors` subscribers, every
      would-be-published error runs today's `Effect.logError` +
      `Effect.annotateLogs("weft.region", region)` fallback. While at least one
      subscriber exists, the default log is suppressed. When the last subscriber
      unsubscribes, the fallback resumes.
- [x] **WA14 (errors stream):** `WeftApp.errors(app)` returns
      `Stream.Stream<UnhandledError, never, never>`. No replay: subscribers see
      only errors published after subscription. Multiple concurrent subscribers
      each receive every subsequent error.
- [x] **WA15 (nested Boundary untouched):** An error handled by a non-outermost
      `Boundary` (routed through `BoundaryContext.reportError`) is **never**
      published to the hub and produces no default log.

### Scope & context semantics

- [x] **WA16 (handler forked work owned by root):** Scoped work forked from an
      event handler (`Effect.forkScoped`, `acquireRelease`) attaches to that
      root's scope and is interrupted by `handle.unmount()` (carries forward
      mount-scoped AC-S10, now via `Effect.provideService(Scope.Scope, rootScope)`
      on the handler runtime rather than a runtime-baked scope).
- [x] **WA17 (no ambient capture):** Services provided via `Effect.provide`
      around the `mount`/`hydrate` call do **not** reach components, handlers, or
      stream subscriptions; only the app layer's services do. No ambient-scope
      auto-unmount registration occurs (the dom.specs.md AC26/AC27 ambient-scope
      amendment is removed).
- [x] **WA18 (mount-failure cleanup):** When rendering fails inside
      `mount`/`hydrate`, the root scope is closed before the error surfaces; the
      app runtime and other roots are untouched; the root element remains
      mountable afterwards (amends dom.specs.md AC28: cleanup = root scope close
      only).
- [x] **WA19 (hydration mechanics unchanged):** `hydrate` still runs the
      hydration-readiness barrier and stream-id seeding
      (`makeHydrationReady`, `seedStreamIdCounter`) exactly as specified in
      `hydrate-ready.specs.md` and `hydrate.specs.md`; only runtime/scope
      ownership and error routing change.

## Technical Requirements

- **Execution model:** `mount` internally does `yield* app.runtime.contextEffect`
  (lazy layer build; surfaces `E` on first mount) and
  `Effect.provide(renderProgram, appCtx)` — hence `R = never` on the returned
  effect. `RenderContext.runtime` stays typed `ManagedRuntime<never, never>`;
  a single cast at the weft-app.ts boundary is allowed (the website router-test
  casts this replaces get deleted).
- **Scopes:** app scope = `Scope.makeUnsafe("sequential")` created in `make`.
  Each root scope = `Scope.fork(appScope, "sequential")`. `unmount` = close root
  scope (guarded flag). `dispose` = close app scope (children close in fork
  order) → `runtime.disposeEffect` → hub shutdown. The ambient-scope
  auto-finalizer in the old `mount`/`hydrate` is removed.
- **Error hub:** `PubSub.unbounded<UnhandledError>()` allocated in `make` via
  `Effect.runSync` (pure allocation; comment the beta-bump risk — if a future
  beta makes construction effectful, switch to a lazy hub). No replay.
  Module-private `publishUnhandled(app, cause, region, root)`: subscriber count
  0 → run default log then publish; else publish only. Subscriber counting via
  `Stream.unwrap(increment)` + `Stream.ensuring(decrement)` around
  `Stream.fromPubSub`.
- **RenderContext (`packages/dom/src/data.ts`):** add
  `rootScope: Scope.Scope` and
  `reportUnhandled: (cause, region) => Effect.Effect<void>`. Boundary subtree
  spread-copies thread them automatically. Fix stale doc comments ("fresh
  ManagedRuntime per mount").
- **Three hub rewires in `render.ts`:**
  1. `forkSupervised` no-Boundary branch: `Effect.logError` →
     `context.reportUnhandled(exit.cause, errorContext)` (keep the
     interrupts-only filter).
  2. `boundaryRecoveryEffect` outermost escape → `reportUnhandled(cause,
"boundary:outermost")` (parameter-passed; covers hydrate too).
  3. Event handler: replace the prod-swallow `Effect.catch` with `Effect.exit`
     observation (failures **and** defects) → `reportUnhandled(cause,
"event:" + name)` unless interrupts-only, plus
     `Effect.provideService(Scope.Scope, context.rootScope)`. `NODE_ENV`
     special case deleted.
- **render.ts surgery:** delete `mount`, `hydrate`, `MountHandle`; export
  `hydrateNode`, `makeHydrationReady`, `seedStreamIdCounter` for weft-app.ts
  (`renderNode` already exported). Shared module-private `setupRoot(app, root)`
  in weft-app.ts serves both mount and hydrate (removes today's mount/hydrate
  setup duplication).
- **test-utils shim (`packages/dom/src/client/test-utils.ts`, not in barrel):**
  old-shape `mount`/`hydrate` helpers creating a throwaway `WeftApp` per call
  (`unmount` → `dispose`) — stage 1 of the internal test sweep; stage 2 rewrites
  tests on the real API.
- **Deletions:** `mount-scoped.ts`, `mount-scoped.specs.md`,
  `mount-scoped.test.ts`, `mount-scoped.browser.test.ts`,
  `__type-tests__/mount-scoped.tst.ts`.
- **`packages/router`:** no source changes (`RouterLive` is already
  `Layer<..., never, never>`); verify no `MountHandle` imports remain.

## Dependencies & Integrations

- Verified against `effect@4.0.0-beta.98`: `ManagedRuntime.contextEffect`,
  `memoMap`, `scope`, `disposeEffect`, `make(layer, { memoMap? })`;
  `Scope.fork(scope, "sequential")` / `Scope.forkUnsafe` / `Scope.makeUnsafe`
  (parent close closes children in order; child close detaches cleanly — same
  mechanism `renderBoundary` uses); `PubSub.unbounded`, `Stream.fromPubSub`,
  `Stream.unwrap`, `Stream.ensuring`.
- Type-level surface is meaningful — `/type-tests` applies
  (`__type-tests__/weft-app.tst.ts`): R/E inference from layer;
  `make()` → `WeftApp<never, never>`; mount runnable via bare
  `Effect.runPromise`; hydrate adds `HydrationMismatchError`; `ServerOnlyLeak`
  guard (port fixture from `hydrate.tst.ts`); `errors` →
  `Stream<UnhandledError, never, never>`; `app.runtime: ManagedRuntime<R, E>`.
- `/e2e` applies: example browser-test migrations, new
  `examples/shared-state-islands` example (one app, two mounts, cross-island
  state propagation, unmount-A-leaves-B-live, dispose kills both), and the
  mount-scoped browser scenario (scoped layer outlives render, issue #123)
  folded into weft-app browser coverage.

## Expected Behavior & Edge Cases

- Provided-context inheritance must hold for stream pumps forked long after
  mount resolves (covered by WA9).
- Disposed-runtime mount behavior (WA8) is pinned loosely — only "fails, doesn't
  hang" — because it delegates to `contextEffect` post-dispose semantics on the
  Effect beta line.
- Event-handler double-reporting is a known risk: WA12 asserts exactly-once via
  a test logger.
- Future work (recorded, out of scope): typed `Renderable` requirements — a
  `CoreNode.Context<A> extends R` constraint on `mount` so components can
  require app services at compile time.

## e2e

Applicable and done (browser-observable: real event dispatch, scoped-layer
lifetime, cross-island reactivity):

- `weft-app.browser.test.ts` — folds the issue-#123 acceptance scenario from
  the deleted `mount-scoped.browser.test.ts`: an `acquireRelease` service layer
  is acquired once (lazily, at first mount), survives real clicks, releases
  exactly once at `WeftApp.dispose`, and nothing patches post-dispose.
- `examples/shared-state-islands/app.browser.test.ts` — one app, three
  islands: real-click cross-island propagation, unmount-one-leaves-others-live,
  dispose freezes all (WA4/WA9 in a real browser).
- All 13 pre-existing example browser suites + website suites migrated to the
  `WeftApp` API and green (`vp run test:browser`), including
  `examples/effect-atom` ("registry alive across interactions, stops after
  dispose").

## Relationship to existing specs

- **Supersedes `mount-scoped.specs.md`** (file deleted): scoped-mount lifetime
  composition is subsumed by app/root scopes; AC-S10 carries forward as WA16;
  the issue-#123 browser scenario folds into weft-app e2e coverage.
- **`dom.specs.md`:**
  - AC24 **REVERSED** — fresh runtime per mount → one shared app runtime.
  - AC26 amended — unmount closes the root scope only; no runtime dispose.
  - AC27 amended — `MountHandle` → `RootHandle` (adds `element`); idempotency
    kept.
  - AC28 amended — failure cleanup = root scope close only.
  - AC26/AC27 ambient-scope amendment **removed** (WA17).
- **`dom.events.specs.md`:** AC4's prod swallow replaced by hub publish +
  default-log fallback; defects now observed (WA12).
- **`boundary.specs.md`:** outermost escape now routes to the hub (WA11); AC15
  nested propagation untouched (WA15).
- **`hydrate.specs.md` / `hydrate-ready.specs.md`:** hydration mechanics
  unchanged (WA19).
