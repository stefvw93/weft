/**
 * Client entry: hydrates the server-rendered markup in `#root`.
 *
 * `RouterApp(App)` is the universal router root; `RouterLive(App)` provides the
 * History-API-backed `Router` (seeded from `window.location`, with the same-origin
 * link click interceptor installed). `hydrate` adopts the server DOM in place and
 * resumes the reactive outlet, after which back/forward and in-app link clicks
 * navigate without a full page load. No `rpc` option — the app has no `Boundary.rpc`.
 *
 * Route components read the doc model from the `Docs` service, provided via
 * `RouterLive`'s render-time `context` seam as `DocsLive` (baked at build time into the
 * client bundle), so client navigation resolves docs locally with no extra request.
 */

import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { App } from "./app";
import { DocsLive } from "./lib/docs-live";
import { trackPageviews } from "./lib/goatcounter";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root not found");
}

// `RouterLive` is a scoped layer (it owns the popstate listener + link click
// interceptor), so it must outlive `hydrate`. The app runtime owns it: built on
// first hydrate, released only at `WeftApp.dispose`.
const app = WeftApp.make(RouterLive(App, { context: DocsLive }));
void Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), root));

// GoatCounter only counts full page loads; report SPA navigations manually.
app.runtime.runFork(trackPageviews);
