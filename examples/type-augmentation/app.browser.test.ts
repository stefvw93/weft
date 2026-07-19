/**
 * End-to-end browser test for the Type Augmentation example.
 *
 * Mounts the real `App` in Chromium and asserts that the augmented `<greeting-badge>`
 * custom element renders through `h`: the static badge greets "Weft", and the reactive
 * badge tracks a `SubscriptionRef` — typing into the input patches the custom element's
 * attribute in place, and its `attributeChangedCallback` re-renders the greeting.
 *
 * Post-mount content lands a tick after `mount` resolves, so assertions use `vi.waitFor`.
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

describe("type-augmentation example", () => {
  it("renders the augmented custom element with a static name", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    const badge = await vi.waitFor(() => {
      const el = container.querySelector(".static greeting-badge");
      expect(el).not.toBeNull();
      return el!;
    });
    // The custom element upgraded and greeted its `name` attribute.
    expect(badge.textContent).toBe("Hello, Weft!");
  });

  it("drives the custom element's attribute reactively from a stream", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    const badge = await vi.waitFor(() => {
      const el = container.querySelector(".reactive greeting-badge");
      expect(el).not.toBeNull();
      return el!;
    });
    await vi.waitFor(() => expect(badge.textContent).toBe("Hello, World!"));

    const input = container.querySelector<HTMLInputElement>(".name-input")!;
    input.value = "Effect";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => expect(badge.textContent).toBe("Hello, Effect!"));
  });
});
