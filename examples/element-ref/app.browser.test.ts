/**
 * End-to-end browser test for the Element Ref example.
 *
 * Mounts the real `App` in Chromium and asserts the headline behaviour: an
 * element ref captures the live DOM node so the example can act on it
 * imperatively. Three sections are covered:
 *
 * - auto-focus: a `forkScoped` observer of `SubscriptionRef.changes(ref)` focuses the input,
 * - measure: a `forkScoped` observer reads `getBoundingClientRect()`,
 * - scroll-into-view: a click handler reads the ref on demand and scrolls it.
 *
 * The observers use `Effect.forkScoped` (tied to the component instance scope),
 * so they survive an isolated `mount`. Post-mount content lands a tick after
 * `mount` resolves (streams paint in the background, per the spec), so initial
 * state is asserted with `vi.waitFor` rather than synchronously.
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

describe("element-ref example", () => {
  it("auto-focuses the input once its ref captures the mounted element", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    const input = await vi.waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('input[placeholder="I\'m focused!"]');
      expect(el).not.toBeNull();
      return el!;
    });

    // The forkScoped observer focuses the input on its first ref emission.
    await vi.waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("measures the box and reports its dimensions once mounted", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    // The test page lacks the example CSS, so don't assert pixel values. Assert
    // the "Measuring..." → measured transition and the reported format instead.
    const dimensions = await vi.waitFor(() => {
      const el = [...container.querySelectorAll("strong")].find((s) =>
        /^Width: .*px, Height: .*px$/.test(s.textContent ?? ""),
      );
      expect(el).toBeDefined();
      return el!;
    });

    expect(dimensions.textContent).not.toBe("Measuring...");
  });

  it("captures the DOM node so the handler can scroll it into view", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    const button = await vi.waitFor(() => {
      const el = [...container.querySelectorAll("button")].find(
        (b) => b.textContent === "Scroll to Target",
      );
      expect(el).toBeDefined();
      return el!;
    });

    const target = await vi.waitFor(() => {
      const el = [...container.querySelectorAll<HTMLElement>("div")].find(
        (d) => d.textContent === "Target Element",
      );
      expect(el).toBeDefined();
      return el!;
    });

    // The handler retrieves the target via its ref and calls scrollIntoView on
    // it, so spy on the very node the ref captured to prove the wiring.
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy;

    button.click();
    await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalled());
  });
});
