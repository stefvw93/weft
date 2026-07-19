/**
 * End-to-end browser test for the shop's nested routing: SPA navigation between
 * the boundary-free pages (landing ↔ listing), persistence of the root `Shell`
 * layout, the dynamic 404 a leaf raises for an unknown product id, and the
 * **client-first mount** of the detail page's `Boundary.rpc` (C1).
 *
 * It mounts `RouterApp(App)` in a real browser under a long-lived
 * `ManagedRuntime.make(RouterLive(App, { rpc }))` (the scoped layer owns the
 * popstate listener + same-origin link interceptor, and provides the network rpc
 * client backing `Boundary.rpc`), drives navigation by clicking the rendered `<a>`
 * links, and asserts the page swaps while the `#shell-header` node stays identical
 * (the outermost layout never re-renders).
 *
 * The detail page (`/products/:id`) hosts a `Boundary.rpc` for live stock. Its
 * "View" links are normal in-app links, so navigating in is an SPA mount with **no
 * SSR payload**: the boundary shows its `fallback`, forks a `POST /_eui/rpc` call,
 * and swaps the live stock in. A `window.fetch` shim delegates that request to the
 * router's own server handler. Refetch over the live network hop is covered by
 * `refetch.browser.test.ts`.
 */

import { WeftApp } from "@weftui/dom/client";
import type { RouterDef } from "@weftui/router";
import { Router, RouterApp, RouterLive } from "@weftui/router/client";
import { RouterServer } from "@weftui/router/server";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "./app";
import { StockLive, StockRpcs } from "./data/inventory";
import { documentShell } from "./entry-server";

let container: HTMLElement;
let app: WeftApp.WeftApp<Router> | undefined;
let originalFetch: typeof globalThis.fetch;

/** The router's own platform web handler, answering the same-origin `/_eui/rpc` hop. */
const serverHandler = RouterServer.toWebHandler(App, {
  document: documentShell,
  rpc: { group: StockRpcs, handlers: StockLive },
});

beforeEach(() => {
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);

  // Delegate the network rpc client's `POST /_eui/rpc` fetch to the server handler.
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
    // The rpc client posts to `/_eui/rpc` but the HTTP transport normalizes a
    // trailing slash (`/_eui/rpc/`); match either so the shim always intercepts.
    if (new URL(url, window.location.origin).pathname.replace(/\/$/, "") === "/_eui/rpc") {
      const req = input instanceof Request ? input : new Request(url, init);
      // Buffer the streamed rpc response into bytes before returning it (see the
      // refetch spec) so the browser fetch client receives a non-empty body.
      return serverHandler(req).then(
        async (res) =>
          new Response(await res.arrayBuffer(), {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          }),
      );
    }
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (app !== undefined) await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
  window.history.replaceState(null, "", "/");
});

const mountAt = async (path: string, def: RouterDef = App): Promise<void> => {
  window.history.replaceState(null, "", path);
  app = WeftApp.make(RouterLive(def, { rpc: { group: StockRpcs } }));
  await Effect.runPromise(WeftApp.mount(app, RouterApp(def), container));
};

/** Finds a rendered link by its trimmed text. */
const link = (text: string): HTMLAnchorElement | undefined =>
  [...container.querySelectorAll("a")].find((a) => a.textContent?.trim() === text);

describe("router-ssr shop: navigation", () => {
  it("navigates landing → listing while persisting the Shell layout", async () => {
    await mountAt("/");
    await vi.waitFor(() => expect(container.textContent).toContain("Brew better coffee"));

    // The outermost layout is mounted; capture its node to prove persistence.
    const headerEl = container.querySelector("#shell-header");
    expect(headerEl).not.toBeNull();

    // Landing → listing via the "Shop all" CTA (SPA, since both pages are boundary-free).
    link("Shop all products →")!.click();
    await vi.waitFor(() => expect(container.textContent).toContain("All products"));
    expect(container.querySelector("#grid")).not.toBeNull();

    // The Shell persisted across the navigation: same header DOM node.
    expect(container.querySelector("#shell-header")).toBe(headerEl);
  });

  it("renders the Router.navigating progress bar (idle by default)", async () => {
    await mountAt("/");
    await vi.waitFor(() => expect(container.querySelector("#nav-progress")).not.toBeNull());
    // Eager routes → the bar stays idle (no `is-navigating`).
    expect(container.querySelector("#nav-progress")?.className).toBe("nav-progress");
  });

  it("renders a dynamic 404 for an unknown product id", async () => {
    await mountAt("/products/999");
    await vi.waitFor(() => expect(container.textContent).toContain("404: page not found"));
  });

  it("supports back/forward navigation via popstate", async () => {
    await mountAt("/");
    await vi.waitFor(() => expect(container.textContent).toContain("Brew better coffee"));

    // Home → listing via the "Products" nav link.
    link("Products")!.click();
    await vi.waitFor(() => expect(container.textContent).toContain("All products"));

    // Back → popstate resyncs the router to the landing page.
    window.history.back();
    await vi.waitFor(() => expect(container.textContent).toContain("Brew better coffee"));
    expect(container.textContent).not.toContain("All products");

    // Forward → back to the listing.
    window.history.forward();
    await vi.waitFor(() => expect(container.textContent).toContain("All products"));
  });

  it("client-first mounts the detail Boundary.rpc: fallback → live stock (no full load)", async () => {
    await mountAt("/products");
    await vi.waitFor(() => expect(container.querySelector("#grid")).not.toBeNull());
    const headerEl = container.querySelector("#shell-header");

    // SPA-navigate into a product detail via a card's "View" link (no SSR payload).
    // The boundary mounts client-first: it renders `#stock-fallback`, forks a
    // `POST /_eui/rpc` call, then swaps the live stock in. The fallback is
    // transient (the shim resolves fast), so we assert the end state.
    link("View")!.click();

    // The forked rpc resolves and the live stock swaps in (page changed to detail).
    await vi.waitFor(() => {
      const stock = container.querySelector("#stock");
      expect(stock).not.toBeNull();
      expect(stock?.textContent).toMatch(/^\d+$/);
    });
    // Once live, the fallback has been replaced.
    expect(container.querySelector("#stock-fallback")).toBeNull();

    // It was an SPA navigation (no full document load): the Shell layout persisted.
    expect(container.querySelector("#shell-header")).toBe(headerEl);
  });
});
