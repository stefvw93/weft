/**
 * End-to-end browser test for the Error Boundary example.
 *
 * Mounts the real `App` in Chromium and asserts the headline behaviour: when a
 * child fails on the rendering path, the `Boundary.catch` fallback renders
 * instead of the app crashing.
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

describe("error-boundary example", () => {
  it("renders a fallback when a child fails", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    // The first section's failing fetch rejects after ~800ms; the boundary then
    // swaps in its error fallback.
    await vi.waitFor(
      () => {
        const fallback = [...container.querySelectorAll(".error-box")].find((el) =>
          el.textContent?.includes("Network error"),
        );
        expect(fallback).toBeDefined();
      },
      { timeout: 3000 },
    );
  });
});
