/**
 * Client entry: hydrates the server-rendered markup in `#root`.
 *
 * `hydrate` adopts the static DOM and resumes the reactive counter region in
 * place. Once it resolves, the page is interactive, so we flip the status
 * indicator from `[SSR]` to `[hydrated]` so the transition is visible.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App } from "./app";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root not found");
}

const app = WeftApp.make();
void Effect.runPromise(WeftApp.hydrate(app, App({ initialValue: 3 }), root)).then(() => {
  const status = document.getElementById("status");
  if (status !== null) {
    status.textContent = "[hydrated: interactive]";
  }
});
