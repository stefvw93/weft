/**
 * Browser entry: mounts the Headless Menu example into `#root`.
 *
 * Kept separate from `app.ts` so the latter stays a side-effect-free module
 * that tests can import and mount into their own container (see
 * `app.browser.test.ts`). The `Rename`/`Duplicate` items' `Notify` requirement
 * comes from the app layer, proving the service flowed through `Props.merge`
 * from `menu.ts` all the way to `Node<E, R>`.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App, NotifyLive } from "./app";

const app = WeftApp.make(NotifyLive);
void Effect.runPromise(WeftApp.mount(app, App(), document.getElementById("root")!));
