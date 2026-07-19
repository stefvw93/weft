/**
 * GoatCounter SPA pageview tracking.
 *
 * The `count.js` script (loaded in `layouts/shell.ts`) counts exactly once, on
 * script load: it installs no History hooks, so client-side navigations via
 * `@weftui/router` are invisible to it. {@link trackPageviews} closes that gap:
 * it forks a listener on the router's `currentMatch` stream and reports each
 * subsequent navigation through GoatCounter's manual `count()` API.
 */

import { Router } from "@weftui/router";
import { Effect, pipe, Stream } from "effect";

declare global {
  interface Window {
    /** Injected by GoatCounter's `count.js`; absent until it loads (or when blocked). */
    goatcounter?: {
      count?: (options?: { readonly path?: string }) => void;
    };
  }
}

/**
 * Reports a pageview to GoatCounter on every client-side navigation.
 *
 * Runs forever (fork it on the app's `ManagedRuntime`). The first emission is
 * dropped: `SubscriptionRef.changes` replays the current value on subscribe,
 * and the initial pageview is already counted by `count.js`'s onload count.
 * The optional chaining tolerates the `async` script not having loaded yet
 * (an early navigation is dropped) and ad-blockers that block it entirely.
 * Reading `location` inside the handler is safe because the router commits
 * History before publishing the match.
 */
export const trackPageviews: Effect.Effect<void, never, Router> = Effect.gen(function* () {
  const router = yield* Router;
  yield* pipe(
    router.currentMatch.changes,
    Stream.drop(1),
    Stream.runForEach(() =>
      Effect.sync(() => {
        window.goatcounter?.count?.({
          path: location.pathname + location.search,
        });
      }),
    ),
  );
});
