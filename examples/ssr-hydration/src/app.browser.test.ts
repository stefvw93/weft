/**
 * End-to-end browser test for the SSR + Hydration example.
 *
 * Exercises the full path in a real browser: render the shared `App` to
 * hydratable HTML (as the server does), inject it as the container's markup,
 * confirm the server-rendered count is present before any client JS runs, then
 * `hydrate` over it and verify the counter becomes interactive in place.
 */

import { AppRpcClientTag } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { renderToStringHydratable } from "@weftui/dom/server";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "./app";

// This example has no `Boundary.rpc`, but the SSR render fns require an
// `AppRpcClientTag` in context unconditionally — discharge it with a no-op.
const NoRpc = Layer.succeed(AppRpcClientTag, {
  call: () => Effect.die(new Error("no rpc in this example")),
});

let container: HTMLElement;
let app: WeftApp.WeftApp;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
});

describe("ssr-hydration example", () => {
  it("renders on the server, then hydrates to an interactive counter", async () => {
    // 1. Server-render to hydratable HTML and install it as the static markup.
    const html = await Effect.runPromise(
      Effect.provide(renderToStringHydratable(App({ initialValue: 3 })), NoRpc),
    );
    container.innerHTML = html;

    // 2. The count is present in the static markup before hydration.
    const count = () => container.querySelector(".count");
    expect(count()?.textContent).toContain("3");

    // 3. Hydrate over the server markup; the buttons become interactive.
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.hydrate(app, App({ initialValue: 3 }), container));

    const plus = [...container.querySelectorAll("button")].find((b) => b.textContent === "+");
    expect(plus).toBeDefined();

    plus!.click();
    await vi.waitFor(() => expect(count()?.textContent).toContain("4"));
  });
});
