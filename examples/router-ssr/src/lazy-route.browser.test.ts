/**
 * End-to-end browser test for `Router.lazy` (spec:
 * `packages/router/src/lazy-component.specs.md`).
 *
 * A route whose component is `Router.lazy(() => import("./lazy-page")…)` keeps its
 * descriptor eager and matchable while its body is a separate chunk. Two paths:
 *
 * - **AC3, direct-load hydration is flash-free.** Server-render the lazy slot to
 *   hydratable HTML, install it, then `hydrate`: the server DOM is adopted **in place**
 *   (same node identity across the hydrate tick), never blanked by a fallback.
 * - **AC-C1/AC-C2, client navigation.** Mount the router, click into `/lazy` (its chunk
 *   loads on match and renders), navigate away and back (a revisit renders from the
 *   per-slot memo).
 */

import { AppRpcClientTag, Component, h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { renderToStringHydratable } from "@weftui/dom/server";
import type { RouterDef } from "@weftui/router";
import { push, Router, RouterApp, RouterLive } from "@weftui/router/client";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// No `Boundary.rpc` here; the SSR render fns require an `AppRpcClientTag` unconditionally.
const NoRpc = Layer.succeed(AppRpcClientTag, {
  call: () => Effect.die(new Error("no rpc in this test")),
});

/** `/`: a home page with an in-app link into the lazy route. */
const homeRoute = Router.route("", {
  component: Component.make(() => h.a({ href: "/lazy", id: "to-lazy" }, "go lazy")),
});

/** `/lazy`: a route whose component is a lazily-imported chunk. */
const lazyRoute = Router.route("lazy", {
  component: Router.lazy(() => import("./lazy-page").then((m) => m.LazyPage)),
});

const def: RouterDef = Router.router(
  Router.layout(
    {
      component: Component.gen(function* () {
        const outlet = yield* Router.Outlet;
        return yield* h.div({ id: "app" }, [outlet]);
      }),
    },
    [homeRoute, lazyRoute],
  ),
  { notFound: () => h.h2({ id: "nf" }, "404") },
);

let container: HTMLElement;
let app: WeftApp.WeftApp<any, any> | undefined;

beforeEach(() => {
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
});

afterEach(async () => {
  if (app !== undefined) await Effect.runPromise(WeftApp.dispose(app));
  app = undefined;
  container.remove();
  window.history.replaceState(null, "", "/");
});

describe("Router.lazy: direct-load hydration (AC3)", () => {
  it("adopts the server-rendered lazy body in place with no flash", async () => {
    // Same slot instance for render + hydrate, so both resolve the identical component.
    const slot = Router.lazy(() => import("./lazy-page").then((m) => m.LazyPage));

    // Server render (awaits the chunk import) → install as static markup.
    const html = await Effect.runPromise(Effect.provide(renderToStringHydratable(slot()), NoRpc));
    container.innerHTML = html;
    expect(container.querySelector("#lazy")?.textContent).toContain("lazy loaded");

    // Capture the server node identity to prove hydration adopts it (does not re-create it).
    const serverEl = container.querySelector("#lazy");

    // Hydrate over the markup; the chunk resolves during hydrate.
    app = WeftApp.make(NoRpc);
    await Effect.runPromise(WeftApp.hydrate(app, slot(), container));

    expect(container.querySelector("#lazy")?.textContent).toContain("lazy loaded");
    expect(container.querySelector("#lazy")).toBe(serverEl);
  });
});

describe("Router.lazy: client navigation (AC-C1/AC-C2)", () => {
  const mountAt = async (path: string): Promise<void> => {
    window.history.replaceState(null, "", path);
    app = WeftApp.make(RouterLive(def));
    await Effect.runPromise(WeftApp.mount(app, RouterApp(def), container));
  };
  const seeLazy = (): Promise<void> =>
    vi.waitFor(() =>
      expect(container.querySelector("#lazy")?.textContent).toContain("lazy loaded"),
    );
  const seeHome = (): Promise<void> =>
    vi.waitFor(() => expect(container.querySelector("#to-lazy")).not.toBeNull());

  it("loads the lazy route's chunk on navigation, and revisits from the memo", async () => {
    await mountAt("/");
    await seeHome();
    expect(container.querySelector("#lazy")).toBeNull(); // not loaded yet

    // Click the in-app link → SPA match → the lazy chunk loads and renders.
    container.querySelector<HTMLAnchorElement>("#to-lazy")!.click();
    await seeLazy();

    // Away and back: the revisit renders again (from the per-slot memo, no re-fetch).
    await app!.runtime.runPromise(push("/"));
    await seeHome();
    await app!.runtime.runPromise(push("/lazy"));
    await seeLazy();
  });
});
