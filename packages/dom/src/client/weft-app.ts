import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  PubSub,
  Scope,
  Stream,
  pipe,
} from "effect";
import type {
  AssertNoServerOnly,
  Node as CoreNode,
  Renderable,
  ServerOnlyLeak,
} from "@weftui/core";
import { RenderContext } from "~/data";
import type {
  HydrationMismatchError,
  Loom,
  RenderError,
  StreamSubscriptionError,
  UnsupportedNodeTypeError,
} from "~/data";
import { ensureFlushFiber, makeLoomUnsafe } from "./loom";
import { hydrateNode, makeHydrationReady, renderNode, seedStreamIdCounter } from "./render";

/**
 * Unique brand for {@link WeftApp} values.
 */
export const TypeId: unique symbol = Symbol.for("@weftui/dom/WeftApp");

/**
 * Errors that {@link mount} can fail with (beyond the app layer's own error
 * channel `E`).
 */
export type MountError = UnsupportedNodeTypeError | StreamSubscriptionError | RenderError;

/**
 * Errors that {@link hydrate} can fail with (beyond the app layer's own error
 * channel `E`): everything {@link mount} can fail with, plus
 * {@link HydrationMismatchError} when the server DOM and the node tree diverge.
 */
export type HydrateError = MountError | HydrationMismatchError;

/**
 * An error that escaped every user-level handler and reached the app's
 * unhandled-error hub, published on the {@link errors} stream.
 *
 * Sources (one entry per failing occurrence):
 * - a rendered stream subscription failing or dying with no enclosing
 *   `Boundary` (region e.g. `"attribute:class"`, `"child:stream-3"`),
 * - an error escaping the outermost `Boundary` recovery
 *   (region `"boundary:outermost"`),
 * - an event-handler effect failing **or dying** (region `"event:onClick"`).
 *
 * Interrupt-only causes are never published. Errors handled by a nested
 * `Boundary` never reach the hub.
 */
export interface UnhandledError {
  /** Full cause of the failure (failures and defects alike). */
  readonly cause: Cause.Cause<unknown>;
  /**
   * Where in the render tree the error escaped, e.g. `"attribute:class"`,
   * `"child:stream-3"`, `"event:onClick"`, `"boundary:outermost"`.
   */
  readonly region: string;
  /** Handle of the root the error originated from. */
  readonly root: RootHandle;
}

/**
 * Handle for one mounted (or hydrated) root, returned by {@link mount} /
 * {@link hydrate}.
 *
 * The handle owns the root's lifetime: its forked subscriptions and event
 * handlers stay live until `unmount`. Other roots and the app runtime are
 * unaffected by it.
 */
export interface RootHandle {
  /** The DOM element this root was mounted into. */
  readonly element: HTMLElement;
  /**
   * Closes this root's scope: interrupts its stream subscriptions and any
   * scoped work forked from its event handlers. Does **not** dispose the app
   * runtime, touch other roots, or remove the rendered DOM nodes from
   * {@link element}. Idempotent. Teardown side effects fire once.
   */
  unmount(): Effect.Effect<void>;
  /**
   * Resolves when everything dirty at call time has committed to the DOM or
   * been discarded, with the commit generation. Immediate when idle; resolves
   * (never hangs) across `WeftApp.dispose`. App-scoped: with multiple roots it
   * may also wait on sibling roots' pending commits (documented superset;
   * per-root filtering is follow-up work).
   */
  readonly awaitCommit: Effect.Effect<number>;
  /** Current commit generation: monotonic, app-scoped, +1 per flush pass that committed anything. */
  readonly commitGeneration: Effect.Effect<number>;
}

/**
 * A Weft application: one lazy `ManagedRuntime` (the app layer), one root
 * `Scope`, and one unhandled-error hub. Each {@link mount} / {@link hydrate}
 * call creates a child root scope; layer-built services are shared by
 * reference across all roots (layer memoization), which is what makes
 * cross-island reactive state work.
 *
 * Create with {@link make}; tear down with {@link dispose}.
 *
 * @typeParam R - services provided by the app layer, available to every
 *   component, event handler, and stream subscription in every root
 * @typeParam E - the app layer's construction error channel; surfaces on the
 *   first `mount`/`hydrate` (layer construction is lazy)
 */
export interface WeftApp<in R = never, out E = never> {
  readonly [TypeId]: typeof TypeId;
  /**
   * The app's `ManagedRuntime`, for running app-level effects against the
   * shared layer outside any root, e.g.
   * `app.runtime.runFork(trackPageviews)` or
   * `app.runtime.runPromise(Router.push("/about"))`.
   */
  readonly runtime: ManagedRuntime.ManagedRuntime<R, E>;
}

// ============================================================================
// Internal state
// ============================================================================

/** Module-private per-app state, keyed off the public app object. */
interface AppState {
  readonly appScope: Scope.Closeable;
  readonly hub: PubSub.PubSub<UnhandledError>;
  /** The app's render scheduler; its flush fiber starts at first root setup. */
  readonly loom: Loom;
  subscribers: number;
  disposed: boolean;
}

const states = new WeakMap<WeftApp<any, any>, AppState>();

function stateOf(app: WeftApp<any, any>): AppState {
  const state = states.get(app);
  if (state === undefined) {
    throw new Error("Expected a WeftApp created by WeftApp.make");
  }
  return state;
}

/**
 * Publishes an unhandled error to the app hub. With zero {@link errors}
 * subscribers the default report runs first: `Effect.logError` on the cause,
 * annotated with `weft.region` so the failure is visible and attributable.
 */
function publishUnhandled(state: AppState, error: UnhandledError): Effect.Effect<void> {
  return Effect.gen(function* () {
    if (state.subscribers === 0) {
      yield* pipe(Effect.logError(error.cause), Effect.annotateLogs("weft.region", error.region));
    }
    yield* PubSub.publish(state.hub, error);
  });
}

/**
 * Builds the app context, failing fast on a disposed app. The layer builds
 * lazily here (`ManagedRuntime.contextEffect`), so the app layer's error
 * channel `E` surfaces on the first mount/hydrate.
 */
function contextOf<R, E>(app: WeftApp<R, E>): Effect.Effect<Context.Context<R>, E> {
  return Effect.suspend(() => {
    if (stateOf(app).disposed) {
      return Effect.die(new Error("Cannot mount on a disposed WeftApp"));
    }
    return app.runtime.contextEffect;
  });
}

/**
 * Shared root setup for {@link mount} and {@link hydrate}: forks a root scope
 * off the app scope and builds the {@link RootHandle} plus the per-root
 * `RenderContext`.
 */
function setupRoot<R, E>(app: WeftApp<R, E>, root: HTMLElement) {
  return Effect.gen(function* () {
    const state = stateOf(app);
    const rootScope = yield* Scope.fork(state.appScope, "sequential");
    // Idempotent: forks the app's single flush fiber on the first root only.
    yield* ensureFlushFiber(state.loom, state.appScope);

    let unmounted = false;
    const handle: RootHandle = {
      element: root,
      unmount: () =>
        Effect.suspend(() => {
          if (unmounted) {
            return Effect.void;
          }
          unmounted = true;
          return Scope.close(rootScope, Exit.void);
        }),
      awaitCommit: state.loom.awaitCommit,
      commitGeneration: state.loom.commitGeneration,
    };

    const context: RenderContext["Service"] = {
      // The single app-boundary cast: RenderContext stays typed
      // `ManagedRuntime<never, never>` while the real runtime carries the app's
      // R/E. Render-side consumers only ever `runFork` effects whose
      // requirements the app context satisfies.
      runtime: app.runtime as unknown as ManagedRuntime.ManagedRuntime<never, never>,
      scope: rootScope,
      rootScope,
      loom: state.loom,
      // A mount pass renders on the caller's own fiber, where an
      // immediately-started pump fork is interrupted by scope close as
      // documented. `hydrate` overrides this to false (first-paint.specs.md MG4).
      syncFirstPaint: true,
      streamIdCounter: { current: 0 },
      reportUnhandled: (cause, region) => publishUnhandled(state, { cause, region, root: handle }),
    };

    return { context, handle, rootScope };
  });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Creates a {@link WeftApp} from an app layer.
 *
 * Synchronous and side-effect-free with respect to the layer: the layer builds
 * **lazily** on the first {@link mount} / {@link hydrate} (or the first direct
 * `app.runtime` run), per `ManagedRuntime.make` semantics. Layer construction
 * errors therefore surface on first mount, not here.
 *
 * There is deliberately no `makeScoped`. To bind an app's lifetime to a scope,
 * compose it yourself:
 *
 * ```ts
 * const acquireApp = Effect.acquireRelease(
 * 	Effect.sync(() => WeftApp.make(AppLive)),
 * 	(app) => WeftApp.dispose(app),
 * );
 * ```
 *
 * @param layer - the app layer; its services are the only services components
 *   see (ambient `Effect.provide` context around mount calls is not captured)
 * @param options - optional `memoMap` to share layer memoization across apps
 */
type Make = {
  (): WeftApp<never, never>;
  <R, E>(
    layer: Layer.Layer<R, E, never>,
    options?: { readonly memoMap?: Layer.MemoMap },
  ): WeftApp<R, E>;
};

function makeImpl(
  layer?: Layer.Layer<any, any, never>,
  options?: { readonly memoMap?: Layer.MemoMap },
): WeftApp<any, any> {
  const runtime: ManagedRuntime.ManagedRuntime<any, any> = ManagedRuntime.make(
    (layer ?? Layer.empty) as Layer.Layer<any, any, never>,
    options,
  );
  // Pure allocation on the current beta (no async, no services). If a future
  // beta makes PubSub construction effectful, `runSync` will throw here.
  // Switch to a lazily-created hub in that case (see weft-app.specs.md).
  const hub = Effect.runSync(PubSub.unbounded<UnhandledError>());
  const app: WeftApp<any, any> = { [TypeId]: TypeId, runtime };
  states.set(app, {
    appScope: Scope.makeUnsafe("sequential"),
    hub,
    // Pure allocation (mirrors the hub above); the flush fiber starts lazily
    // at the first root setup, inside the app scope.
    loom: makeLoomUnsafe(),
    subscribers: 0,
    disposed: false,
  });
  return app;
}

// The overloaded surface narrows the loosely-typed implementation; the cast is
// sound because `makeImpl` handles both call shapes.
export const make: Make = makeImpl as unknown as Make;

/**
 * Mounts a node tree into `root` as a new root of `app`.
 *
 * - Clears `root`'s existing children, renders the tree, appends the result.
 * - Completes after initial render; streams keep running in the background,
 *   owned by the root's scope (a child of the app scope).
 * - Self-contained: the returned effect's requirement channel is `never`, so
 *   run it with a bare `Effect.runPromise`. Services come exclusively from the
 *   app layer; `Effect.provide` around this call does not feed components.
 * - The app layer builds lazily here on first mount; its error channel `E`
 *   surfaces at that point.
 * - On render failure the root scope is closed before the error propagates;
 *   the app runtime and other roots are untouched.
 * - Mounting on a disposed app fails (it does not hang).
 *
 * @param app - the owning {@link WeftApp}
 * @param node - node tree to render (built with `h.*`; components are plain
 *   functions that are called, e.g. `App()`)
 * @param root - HTMLElement to mount into
 * @returns Effect yielding a {@link RootHandle} for this root
 *
 * @example
 * ```ts
 * const app = WeftApp.make();
 * const handle = await Effect.runPromise(WeftApp.mount(app, App(), rootEl));
 * // later: await Effect.runPromise(handle.unmount());
 * ```
 */
export const mount = <R, E>(
  app: WeftApp<R, E>,
  node: Renderable,
  root: HTMLElement,
): Effect.Effect<RootHandle, E | MountError> =>
  Effect.gen(function* () {
    const appContext = yield* contextOf(app);
    const { context, handle, rootScope } = yield* setupRoot(app, root);

    // Clear the root's existing children before rendering.
    root.innerHTML = "";

    // `setContext` (not `provide`) makes the app context the COMPLETE
    // environment: services provided ambiently around this mount call never
    // reach components, handlers, or stream pumps (weft-app.specs.md WA17).
    // Render failure cleanup = close the root scope only; the app runtime and
    // other roots are untouched (WA18).
    const result = yield* pipe(
      renderNode(node),
      Effect.setContext(
        pipe(appContext, Context.add(RenderContext, context), Context.add(Scope.Scope, rootScope)),
      ),
      Effect.tapError(() => Scope.close(rootScope, Exit.void)),
    );

    if (result !== null) {
      if (Array.isArray(result)) {
        for (const rendered of result) {
          root.appendChild(rendered);
        }
      } else {
        root.appendChild(result as Node);
      }
    }

    return handle;
  });

/**
 * Continues, on the client, the DOM produced on the server by
 * `renderToStringHydratable`/`renderToStreamHydratable`, as a new root of
 * `app`.
 *
 * Unlike {@link mount}, does **not** clear `root`: it walks the node tree in
 * lockstep with the existing server DOM, adopting nodes in place. Hydration
 * mechanics (readiness barrier, stream-id seeding, marker-based reactive
 * regions) are unchanged from `hydrate.specs.md` / `hydrate-ready.specs.md`;
 * only runtime/scope ownership and error routing follow the app model
 * (see {@link mount}).
 *
 * Hydration is a **client-only** operation: the tree's requirement channel
 * must be free of server-only dependencies. A server-only tag leaking into
 * client code degrades the return type to the {@link ServerOnlyLeak} sentinel
 * (compile error at the call site).
 *
 * @param app - the owning {@link WeftApp}
 * @param node - node tree to hydrate (must match the tree rendered on the server)
 * @param root - HTMLElement whose children were produced by the server renderer
 * @returns Effect yielding a {@link RootHandle} for this root
 */
export function hydrate<A extends Renderable, R = never, E = never>(
  app: WeftApp<R, E>,
  node: A,
  root: HTMLElement,
): [AssertNoServerOnly<CoreNode.Context<A>>] extends [CoreNode.Context<A>]
  ? Effect.Effect<RootHandle, E | HydrateError>
  : ServerOnlyLeak;
export function hydrate<R, E>(
  app: WeftApp<R, E>,
  node: Renderable,
  root: HTMLElement,
): Effect.Effect<RootHandle, E | HydrateError> {
  return Effect.gen(function* () {
    const appContext = yield* contextOf(app);
    const { context, handle, rootScope } = yield* setupRoot(app, root);

    // Interactivity barrier: each forked first-emission region registers before
    // its fork and settles once its first emission has hydrated; `hydrate`
    // awaits the latch before returning the handle (hydrate-ready.specs.md).
    const hydrationReady = yield* makeHydrationReady();
    // MG4: server HTML already supplies the first paint, and the hydrator adopts
    // it eagerly. Probing for an inline head here would only risk a double render.
    const hydrateContext = { ...context, hydrationReady, syncFirstPaint: false };

    // Advance the id counter past every marker already in the server DOM, so
    // ids minted for content inserted after hydration never collide.
    seedStreamIdCounter(root, hydrateContext.streamIdCounter);

    // Adopt the existing server DOM rather than clearing the root. As in
    // `mount`, `setContext` makes the app context the complete environment
    // (WA17), and failure cleanup closes the root scope only (WA18).
    yield* pipe(
      hydrateNode(node, root.firstChild, "root"),
      Effect.setContext(
        pipe(
          appContext,
          Context.add(RenderContext, hydrateContext),
          Context.add(Scope.Scope, rootScope),
        ),
      ),
      Effect.tapError(() => Scope.close(rootScope, Exit.void)),
    );

    // Release the sentinel, then wait for every registered first emission to
    // hydrate (fast path: no reactive regions → resolves immediately).
    yield* hydrationReady.settle;
    yield* hydrationReady.awaitReady;

    return handle;
  });
}

/**
 * The app's unhandled-error stream.
 *
 * While at least one subscriber exists, the default `Effect.logError` fallback
 * is suppressed and every {@link UnhandledError} is delivered to all
 * subscribers. With zero subscribers, each unhandled error runs the default
 * log (annotated with `weft.region`) instead. No replay: a subscriber sees
 * only errors published after it subscribed.
 *
 * @param app - the owning {@link WeftApp}
 */
export const errors = <R, E>(app: WeftApp<R, E>): Stream.Stream<UnhandledError> => {
  const state = stateOf(app);
  return Stream.unwrap(
    Effect.sync(() => {
      state.subscribers++;
      return pipe(
        Stream.fromPubSub(state.hub),
        Stream.ensuring(
          Effect.sync(() => {
            state.subscribers--;
          }),
        ),
      );
    }),
  );
};

/**
 * Disposes the app: closes every root scope (in mount order), then releases
 * the runtime's layers, then shuts the error hub down. Idempotent: teardown
 * effects run once. Subsequent {@link mount} / {@link hydrate} calls fail.
 *
 * @param app - the {@link WeftApp} to dispose
 */
export const dispose = <R, E>(app: WeftApp<R, E>): Effect.Effect<void> =>
  Effect.suspend(() => {
    const state = stateOf(app);
    if (state.disposed) {
      return Effect.void;
    }
    state.disposed = true;
    return pipe(
      Scope.close(state.appScope, Exit.void),
      Effect.andThen(app.runtime.disposeEffect),
      Effect.andThen(PubSub.shutdown(state.hub)),
    );
  });
