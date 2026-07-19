/**
 * Browser entry: one `WeftApp`, two islands.
 *
 * Both mounts share `CounterLive` through the app layer, so clicks in the
 * controls island update the display island reactively. Kept separate from
 * `app.ts` so the latter stays a side-effect-free module that tests can
 * import and mount into their own containers (see `app.browser.test.ts`).
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { ControlsIsland, CounterLive, DisplayIsland } from "./app";

const app = WeftApp.make(CounterLive);

void Effect.runPromise(
  WeftApp.mount(app, ControlsIsland(), document.getElementById("island-controls")!),
);
void Effect.runPromise(
  WeftApp.mount(app, DisplayIsland(), document.getElementById("island-display")!),
);
