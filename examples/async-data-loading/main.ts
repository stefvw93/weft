/**
 * Browser entry: mounts the Async Data Loading example into `#root`.
 *
 * Kept separate from `app.ts` so the latter stays a side-effect-free module that
 * tests can import and mount into their own container (see `app.browser.test.ts`).
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App } from "./app";

const app = WeftApp.make();
void Effect.runPromise(WeftApp.mount(app, App(), document.getElementById("root")!));
