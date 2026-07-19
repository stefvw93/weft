// @vitest-environment jsdom

/**
 * Executed interaction test for the `reactive-counter` demo (jsdom).
 *
 * The real-browser path is covered by `src/__tests__/website.browser.test.ts`; this
 * runs the same interaction under jsdom in the default `vp test` run, so the live
 * demo's reactivity (click → SubscriptionRef update → stream → DOM text) is actually
 * executed and asserted, not just rendered to a string.
 */

import * as assert from "node:assert/strict";
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { afterEach, describe, it, vi } from "vite-plus/test";
import { ReactiveCounter } from "./reactive-counter";

let app: WeftApp.WeftApp | undefined;

afterEach(async () => {
  if (app) await Effect.runPromise(WeftApp.dispose(app));
  app = undefined;
});

describe("reactive-counter (jsdom interaction)", () => {
  it("increments the displayed value when the + button is clicked", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, ReactiveCounter(), container));

    const value = () => container.querySelector(".counter-value");
    // The mounted tree is appended a tick after `mount` resolves.
    await vi.waitFor(() => assert.equal(value()?.textContent, "0"));

    const increment = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Increment",
    );
    assert.ok(increment, "expected an increment button");

    increment.click();
    await vi.waitFor(() => assert.equal(value()?.textContent, "1"));

    increment.click();
    await vi.waitFor(() => assert.equal(value()?.textContent, "2"));

    container.remove();
  });
});
