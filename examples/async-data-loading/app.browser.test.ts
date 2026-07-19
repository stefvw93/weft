/**
 * End-to-end browser test for the Async Data Loading example.
 *
 * Mounts the real `App` in Chromium and asserts the headline behaviour: a
 * loading placeholder shows first, then the resolved data replaces it once the
 * simulated async work completes.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "./app";

let container: HTMLElement;
let app: WeftApp.WeftApp;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
});

describe("async-data-loading example", () => {
  it("shows a loading state, then the resolved data", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    // Loading placeholder is present on initial render.
    await vi.waitFor(() => expect(container.querySelector(".loading")).not.toBeNull());

    // The 1.5s simulated fetch eventually swaps in resolved data.
    await vi.waitFor(
      () => expect(container.querySelector(".data")?.textContent).toContain("Data loaded"),
      { timeout: 4000 },
    );
  });
});
