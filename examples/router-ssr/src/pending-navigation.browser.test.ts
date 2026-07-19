/**
 * End-to-end browser test for pending (deferred-commit) navigation
 * (spec: `packages/router/src/pending-navigation.specs.md`).
 *
 * On SPA navigation to a `Router.lazy` route the router now resolves the chunk
 * **before** committing the route, so the previous outlet content stays mounted
 * during the fetch and the swap is a single blank-free tick. This asserts, with a
 * controllable-delay lazy route:
 *
 * - **AC-N1 (no blank).** A `MutationObserver` on the outlet region never observes it
 *   emptied across the transition: the old page is present until the new one commits.
 * - **AC-N5 (navigating signal).** A component reading `Router.navigatingStream`
 *   shows a pending indicator only during the resolve window (`loading` → `idle`).
 * - **AC-N4 (revisit synchronous).** A revisit renders from the per-slot memo.
 */

import { Component, h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import type { RouterDef } from "@weftui/router";
import { push, Router, RouterApp, RouterLive } from "@weftui/router/client";
import { Effect, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/** The lazily-loaded page body (its own would-be chunk). */
const LazyBody = Component.make(() => h.div({ id: "lazy" }, "lazy loaded"));

/** A controllable lazy loader: resolves the chunk only when `release()` is called. */
function makeGate(): {
  readonly load: () => Promise<typeof LazyBody>;
  readonly release: () => void;
} {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return { load: () => gate.then(() => LazyBody), release };
}

/**
 * Builds a router whose `/lazy` route is gated by `load`, under a layout that both
 * splices the outlet and renders a `Router.navigatingStream`-driven indicator.
 */
function makeDef(load: () => Promise<typeof LazyBody>): RouterDef {
  const homeRoute = Router.route("", {
    component: Component.make(() =>
      h.div({ id: "home" }, [h.a({ href: "/lazy", id: "to-lazy" }, "go lazy")]),
    ),
  });
  const lazyRoute = Router.route("lazy", { component: Router.lazy(load) });
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
      [homeRoute, lazyRoute],
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

describe("Pending navigation — deferred commit (AC-N1/AC-N5)", () => {
  const indicator = (): string | null =>
    container.querySelector("#nav-indicator")?.textContent ?? null;

  it("keeps the old page mounted with no blank while the chunk resolves, then swaps atomically", async () => {
    const gate = makeGate();
    const def = makeDef(gate.load);
    app = WeftApp.make(RouterLive(def));
    await Effect.runPromise(WeftApp.mount(app, RouterApp(def), container));

    await vi.waitFor(() => expect(container.querySelector("#to-lazy")).not.toBeNull());
    await vi.waitFor(() => expect(indicator()).toBe("idle"));

    // Watch the outlet: it must never be observed empty across the transition.
    const main = container.querySelector("main")!;
    let observedEmpty = false;
    const observer = new MutationObserver(() => {
      if (main.querySelector("#home") === null && main.querySelector("#lazy") === null) {
        observedEmpty = true;
      }
    });
    observer.observe(main, { childList: true, subtree: true });

    // Navigate into the gated lazy route; the chunk has NOT resolved yet.
    container.querySelector<HTMLAnchorElement>("#to-lazy")!.click();

    // Mid-flight: the old page is still mounted, the new one absent, indicator pending.
    await vi.waitFor(() => expect(indicator()).toBe("loading"));
    expect(container.querySelector("#home")).not.toBeNull();
    expect(container.querySelector("#lazy")).toBeNull();

    // Resolve the chunk → atomic swap.
    gate.release();
    await vi.waitFor(() => expect(container.querySelector("#lazy")).not.toBeNull());
    expect(container.querySelector("#home")).toBeNull();
    await vi.waitFor(() => expect(indicator()).toBe("idle"));

    observer.disconnect();
    // The outlet region was never blank at any observed mutation.
    expect(observedEmpty).toBe(false);
  });

  it("AC-N4: a revisit to an already-loaded lazy route renders from the memo", async () => {
    const gate = makeGate();
    const def = makeDef(gate.load);
    app = WeftApp.make(RouterLive(def));
    await Effect.runPromise(WeftApp.mount(app, RouterApp(def), container));

    await vi.waitFor(() => expect(container.querySelector("#to-lazy")).not.toBeNull());

    // First visit needs the chunk; release it and land on /lazy.
    container.querySelector<HTMLAnchorElement>("#to-lazy")!.click();
    gate.release();
    await vi.waitFor(() => expect(container.querySelector("#lazy")).not.toBeNull());

    // Away and back: the revisit renders again from the per-slot memo (no re-gate).
    await app!.runtime.runPromise(push("/"));
    await vi.waitFor(() => expect(container.querySelector("#home")).not.toBeNull());
    await app!.runtime.runPromise(push("/lazy"));
    await vi.waitFor(() => expect(container.querySelector("#lazy")).not.toBeNull());
    expect(indicator()).toBe("idle");
  });
});
