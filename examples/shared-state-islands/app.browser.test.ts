/**
 * End-to-end browser test for the Shared State Islands example.
 *
 * Mounts three islands from ONE `WeftApp` (controls + two displays) and
 * asserts the headline behaviour: a real click in the controls island
 * propagates reactively to every display island; unmounting one island
 * leaves the others live; disposing the app freezes everything.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ControlsIsland, CounterLive, DisplayIsland } from "./app";

let controlsRoot: HTMLElement;
let displayRootA: HTMLElement;
let displayRootB: HTMLElement;
let app: WeftApp.WeftApp<any, any> | undefined;

beforeEach(() => {
  controlsRoot = document.createElement("div");
  displayRootA = document.createElement("div");
  displayRootB = document.createElement("div");
  document.body.append(controlsRoot, displayRootA, displayRootB);
});

afterEach(async () => {
  if (app !== undefined) await Effect.runPromise(WeftApp.dispose(app));
  app = undefined;
  controlsRoot.remove();
  displayRootA.remove();
  displayRootB.remove();
});

const countIn = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-testid="count"]')?.textContent;

describe("shared-state-islands example", () => {
  it("propagates a click in one island to every other island", async () => {
    app = WeftApp.make(CounterLive);
    await Effect.runPromise(WeftApp.mount(app, ControlsIsland(), controlsRoot));
    const displayA = await Effect.runPromise(WeftApp.mount(app, DisplayIsland(), displayRootA));
    await Effect.runPromise(WeftApp.mount(app, DisplayIsland(), displayRootB));

    await vi.waitFor(() => {
      expect(countIn(displayRootA)).toBe("0");
      expect(countIn(displayRootB)).toBe("0");
    });

    controlsRoot.querySelector<HTMLElement>('[data-testid="increment"]')?.click();
    await vi.waitFor(() => {
      expect(countIn(displayRootA)).toBe("1");
      expect(countIn(displayRootB)).toBe("1");
      expect(displayRootB.querySelector<HTMLElement>('[data-testid="double"]')?.textContent).toBe(
        "double: 2",
      );
    });

    // Unmount display A: B keeps receiving updates, A is frozen.
    await Effect.runPromise(displayA.unmount());
    controlsRoot.querySelector<HTMLElement>('[data-testid="increment"]')?.click();
    await vi.waitFor(() => expect(countIn(displayRootB)).toBe("2"));
    expect(countIn(displayRootA)).toBe("1");

    // Dispose the app: every island freezes; nodes stay in the DOM.
    await Effect.runPromise(WeftApp.dispose(app));
    controlsRoot.querySelector<HTMLElement>('[data-testid="increment"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(countIn(displayRootB)).toBe("2");
  });
});
