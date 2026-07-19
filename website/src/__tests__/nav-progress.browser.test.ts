/**
 * End-to-end browser test for the navigation progress bar
 * (spec: `src/nav-progress.specs.md`, AC1/AC2).
 *
 * Mounts the real website `App` at the landing page and clicks through to the
 * first tutorial doc: a first visit, so the lazy `doc-page-impl` chunk is
 * genuinely unfetched and the deferred-commit resolve window is real. A
 * `MutationObserver` on `#nav-progress` records every `class` value across the
 * transition: the bar must flip to `is-navigating` mid-flight (AC2) and settle
 * back to plain `nav-progress` after commit. The `is-navigating` assertion
 * lives only in this first-navigation test. Revisits render from the per-slot
 * memo and stay `Idle`.
 */

import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "../app";
import { DocsLive } from "../lib/docs-live";

let container: HTMLElement;
let app: WeftApp.WeftApp<any, any> | undefined;

const GETTING_STARTED = "/docs/tutorial/01-your-first-app";

beforeEach(() => {
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
  window.history.replaceState(null, "", "/");
});

afterEach(async () => {
  if (app !== undefined) await Effect.runPromise(WeftApp.dispose(app));
  app = undefined;
  container.remove();
  window.history.replaceState(null, "", "/");
});

// Skipped while the bar is disabled via `NAV_PROGRESS_ENABLED` in `src/app.ts`
// (visual polish pending). Restore to `describe` when the flag flips back on.
describe.skip("navigation progress bar (AC1/AC2)", () => {
  it("shows is-navigating during a first doc navigation and settles back to idle", async () => {
    app = WeftApp.make(RouterLive(App, { context: DocsLive }));
    await Effect.runPromise(WeftApp.mount(app, RouterApp(App), container));

    // AC1: the bar is rendered on the landing page, idle and inert.
    await vi.waitFor(() => expect(container.querySelector("#nav-progress")).not.toBeNull());
    const bar = container.querySelector("#nav-progress")!;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.classList.contains("nav-progress")).toBe(true);
    expect(bar.classList.contains("is-navigating")).toBe(false);

    // Record every class value the bar takes across the transition.
    const observedClasses: string[] = [];
    const observer = new MutationObserver(() => {
      observedClasses.push(bar.getAttribute("class") ?? "");
    });
    observer.observe(bar, { attributes: true, attributeFilter: ["class"] });

    // Navigate Home → first tutorial doc (lazy chunk not yet fetched).
    const link = container.querySelector<HTMLAnchorElement>(`a[href='${GETTING_STARTED}']`);
    expect(link).not.toBeNull();
    link!.click();

    await vi.waitFor(
      () => expect(container.querySelector("article h1")?.textContent).toBeTruthy(),
      { timeout: 10_000 },
    );
    observer.disconnect();

    // AC2: pending mid-flight, idle again after commit.
    expect(observedClasses.some((c) => c.includes("is-navigating"))).toBe(true);
    expect(bar.classList.contains("is-navigating")).toBe(false);
    expect(window.location.pathname).toBe(GETTING_STARTED);
  });
});
