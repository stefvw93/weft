/**
 * Real-browser coverage for SVG namespace handling (dom.specs.md AC4b, AC7).
 *
 * jsdom does not reproduce every read-only SVG reflection (`viewBox`, `cx`…),
 * so mount, hydration and reactive attributes are checked against real Chromium.
 *
 * Note: package browser tests import the BUILT `@weftui/dom` entries. The flat
 * browser config does not resolve the package's `~/*` source aliases.
 */

import { AppRpcClientTag, h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { renderToStringHydratable } from "@weftui/dom/server";
import { Effect, Layer, Stream, SubscriptionRef } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SVG_NS = "http://www.w3.org/2000/svg";

// No `Boundary.rpc` here, but the SSR render fns require an `AppRpcClientTag`.
const NoRpc = Layer.succeed(AppRpcClientTag, {
  call: () => Effect.die(new Error("no rpc in this test")),
});

let container: HTMLElement;
let app: WeftApp.WeftApp;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  app = WeftApp.make();
});

afterEach(async () => {
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
});

const icon = () =>
  h.svg({ viewBox: "0 0 10 10", width: 100, height: 100, class: "icon" }, [
    h.g({}, [h.circle({ cx: 5, cy: 5, r: 4 })]),
  ]);

describe("SVG namespace in a real browser", () => {
  it("mounts svg descendants in the SVG namespace, and they render with geometry", async () => {
    await Effect.runPromise(WeftApp.mount(app, icon(), container));

    const svg = container.querySelector("svg");
    await vi.waitFor(() => expect(svg).not.toBeNull());
    expect(svg?.namespaceURI).toBe(SVG_NS);
    expect(svg?.getAttribute("viewBox")).toBe("0 0 10 10");
    expect(svg?.getAttribute("class")).toBe("icon");

    const circle = container.querySelector("circle");
    expect(circle?.namespaceURI).toBe(SVG_NS);
    expect(circle).toBeInstanceOf(SVGCircleElement);
    // An HTML-namespace <circle> has no layout box; a real SVG circle does.
    expect(circle?.getBoundingClientRect().width).toBeGreaterThan(0);
  });

  it("hydrates server svg markup carrying a viewBox", async () => {
    const html = await Effect.runPromise(Effect.provide(renderToStringHydratable(icon()), NoRpc));
    container.innerHTML = html;
    const serverSvg = container.querySelector("svg");

    await Effect.runPromise(WeftApp.hydrate(app, icon(), container));

    expect(container.querySelector("svg")).toBe(serverSvg);
    expect(serverSvg?.getAttribute("viewBox")).toBe("0 0 10 10");
    expect(container.querySelector("circle")?.namespaceURI).toBe(SVG_NS);
  });

  it("updates a reactive cx and removes it on undefined and null", async () => {
    const cx = await Effect.runPromise(SubscriptionRef.make<number | null | undefined>(2));
    // `null` is outside the typed attribute source but reaches the renderer from untyped values.
    const cxSource = SubscriptionRef.changes(cx) as Stream.Stream<number | undefined>;

    await Effect.runPromise(
      WeftApp.mount(
        app,
        h.svg({ viewBox: "0 0 10 10" }, [h.circle({ cx: cxSource, r: 1 })]),
        container,
      ),
    );

    const circle = () => container.querySelector("circle");
    await vi.waitFor(() => expect(circle()?.getAttribute("cx")).toBe("2"));
    expect(circle()?.namespaceURI).toBe(SVG_NS);

    await Effect.runPromise(SubscriptionRef.set(cx, 7));
    await vi.waitFor(() => expect(circle()?.getAttribute("cx")).toBe("7"));
    expect((circle() as SVGCircleElement | null)?.cx.baseVal.value).toBe(7);

    await Effect.runPromise(SubscriptionRef.set(cx, undefined));
    await vi.waitFor(() => expect(circle()?.hasAttribute("cx")).toBe(false));

    await Effect.runPromise(SubscriptionRef.set(cx, 3));
    await vi.waitFor(() => expect(circle()?.getAttribute("cx")).toBe("3"));

    await Effect.runPromise(SubscriptionRef.set(cx, null));
    await vi.waitFor(() => expect(circle()?.hasAttribute("cx")).toBe(false));
  });
});
