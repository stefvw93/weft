/**
 * End-to-end browser test for scroll reset on client navigation
 * (spec: `packages/router/src/scroll-reset.specs.md`, AC-S1).
 *
 * Mounts the real website `App`, scrolls the window down deep into a long doc,
 * then clicks a link to a different doc. A History `pushState` does not reset
 * scroll on its own, so the router does it: a path-changing navigation returns
 * the window to the top. Asserts `window.scrollY === 0` after the new doc
 * commits. This encodes the reported bug (scroll offset retained on navigation
 * to a new url) as a permanent regression test.
 */

import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "../app";
import { DocsLive } from "../lib/docs-live";

let container: HTMLElement;
let spacer: HTMLElement;
let app: WeftApp.WeftApp<any, any> | undefined;

const FIRST = "/docs/tutorial/01-your-first-app";
const SECOND = "/docs/tutorial/02-reactivity";

beforeEach(() => {
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
  // Guarantee the document is taller than the viewport so it can actually scroll.
  spacer = document.createElement("div");
  spacer.style.height = "5000px";
  document.body.append(spacer);
  window.history.replaceState(null, "", FIRST);
});

afterEach(async () => {
  if (app !== undefined) await Effect.runPromise(WeftApp.dispose(app));
  app = undefined;
  container.remove();
  spacer.remove();
  window.scrollTo(0, 0);
  window.history.replaceState(null, "", "/");
});

/** Resolves after the next animation frame (lets scroll/layout settle). */
const nextFrame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => r(undefined)));

describe("client navigation to a new path resets scroll to top (AC-S1)", () => {
  it("scrolls the window back to top after navigating to a different doc", async () => {
    app = WeftApp.make(RouterLive(App, { context: DocsLive }));
    await Effect.runPromise(WeftApp.mount(app, RouterApp(App), container));

    // First doc rendered.
    await vi.waitFor(
      () => expect(container.querySelector("article h1")?.textContent).toBeTruthy(),
      { timeout: 10_000 },
    );
    const firstTitle = container.querySelector("article h1")?.textContent;

    // Scroll deep into the page, then confirm the scroll actually took effect
    // (otherwise the assertion below would pass vacuously).
    window.scrollTo(0, 800);
    await nextFrame();
    expect(window.scrollY).toBeGreaterThan(0);

    // Navigate to a different doc (path change).
    const link = container.querySelector<HTMLAnchorElement>(`a[href='${SECOND}']`);
    expect(link).not.toBeNull();
    link!.click();

    await vi.waitFor(
      () => {
        const title = container.querySelector("article h1")?.textContent;
        expect(title).toBeTruthy();
        expect(title).not.toBe(firstTitle);
      },
      { timeout: 10_000 },
    );
    await nextFrame();

    // Landed at the top of the new page.
    expect(window.location.pathname).toBe(SECOND);
    expect(window.scrollY).toBe(0);
  });
});
