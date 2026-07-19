import type { Renderable } from "@weftui/core";
import { Context, type Cause, type Option } from "effect";

/**
 * Substitute patch content returned by a {@link SuspenseFailureHandler} for an
 * otherwise-unhandled Suspense resolution failure.
 */
export interface SuspenseFailureSubstitute {
  /** Rendered (hydratable pass) as the patch content for the failed boundary. */
  readonly content: Renderable;
  /**
   * When `true`, the patch script also injects
   * `<meta name="robots" content="noindex">` into `document.head` before
   * performing the swap (the head has long been flushed; DOM injection is the
   * only route: Googlebot's soft-404 pattern).
   */
  readonly markNoindex: boolean;
  /**
   * Optional already-Schema-encoded, JSON-serializable failure value. When
   * present, the patch is emitted in the failure-replay variant (AC-FH7):
   * the suspense markers are retained and a
   * `<script type="application/json" data-weft-suspense-failure>` sentinel
   * carrying `{"error":<this value>}` is prepended to the swapped-in content,
   * so the client `hydrate` can replay the failure to its nearest boundary
   * (`hydrate.specs.md` AC-H14).
   */
  readonly failureReplay?: unknown;
}

/**
 * Ambient, optional seam consulted by the Suspense resolution fiber when a
 * cause escapes the suspended children unhandled (no failure `Boundary`
 * inside the children matched it). Returning `Option.some` substitutes the
 * patch content for that boundary; `Option.none` (or an absent service)
 * keeps the default behaviour: the failure is swallowed, no patch is
 * emitted, and the fallback persists. Spec: `streaming-shell.specs.md`
 * (AC-FH1 … AC-FH6).
 */
export interface SuspenseFailureHandler {
  /** Decide a substitute for an unhandled Suspense resolution failure. */
  readonly handle: (cause: Cause.Cause<unknown>) => Option.Option<SuspenseFailureSubstitute>;
}

/**
 * `Context.Service` key for the {@link SuspenseFailureHandler} seam. Read via
 * `Effect.serviceOption` inside the Suspense resolution fiber, so providing it
 * is always optional. Lives in `@weftui/dom` (like `AppRpcClientTag`) so dom
 * never imports its consumers.
 */
export class SuspenseFailureHandlerTag extends Context.Service<
  SuspenseFailureHandlerTag,
  SuspenseFailureHandler
>()("@weftui/dom/SuspenseFailureHandler") {}
