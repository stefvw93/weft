import { Cause, Context, Data, Effect, Fiber, ManagedRuntime, Option, Scope } from "effect";

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
 * regions whose first emission arrives post-mount, see hydrate-ready.specs.md
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
 * Options for registering a reactive region with the app's {@link Loom}.
 * Internal to the client renderer (see `client/loom.ts`).
 *
 * @typeParam A - the value type the region's pump writes and `commit` renders
 */
export interface LoomRegisterOptions<A> {
  /** Region label for error reporting, e.g. `"child:stream-3"`, `"attribute:class"`. */
  readonly label: string;
  /** Owning scope; its finalizer unregisters the cell (a dead cell is never committed). */
  readonly scope: Scope.Scope;
  /**
   * Applies the latest value to the DOM. Runs only on the shared flush fiber,
   * never on the pump, one commit at a time. A non-interrupt failure routes
   * to {@link boundary} when present, else {@link reportUnhandled}; the cell
   * is then unregistered and its pump interrupted, while the flush fiber
   * survives. A commit whose cell dies mid-flight completes, but its hooks
   * and error routing are suppressed (see loom.specs.md, edge cases).
   */
  readonly commit: (value: A) => Effect.Effect<void, unknown>;
  /** Innermost enclosing boundary, captured at subscribe time. */
  readonly boundary: Option.Option<BoundaryContext["Service"]>;
  /** The owning root's unhandled-error publisher (from {@link RenderContext}). */
  readonly reportUnhandled: RenderContext["Service"]["reportUnhandled"];
  /** Fires exactly once, after the cell's first successful commit. */
  readonly onFirstCommit?: Effect.Effect<void>;
  /** Fires exactly once, if the cell dies before its first successful commit. */
  readonly onDiscard?: Effect.Effect<void>;
}

/**
 * A registered latest-value cell. The pump overwrites it via {@link write};
 * conflation is structural (only the newest value is ever committed).
 */
export interface LoomCell<A> {
  /** Overwrite the latest value, mark the cell dirty, and wake the flush fiber. */
  readonly write: (value: A) => Effect.Effect<void>;
  /** Whether the pump has ever written (drives the ack-or-exit settle routes). */
  readonly everWritten: () => boolean;
  /**
   * Attach the pump fiber feeding this cell, once, right after it is forked.
   * A failed commit fork-interrupts it alongside unregistering the cell.
   */
  readonly attachPumpFiber: (fiber: Fiber.Fiber<unknown, unknown>) => void;
  /**
   * Record that the region painted its first value inline during the mount pass,
   * without a flush pass: marks the cell written and committed, and fires
   * `onFirstCommit` exactly as {@link Loom}'s flush would. Keeps a suspense
   * fallback settling tick-free and stops `onDiscard` firing for a region that
   * did produce content. Does not advance the commit generation, which counts
   * flush passes (see first-paint.specs.md LC1-LC4).
   */
  readonly markCommitted: Effect.Effect<void>;
  /**
   * Route a cause raised by an inline first paint exactly as a failed commit is
   * routed: to the cell's boundary when present, else `reportUnhandled`, then
   * unregister the cell and fork-interrupt its pump. Lets the mount pass fail a
   * region without failing `mount`, keeping error routing identical for
   * synchronous and asynchronous first emissions (see first-paint.specs.md FE1).
   *
   * Interrupt-only causes are ignored, matching the flush pass: teardown noise
   * must never reach a boundary and trigger recovery (LM18).
   */
  readonly reportAndDiscard: (cause: Cause.Cause<unknown>) => Effect.Effect<void>;
}

/**
 * The app-level render scheduler: N latest-value cells drained by one shared
 * flush fiber, in ascending registration order (outer before inner). Flush
 * completion is the commit acknowledgement surfaced publicly as
 * `RootHandle.awaitCommit` / `commitGeneration`. One Loom per `WeftApp`;
 * internal, not exported from the client barrel.
 */
export interface Loom {
  /** Register a reactive region; returns its cell. Unregistered when `options.scope` closes. */
  readonly register: <A>(options: LoomRegisterOptions<A>) => Effect.Effect<LoomCell<A>>;
  /**
   * Resolves when everything dirty at call time has committed or been
   * discarded, with the commit generation. Immediate when idle. Outstanding
   * barriers resolve on flush-fiber interrupt (app dispose), never hang.
   */
  readonly awaitCommit: Effect.Effect<number>;
  /** Current commit generation: monotonic, +1 per flush pass that committed anything. */
  readonly commitGeneration: Effect.Effect<number>;
}

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
     * ambient `Scope.Scope` service at every scope boundary. The two always
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
    /**
     * The owning app's render scheduler (one per app, shared by all roots).
     * Every reactive region and prop pump registers a latest-value cell here;
     * DOM commits run only on its flush fiber (see `client/loom.ts`).
     */
    readonly loom: Loom;
    /**
     * Whether a reactive region created here may fork its pump with
     * `{ startImmediately: true }` and paint its first value inline.
     *
     * True only on a mount pass, which runs on the caller's own fiber. False
     * inside every Loom commit, every hydration path, and every forked
     * continuation that renders (a boundary fallback, an rpc-resolved subtree):
     * those already run on a forked fiber, and hydration takes its first paint
     * from server HTML. See first-paint.specs.md MG1-MG4.
     */
    readonly syncFirstPaint: boolean;
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
