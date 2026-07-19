/**
 * Browser entry: mounts the Declarative Event Handlers example into `#root`.
 *
 * Kept separate from `app.ts` so the latter stays a side-effect-free module that
 * tests can import and mount into their own container (see `app.browser.test.ts`).
 * The `Analytics` service the tracked-button handler depends on comes from the
 * app layer.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { AnalyticsLive, App } from "./app";

const app = WeftApp.make(AnalyticsLive);
void Effect.runPromise(WeftApp.mount(app, App(), document.getElementById("root")!));
