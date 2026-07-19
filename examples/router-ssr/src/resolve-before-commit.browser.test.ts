/**
 * End-to-end browser test for resolve-before-commit navigation
 * (spec: `packages/router/src/resolve-before-commit.specs.md`).
 *
 * Beyond the chunk dimension (`pending-navigation.browser.test.ts`), the router
 * now also pre-runs the matched leaf's **component effect** before committing.
 * A body that awaits its own data (the website's `yield* docs.load` shape) no
 * longer blanks the outlet for the fetch. With a controllable-delay data effect
 * in an eager leaf body:
 *
 * - **AC1 (no blank, data included).** A `MutationObserver` on the outlet never
 *   observes it emptied across the transition; the old page stays until the new
 *   one commits, and the swap is atomic.
 * - **AC5 (navigating covers the data window).** A `Router.navigatingStream`
 *   indicator is pending exactly while the body resolves.
 * - **AC3 (memoized revisit is silent).** Once the body resolves synchronously
 *   (app-level memo, as the website's doc cache does), a revisit commits without
 *   the indicator ever leaving `idle`.
 */

import { Component, h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import type { RouterDef } from "@weftui/router";
import { push, Router, RouterApp, RouterLive } from "@weftui/router/client";
import { Effect, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * A leaf whose body awaits gated "data" once and memoizes it, matching the
 * website's `docs.load` shape: first visit fetches, revisits resolve synchronously.
 */
function makeDataPage(): {
  readonly component: () => ReturnType<typeof h.div>;
  readonly release: () => void;
} {
  let release!: () => void;
  const gate = new Promise<string>((r) => {
    release = () => r("data loaded");
  });
  let cache: string | undefined;
  const component = Component.gen(function* () {
    const data = cache ?? (cache = yield* Effect.promise(() => gate));
    return yield* h.div({ id: "data" }, data);
  }) as unknown as () => ReturnType<typeof h.div>;
  return { component, release: () => release() };
}

/** A router with a home page and the data-gated leaf, plus a navigating indicator. */
function makeDef(component: () => ReturnType<typeof h.div>): RouterDef {
  const homeRoute = Router.route("", {
    component: Component.make(() =>
      h.div({ id: "home" }, [h.a({ href: "/data", id: "to-data" }, "go data")]),
    ),
  });
  const dataRoute = Router.route("data", { component });
  return Router.router(
    Router.layout(
      {
        component: Component.gen(function* () {
          const outlet = yield* Router.Outlet;
          const nav = yield* Router.navigatingStream;
          return yield* h.div({ id: "app" }, [
            h.div({ id: "nav-indicator" }, [
              Stream.map(nav.changes, (s) => (s._tag === "Navigating" ? "loading" : "idle")),
            ]),
            h.main([outlet]),
          ]);
        }),
      },
      [homeRoute, dataRoute],
    ),
    { notFound: () => h.h2({ id: "nf" }, "404") },
  );
}

let container: HTMLElement;
let app: WeftApp.WeftApp<Router> | undefined;

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

describe("Resolve-before-commit: leaf data pre-run (AC1/AC3/AC5)", () => {
  const indicator = (): string | null =>
    container.querySelector("#nav-indicator")?.textContent ?? null;

  it("keeps the old page mounted with no blank while the body's data resolves, then swaps atomically", async () => {
    const page = makeDataPage();
    const def = makeDef(page.component);
    app = WeftApp.make(RouterLive(def));
    await Effect.runPromise(WeftApp.mount(app, RouterApp(def), container));

    await vi.waitFor(() => expect(container.querySelector("#to-data")).not.toBeNull());
    await vi.waitFor(() => expect(indicator()).toBe("idle"));

    // Watch the outlet: it must never be observed empty across the transition.
    const main = container.querySelector("main")!;
    let observedEmpty = false;
    const observer = new MutationObserver(() => {
      if (main.querySelector("#home") === null && main.querySelector("#data") === null) {
        observedEmpty = true;
      }
    });
    observer.observe(main, { childList: true, subtree: true });

    // Navigate into the data route; the body's data has NOT resolved yet.
    container.querySelector<HTMLAnchorElement>("#to-data")!.click();

    // Mid-flight: the old page is still mounted, the new one absent, indicator pending.
    await vi.waitFor(() => expect(indicator()).toBe("loading"));
    expect(container.querySelector("#home")).not.toBeNull();
    expect(container.querySelector("#data")).toBeNull();

    // Resolve the data → atomic swap.
    page.release();
    await vi.waitFor(() => expect(container.querySelector("#data")).not.toBeNull());
    expect(container.querySelector("#home")).toBeNull();
    await vi.waitFor(() => expect(indicator()).toBe("idle"));

    observer.disconnect();
    // The outlet region was never blank at any observed mutation.
    expect(observedEmpty).toBe(false);
  });

  it("AC3: a revisit whose body resolves synchronously (memoized data) never flips the indicator", async () => {
    const page = makeDataPage();
    const def = makeDef(page.component);
    app = WeftApp.make(RouterLive(def));
    await Effect.runPromise(WeftApp.mount(app, RouterApp(def), container));

    await vi.waitFor(() => expect(container.querySelector("#to-data")).not.toBeNull());

    // First visit needs the data; release it and land on /data.
    container.querySelector<HTMLAnchorElement>("#to-data")!.click();
    page.release();
    await vi.waitFor(() => expect(container.querySelector("#data")).not.toBeNull());

    // Back home, then record every indicator change across the memoized revisit.
    await app!.runtime.runPromise(push("/"));
    await vi.waitFor(() => expect(container.querySelector("#home")).not.toBeNull());

    const states: string[] = [];
    const indicatorEl = container.querySelector("#nav-indicator")!;
    const observer = new MutationObserver(() => {
      states.push(indicatorEl.textContent ?? "");
    });
    observer.observe(indicatorEl, { childList: true, subtree: true, characterData: true });

    await app!.runtime.runPromise(push("/data"));
    await vi.waitFor(() => expect(container.querySelector("#data")).not.toBeNull());

    observer.disconnect();
    // A synchronous body commits without ever emitting Navigating (AC-R3).
    expect(states.includes("loading")).toBe(false);
    expect(indicator()).toBe("idle");
  });
});
