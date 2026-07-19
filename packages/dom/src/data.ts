import { Cause, Context, Data, Effect, ManagedRuntime, Scope } from "effect";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when Renderable has invalid type (not string, FRAGMENT, or function)
 */
export class UnsupportedNodeTypeError extends Data.TaggedError("UnsupportedNodeTypeError")<{
  readonly type: unknown;
  readonly message: string;
}> {}
/**
 * Error thrown when stream subscription or execution fails
 */

export class StreamSubscriptionError extends Data.TaggedError("StreamSubscriptionError")<{
  readonly cause: unknown;
  readonly context: string;
}> {}
/**
 * Error thrown for general rendering failures
 */

export class RenderError extends Data.TaggedError("RenderError")<{
  readonly cause: unknown;
  readonly message: string;
}> {}
/**
 * Error thrown when the existing DOM does not match the JSX tree during
 * hydration (e.g. expected a text node but found an element, mismatched tag
 * name, or a missing reactive-region marker).
 */

export class HydrationMismatchError extends Data.TaggedError("HydrationMismatchError")<{
  readonly expected: string;
  readonly actual: string;
  readonly path: string;
}> {}

/**
 * Optional service provided by a `Boundary.*` descriptor to its subtree.
 *
 * Stream fibers running inside the boundary call `reportError` when they fail.
 * Inner boundaries shadow the outer service via `Effect.provideService`, so
 * errors are always reported to the innermost enclosing boundary.
 */
export class BoundaryContext extends Context.Service<
  BoundaryContext,
  {
    /** Report a rendering-path error to this boundary. */
    readonly reportError: (cause: Cause.Cause<unknown>) => Effect.Effect<void>;
  }
>()("BoundaryContext") {}

/**
 * Optional service provided by a suspense boundary (`Boundary.suspend`) to its
 * subtree.
 *
 * Function components returning `Effect`/`Stream` call `register` before their
 * stream is subscribed and `settle` exactly once when the stream emits its first
 * value. The boundary waits until all registered children have settled before
 * swapping the fallback for the resolved content.
 *
 * Inner suspense boundaries shadow the outer service for their own subtree
 * via `Effect.provideService`, so children register with the innermost boundary.
 */
export class SuspenseContext extends Context.Service<
  SuspenseContext,
  {
    /** Increment the boundary's pending count. */
    readonly register: Effect.Effect<void>;
    /** Decrement the pending count; triggers the swap when it reaches zero. */
    readonly settle: Effect.Effect<void>;
  }
>()("SuspenseContext") {}

/**
 * The value produced by rendering a single Renderable: a single DOM node, an
 * ordered list of nodes (e.g. for a fragment or array child), or nothing.
 *
 * Defined here so both `render-core.ts` and `suspense.ts` can reference it
 * without a circular import.
 */
export type RenderResult = Node | readonly Node[] | null;

/**
 * Hydration interactivity-barrier latch threaded through {@link RenderContext}
 * for the duration of a `hydrate` call. Generalizes the Suspense boundary's
 * countdown latch (`render.ts`) so the barrier spans the transitive closure of
 * initial reactive regions.
 *
 * Each forked first-emission region calls {@link register} before `Effect.forkIn`
 * and {@link settle} exactly once when its first emission has hydrated (matched,
 * recoverable-divergence patched, or errored via `ensuring`). `hydrate` seeds a
 * sentinel slot, runs the adopt walk, releases the sentinel, then awaits the
 * latch before returning the `RootHandle`, so the page is interactive when the
 * promise settles.
 *
 * Hydrate-only: `mount` does not provide it (a blanket mount barrier deadlocks on
 * regions whose first emission arrives post-mount — see hydrate-ready.specs.md
 * §mount symmetry). Reactive hydrate spots read it optionally.
 */
export type HydrationReady = {
  /** Increment the pending count; call before forking a first-emission fiber. */
  readonly register: Effect.Effect<void>;
  /** Decrement the pending count; completes the latch when it reaches zero. */
  readonly settle: Effect.Effect<void>;
  /** Resolves once every registered first emission has settled. */
  readonly awaitReady: Effect.Effect<void>;
};

/**
 * Service for managing rendering context including runtime, scope, and stream IDs
 */

export class RenderContext extends Context.Service<
  RenderContext,
  {
    /**
     * The owning `WeftApp`'s shared runtime (one per app, not per root). Typed
     * app-agnostically as `ManagedRuntime<never, never>`; the single widening
     * cast lives at the `weft-app.ts` boundary. Used to run event-handler
     * effects against the app layer's services.
     */
    readonly runtime: ManagedRuntime.ManagedRuntime<never, never>;
    /**
     * The current enclosing reactive scope. All forked fibers and prop pumps
     * within this region are children of this scope. Provided alongside the
     * ambient `Scope.Scope` service at every scope boundary — the two always
     * point at the same scope.
     */
    readonly scope: Scope.Scope;
    /**
     * The root's own scope (a child of the app scope). Unlike {@link scope},
     * this never changes as boundaries fork subtree scopes. Event handlers
     * provide it as the ambient `Scope.Scope`, so handler-forked scoped work
     * (`forkScoped`, `acquireRelease`) is owned by the root and dies at
     * `unmount`.
     */
    readonly rootScope: Scope.Scope;
    /**
     * Publishes an error that escaped every user-level handler to the owning
     * app's unhandled-error hub (see `WeftApp.errors`). `region` identifies the
     * escape site, e.g. `attribute:class`, `child:stream-3`, `event:onclick`,
     * `boundary:outermost`.
     */
    readonly reportUnhandled: (cause: Cause.Cause<unknown>, region: string) => Effect.Effect<void>;
    readonly streamIdCounter: { current: number };
    /**
     * Hydration interactivity-barrier latch (see {@link HydrationReady}).
     * Provided for the duration of a `hydrate` call so it resolves only once
     * every initial reactive region's first emission has hydrated. Absent during
     * `mount`.
     */
    readonly hydrationReady?: HydrationReady;
  }
>()("RenderContext") {}
