/**
 * End-to-end browser test for the product detail page's `Boundary.rpc` **client
 * refetch** over the router's rpc endpoint, the one integration the jsdom unit
 * tests stub out: the real network `RpcClient ↔ RpcServer.toWebHandler` hop at
 * `POST /_eui/rpc`.
 *
 * It renders `/products/:id` to hydratable HTML exactly as the server does
 * (resolving the `GetStock` rpc in-process over the server handler Layer), installs
 * that markup in `#root`, and `hydrate`s `RouterApp(App)` over it. A `window.fetch`
 * shim delegates the same-origin `POST /_eui/rpc` request the network rpc client
 * issues to the router's own `RouterServer.toWebHandler`, so clicking "Refresh
 * stock" performs a faithful round-trip: client → `/_eui/rpc` → server handler →
 * encoded success → client decode → in-place patch.
 *
 * Asserts the headline guarantees:
 *   (a) first paint shows the SSR stock (no flash, since the `#stock` node is adopted
 *       in place across hydration),
 *   (b) clicking "Refresh stock" hits `/_eui/rpc`, re-runs the handler on the
 *       server (a strictly larger value), and patches the region in place (same
 *       `.product` / `#stock` node, no remount), `pending` settling back to "no",
 *   (c) the same rpc **tag** with a different **payload** (`/products/2`) resolves
 *       that product's stock, since the payload is a real typed input, not a per-entity
 *       boundary id.
 */

import { WeftApp } from "@weftui/dom/client";
import { Router, RouterApp, RouterLive } from "@weftui/router/client";
import { RouterServer } from "@weftui/router/server";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "./app";
import { StockLive, StockRpcs } from "./data/inventory";
import { documentShell } from "./entry-server";
import { getProduct } from "./data/products";

/** The app's `Boundary.rpc` foundation: shared contract + server handlers. */
const rpc = { group: StockRpcs, handlers: StockLive } as const;

let container: HTMLElement;
let app: WeftApp.WeftApp<Router> | undefined;
let originalFetch: typeof globalThis.fetch;

/** The router's own platform web handler, answering the same-origin `/_eui/rpc` hop. */
const serverHandler = RouterServer.toWebHandler(App, { document: documentShell, rpc });

beforeEach(() => {
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);

  // Delegate the network rpc client's same-origin `POST /_eui/rpc` fetch to the
  // router's web handler; let every other request fall through to the real fetch.
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
    // The rpc client posts to `/_eui/rpc` but the HTTP transport normalizes a
    // trailing slash (`/_eui/rpc/`); match either so the shim always intercepts.
    if (new URL(url, window.location.origin).pathname.replace(/\/$/, "") === "/_eui/rpc") {
      // Buffer the handler's response into concrete bytes before handing it back
      // to the browser fetch client. The Effect 4 rpc web handler streams its
      // ndjson body from a scope that closes once the handler returns; relaying
      // that live stream through a fetch override yields an empty body, so read
      // it eagerly here (as a real network hop would deliver bytes, not a stream).
      const req = input instanceof Request ? input : new Request(url, init);
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

/** Renders `url` to a full document and parses it back into a DOM `Document`. */
const ssrDocument = async (url: string): Promise<Document> => {
  const { html } = await Effect.runPromise(
    RouterServer.render(App, { document: documentShell, rpc, url }),
  );
  return new DOMParser().parseFromString(html, "text/html");
};

/** SSR `url`, install the `#root` subtree as static markup, and hydrate over it. */
const ssrAndHydrate = async (url: string): Promise<void> => {
  const root = (await ssrDocument(url)).getElementById("root");
  container.innerHTML = root?.innerHTML ?? "";

  window.history.replaceState(null, "", url);
  // RouterLive is scoped (owns popstate + link interceptor); a ManagedRuntime keeps
  // it alive, and also provides the network AppRpcClient that backs refetch.
  app = WeftApp.make(RouterLive(App, { rpc: { group: StockRpcs } }));
  await Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), container));
};

describe("router-ssr shop: Boundary.rpc stock refetch", () => {
  it("shows the SSR stock, refetches over /_eui/rpc, and patches in place", async () => {
    // First paint: the SSR stock is present in the static markup (before any client JS).
    const stockInSsr = (await ssrDocument("/products/1")).getElementById("stock")?.textContent;
    expect(stockInSsr).toMatch(/^\d+$/);

    await ssrAndHydrate("/products/1");

    // (a) No flash: the #stock node is adopted in place and reads a number.
    const stockEl = container.querySelector("#stock");
    const productEl = container.querySelector(".product");
    expect(stockEl).not.toBeNull();
    expect(productEl).not.toBeNull();
    expect(stockEl?.textContent).toMatch(/^\d+$/);

    const valueBefore = Number(stockEl?.textContent);

    // (b) Click Refresh → network rpc client posts to /_eui/rpc → server re-runs the
    //     handler (strictly larger value) → region patches in place. The hydrate
    //     interactivity barrier guarantees the button's listener is live the moment
    //     `hydrate` resolves, so a single dispatch suffices.
    const refresh = container.querySelector<HTMLButtonElement>("#refresh");
    expect(refresh).not.toBeNull();

    refresh!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(Number(stockEl?.textContent)).toBeGreaterThan(valueBefore);
    });

    // Same nodes, so no remount and no flash; pending settles back to "no".
    expect(container.querySelector("#stock")).toBe(stockEl);
    expect(container.querySelector(".product")).toBe(productEl);
    await vi.waitFor(() => expect(container.querySelector("#pending")?.textContent).toBe("no"));
  });

  it("resolves a different product from the same rpc tag (payload carries the id)", async () => {
    // SSR + hydrate /products/2: the same `GetStock` tag with payload `{ id: 2 }`.
    await ssrAndHydrate("/products/2");

    // The detail page is product 2's (proving the route param → component → payload).
    const product2 = getProduct(2);
    expect(product2).not.toBeUndefined();
    expect(container.querySelector(".product")?.textContent).toContain(product2!.name);

    const stockEl = container.querySelector("#stock");
    expect(stockEl?.textContent).toMatch(/^\d+$/);
    const valueBefore = Number(stockEl?.textContent);

    // Refetch hits /_eui/rpc with payload `{ id: 2 }` → product 2's stock, in place.
    container
      .querySelector<HTMLButtonElement>("#refresh")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => {
      expect(Number(stockEl?.textContent)).toBeGreaterThan(valueBefore);
    });
    expect(container.querySelector("#stock")).toBe(stockEl);
  });
});
