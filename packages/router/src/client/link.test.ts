import * as assert from "node:assert/strict";
import { Component, h } from "@weftui/core";
import { Effect, Exit, Schema, Scope } from "effect";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, test } from "vite-plus/test";
import { Router } from "~/index";
import { installLinkInterceptor } from "~/client/link";

const Page = (label: string) => () => h.div({}, label);

/** A passthrough layout `component`: renders the injected outlet directly. */
const passthrough = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* outlet;
});

/** A small two-route tree: `/about` (static) and `/users/:id` (param). */
function fixture() {
  return Router.router(
    Router.layout({ component: passthrough }, [
      Router.route("about", { component: Page("about") }),
      Router.route("users/:id", { path: { id: Schema.NumberFromString }, component: Page("user") }),
    ]),
    { notFound: () => h.h1({}, "404") },
  );
}

let dom: JSDOM;
/** Navigation targets recorded by the test's `navigate`. */
let navigations: string[];
let scope: Scope.CloseableScope;

/** Sets up a fresh JSDOM at `url`, installs the interceptor (optionally under `base`), and records navigations. */
async function install(url = "http://localhost/", base = ""): Promise<void> {
  dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url });
  global.window = dom.window as unknown as Window & typeof globalThis;
  global.document = dom.window.document;
  global.Element = dom.window.Element;
  global.MouseEvent = dom.window.MouseEvent;
  global.HTMLAnchorElement = dom.window.HTMLAnchorElement;

  navigations = [];
  const navigate = (to: string): Effect.Effect<void> =>
    Effect.sync(() => {
      navigations.push(to);
    });

  scope = await Effect.runPromise(Scope.make());
  await Effect.runPromise(Scope.extend(installLinkInterceptor(fixture(), navigate, base), scope));
}

/** Appends an anchor with `attrs`, dispatches a click on it, and returns the event. */
async function clickAnchor(
  attrs: Record<string, string>,
  init: MouseEventInit = {},
): Promise<MouseEvent> {
  const anchor = document.createElement("a");
  for (const [key, value] of Object.entries(attrs)) anchor.setAttribute(key, value);
  anchor.textContent = "link";
  document.body.append(anchor);
  const event = new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  anchor.dispatchEvent(event);
  // `navigate` is dispatched via `Runtime.runFork`; let the microtask flush.
  await Promise.resolve();
  return event;
}

afterEach(async () => {
  if (scope !== undefined) await Effect.runPromise(Scope.close(scope, Exit.void));
});

describe("installLinkInterceptor", () => {
  test("L1: a plain same-origin click to a matching route is intercepted (SPA nav)", async () => {
    await install("http://localhost/");
    const event = await clickAnchor({ href: "/about" });
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(navigations, ["/about"]);
  });

  test("L1: a path-param route (with query) round-trips into navigate", async () => {
    await install("http://localhost/");
    const event = await clickAnchor({ href: "/users/42?tab=x" });
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(navigations, ["/users/42?tab=x"]);
  });

  describe("L2: falls through (no preventDefault, no navigate)", () => {
    beforeEach(() => install("http://localhost/"));

    test("modified click (meta/ctrl/shift/alt or non-left button)", async () => {
      for (const init of [
        { metaKey: true },
        { ctrlKey: true },
        { shiftKey: true },
        { altKey: true },
        { button: 1 },
      ]) {
        const event = await clickAnchor({ href: "/about" }, init);
        assert.equal(event.defaultPrevented, false);
      }
      assert.deepEqual(navigations, []);
    });

    test("target=_blank, download, and rel=external", async () => {
      const blank = await clickAnchor({ href: "/about", target: "_blank" });
      const download = await clickAnchor({ href: "/about", download: "" });
      const external = await clickAnchor({ href: "/about", rel: "external" });
      assert.equal(blank.defaultPrevented, false);
      assert.equal(download.defaultPrevented, false);
      assert.equal(external.defaultPrevented, false);
      assert.deepEqual(navigations, []);
    });

    test("external origin", async () => {
      const event = await clickAnchor({ href: "https://example.com/about" });
      assert.equal(event.defaultPrevented, false);
      assert.deepEqual(navigations, []);
    });

    test("a non-matching href", async () => {
      const event = await clickAnchor({ href: "/nope" });
      assert.equal(event.defaultPrevented, false);
      assert.deepEqual(navigations, []);
    });

    test("an empty / missing href", async () => {
      const event = await clickAnchor({ href: "" });
      assert.equal(event.defaultPrevented, false);
      assert.deepEqual(navigations, []);
    });

    test("a click outside any anchor", async () => {
      const div = document.createElement("div");
      document.body.append(div);
      const event = new dom.window.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
      div.dispatchEvent(event);
      await Promise.resolve();
      assert.equal(event.defaultPrevented, false);
      assert.deepEqual(navigations, []);
    });
  });

  test("L2: same-document navigation (hash-only / identical URL) is not intercepted", async () => {
    await install("http://localhost/about");
    // Hash on the current page → browser handles the in-page anchor, hash preserved.
    const hash = await clickAnchor({ href: "/about#section" });
    // A link to the exact current URL → no duplicate history entry.
    const same = await clickAnchor({ href: "/about" });
    assert.equal(hash.defaultPrevented, false);
    assert.equal(same.defaultPrevented, false);
    assert.deepEqual(navigations, []);
  });

  test("L3: the listener is removed when the layer scope closes", async () => {
    await install("http://localhost/");
    await Effect.runPromise(Scope.close(scope, Exit.void));
    const event = await clickAnchor({ href: "/about" });
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual(navigations, []);
  });
});

describe("base path (base.specs.md)", () => {
  test("AC: an href under the base is intercepted and navigates canonically", async () => {
    await install("http://localhost/weft/", "/weft");
    const event = await clickAnchor({ href: "/weft/about" });
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(navigations, ["/about"]);
  });

  test("AC: a same-origin href outside the base falls through to the browser", async () => {
    await install("http://localhost/weft/", "/weft");
    const event = await clickAnchor({ href: "/outside" });
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual(navigations, []);
  });
});
