/**
 * Browser entry: mounts the Server Boundary example into `#root`.
 *
 * The `AppRpcClientTag` seam is provided via the app layer (not inside `App`),
 * because the renderer drains the boundary's forked rpc call in the app context.
 * Kept separate from `app.ts` so the latter stays importable by the browser test.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App, AppRpcClientLive } from "./app";

const app = WeftApp.make(AppRpcClientLive);
void Effect.runPromise(WeftApp.mount(app, App(), document.getElementById("root")!));
