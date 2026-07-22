/**
 * Internal seams for resolve-before-commit navigation: the resolved-commit
 * stash and the staged match view. See `resolve-before-commit.specs.md`.
 *
 * **Not public API.** This module is deliberately not re-exported from
 * `src/index.ts` (mirroring the internality of `PreloadSlot` in `route-tree.ts`):
 * it is consumed by the client `navigate` (`client/router-live.ts`), which
 * pre-runs the matched leaf's component effect and stashes its `Exit`, and by
 * the outlet's leaf render (`outlet.ts`), which consumes the stash to swap in
 * the already-resolved node synchronously.
 *
 * The server router and the hydrate path never touch this module's state: the
 * stash is only ever written by a client navigation, so `renderLevel` falls
 * through to the ordinary slot invocation everywhere else (AC-R13).
 */

import { getElementDescriptor } from "@weftui/core";
import type { Renderable } from "@weftui/core";
import { Effect, Exit } from "effect";
import { Subscribable } from "@weftui/core";
import type { RouteMatch } from "./matcher";
import { Router } from "./router-service";

/**
 * Brand key under which the client `Router` service instance carries its
 * mutable resolved-commit stash. Internal to `@weftui/router`; declared
 * `unique symbol` so it is usable as a computed interface key.
 */
export const ResolvedCommit: unique symbol = Symbol.for("@weftui/router/resolved-commit");

/**
 * One pre-run outcome, stashed by `navigate` immediately before it commits the
 * URL ref and consumed exactly once by the outlet's next leaf emission.
 */
export interface ResolvedCommitEntry {
  /** The exact committed `path + search` this outcome belongs to. */
  readonly url: string;
  /**
   * The pre-run's outcome. `Success` carries the leaf's fully-resolved node
   * (the atomic-swap path, AC-R2); `Failure` carries the cause the outlet
   * replays via `Effect.failCause` so the error surfaces through the normal
   * render error path without re-running the component (AC-R7).
   */
  readonly exit: Exit.Exit<Renderable, unknown>;
}

/**
 * A `Router` service instance that may carry the resolved-commit stash. Only
 * the client (`RouterLive`) router is ever widened to this shape; the key is
 * optional so the server router type-checks unchanged (AC-R13).
 */
export interface ResolvedCommitSlot {
  [ResolvedCommit]?: ResolvedCommitEntry | undefined;
}

/**
 * Writes the stash on the (client) router instance. Called by `navigate` /
 * popstate with the pre-run's `Exit`, immediately before the URL ref is set, so
 * the outlet emission triggered by that commit finds it (AC-R1/AC-R2).
 * Overwrites any stale entry: latest-wins already guarantees only the newest
 * navigation reaches the commit step (AC-R6).
 */
export function setResolvedCommit(router: Router["Service"], entry: ResolvedCommitEntry): void {
  (router as Router["Service"] & ResolvedCommitSlot)[ResolvedCommit] = entry;
}

/**
 * Consumes the stash: returns the entry when its `url` equals the emission's
 * `match.url` and **clears the slot** (consume-exactly-once, AC-R2). Otherwise
 * returns `undefined`, so a URL mismatch (stale entry) or an absent slot (server
 * render, hydration, non-navigation re-emission) falls through to the ordinary
 * slot invocation in `renderLevel`.
 */
export function takeResolvedCommit(
  router: Router["Service"],
  url: string,
): ResolvedCommitEntry | undefined {
  const slot = router as Router["Service"] & ResolvedCommitSlot;
  const entry = slot[ResolvedCommit];
  if (entry === undefined || entry.url !== url) {
    return undefined;
  }
  slot[ResolvedCommit] = undefined;
  return entry;
}

/**
 * The staged `Router` view the pre-run executes under (AC-R4): identical to
 * `router` except `Subscribable.get(currentMatch)` resolves to the **target** match. The URL
 * ref has not moved yet, and one-shot reads (`Router.params`, `Router.query`,
 * `Subscribable.get(currentMatch)`) inside the pre-running component body must decode the
 * destination, not the page being left. `Subscribable.changes(currentMatch)` (and `navigate` /
 * `httpApiClient` / `navigating`) delegate to the live service, so reactive
 * subscriptions, which occur at render/mount time post-commit, observe the
 * committed match onward.
 */
export function stageMatch(router: Router["Service"], target: RouteMatch): Router["Service"] {
  return {
    ...router,
    currentMatch: Subscribable.make({
      get: Effect.succeed(target),
      changes: Subscribable.changes(router.currentMatch),
    }),
  };
}

/**
 * Pre-runs a matched leaf's component effect: invokes the slot with the target
 * match's handler-arg props (`{ path, query }`, exactly what `renderLevel`
 * passes), under the {@link stageMatch | staged view}, and captures the outcome
 * as an `Exit` (AC-R1/AC-R7). The returned effect never fails, since failures
 * are folded into the `Exit` for stash-and-replay, but it is **interruptible**:
 * a superseding navigation interrupts the whole pre-run fiber (AC-R6). Requires
 * the caller's runtime context (the `RouterLive` layer's: `Router`,
 * `AppRpcClientTag`, app services), which is what makes the pre-run possible at
 * all (Feasibility §1).
 */
export function preRunLeaf(
  router: Router["Service"],
  target: RouteMatch,
): Effect.Effect<Exit.Exit<Renderable, unknown>> {
  return Effect.suspend(() => {
    if (target._tag !== "Matched") {
      return Effect.succeed(Exit.succeed<Renderable>(null));
    }
    const node = target.leaf.component({ path: target.path, query: target.query });
    // Static markup carries its descriptor and is never executed by the renderer,
    // so mirror that: nothing to resolve, succeed with the node itself. Likewise a
    // non-Effect renderable (plain descriptor, primitive) is already resolved.
    if (!Effect.isEffect(node) || getElementDescriptor(node) !== undefined) {
      return Effect.succeed(Exit.succeed(node as Renderable));
    }
    // A genuinely effectful body: run it under the staged view so one-shot param
    // reads decode the target (AC-R4). `Effect.exit` folds typed failures and
    // defects into the Exit (AC-R7) but lets interruption pass through (AC-R6).
    return Effect.exit(
      Effect.provideService(
        node as Effect.Effect<Renderable, unknown, Router>,
        Router,
        stageMatch(router, target),
      ),
    );
  });
}
