/**
 * End-to-end browser test for the Server Boundary example.
 *
 * Mounts the real `App` (with the in-process `AppRpcClientLive` seam) in Chromium and
 * asserts the `Boundary.rpc` client-first mount: the `fallback` is visible while the
 * forked rpc call is in flight, the live subtree swaps in once it resolves, and
 * `refetch` re-runs the call and patches the region in place (a new `restocks` count).
 *
 * The seam is provided at the mount call site, mirroring `main.ts`. Post-mount content
 * lands a tick after `mount` resolves, so assertions use `vi.waitFor`.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App, AppRpcClientLive } from "./app";

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

describe("server-boundary example", () => {
  it("shows the fallback, then swaps in the resolved product (client-first mount)", async () => {
    app = WeftApp.make(AppRpcClientLive);
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    // Fallback visible while the (delayed) rpc resolution is in flight.
    expect(container.querySelector(".fallback")).not.toBeNull();
    expect(container.querySelector(".product")).toBeNull();

    // After the forked call resolves, the live subtree swaps in for the fallback.
    const product = await vi.waitFor(() => {
      const el = container.querySelector(".product");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(container.querySelector(".fallback")).toBeNull();
    expect(product.textContent).toContain("Widget");
    expect(product.textContent).toContain("restocked 0 times");
  });

  it("refetches on demand, patching the region with fresh data in place", async () => {
    app = WeftApp.make(AppRpcClientLive);
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    const button = await vi.waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>("button.refresh");
      expect(el).not.toBeNull();
      return el!;
    });

    button.click();

    // The in-process client increments `restocks` per call, so a refetch shows "1".
    await vi.waitFor(() => {
      expect(container.querySelector(".restocks")?.textContent).toContain("restocked 1 times");
    });
  });
});
