/**
 * End-to-end browser test for the Reactive Styles example.
 *
 * Mounts the real `App` in Chromium and asserts the headline behaviour: an
 * individual style property driven by a stream (the animated hue) is applied to
 * the element's inline style and updates over time.
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

describe("reactive-styles example", () => {
  it("applies and updates a stream-driven inline style", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    // First .demo-box is AnimatedHue, whose backgroundColor cycles every 50ms.
    const box = await vi.waitFor(() => {
      const el = container.querySelector<HTMLElement>(".demo-box");
      expect(el).not.toBeNull();
      return el!;
    });

    await vi.waitFor(() => expect(box.style.backgroundColor).not.toBe(""));
    const first = box.style.backgroundColor;
    await vi.waitFor(() => expect(box.style.backgroundColor).not.toBe(first), { timeout: 2000 });
  });

  it("applies a whole-object style stream while preserving a static property", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    // Third .demo-box is StyleSwitcher, whose entire style object is a stream.
    // Each emit replaces all properties, so the static `transition` must survive
    // via Stream.map folding — regression guard against spreading the Stream.
    const box = await vi.waitFor(() => {
      const boxes = container.querySelectorAll<HTMLElement>(".demo-box");
      expect(boxes.length).toBeGreaterThanOrEqual(3);
      return boxes[2]!;
    });

    // StyleSwitcher's stream is spaced 1s, so the first emit lands after the
    // default 1s waitFor window — allow headroom.
    await vi.waitFor(
      () => {
        expect(box.style.backgroundColor).not.toBe("");
        expect(box.style.transition).not.toBe("");
      },
      { timeout: 3000 },
    );
  });
});
