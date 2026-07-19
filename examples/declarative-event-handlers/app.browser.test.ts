/**
 * End-to-end browser test for the Declarative Event Handlers example.
 *
 * Mounts the real `App` in Chromium (providing the `Analytics` service, as the
 * browser entry does) and asserts the headline behaviour: the stream-composition
 * counter — built from `Stream.fromEventListener` + `merge` + `scan` — increments
 * when its `+` button is clicked.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AnalyticsLive, App } from "./app";

let container: HTMLElement;
let app: WeftApp.WeftApp<any, any>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
});

describe("declarative-event-handlers example", () => {
  it("increments the stream-composition counter on click", async () => {
    app = WeftApp.make(AnalyticsLive);
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    const counter = () => container.querySelector(".counter");
    const plus = await vi.waitFor(() => {
      const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "+");
      expect(button).toBeDefined();
      return button!;
    });

    // The click stream attaches its listeners asynchronously (it awaits a
    // resolved promise, then subscribes via Stream.fromEventListener), so retry
    // the click until the accumulated count reflects it.
    await vi.waitFor(() => expect(counter()?.textContent).toBe("0"));
    await vi.waitFor(
      () => {
        plus.click();
        expect(counter()?.textContent).toBe("1");
      },
      { timeout: 2000 },
    );
  });
});
