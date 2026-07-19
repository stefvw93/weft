/**
 * End-to-end browser test for the website rendering path.
 *
 * Exercises a DocPage in a real browser: render a doc tree (heading, prose, and a
 * `demo=reactive-counter` block) to hydratable HTML as the server does, install it as
 * the container markup, confirm the prose and the demo's server-rendered initial value
 * are present before any client JS runs, then `hydrate` over it and verify the live
 * demo becomes interactive in place. Covers the overview spec's AC7 (a DocPage render
 * plus a live-demo interaction).
 */

import { AppRpcClientTag, Component, h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { renderToStringHydratable } from "@weftui/dom/server";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { DocMeta, HastRoot } from "../lib/markdown-loader";
import { renderHast } from "../lib/render-hast";
import { DocPage } from "../routes/doc-page";

// The render fns require an `AppRpcClientTag` unconditionally; this page has no
// `Boundary.rpc`, so discharge it with a no-op that dies if ever called.
const NoRpc = Layer.succeed(AppRpcClientTag, {
  call: () => Effect.die(new Error("no rpc in this test")),
});

/** A doc tree: a heading, a paragraph, and a `demo=reactive-counter` code block. */
const tree: HastRoot = {
  type: "root",
  children: [
    {
      type: "element",
      tagName: "h1",
      properties: {},
      children: [{ type: "text", value: "Reactive Counter" }],
    },
    {
      type: "element",
      tagName: "p",
      properties: {},
      children: [{ type: "text", value: "Click to increment." }],
    },
    {
      type: "element",
      tagName: "pre",
      properties: { dataLang: "ts", dataRaw: "Counter();", dataDemo: "reactive-counter" },
      children: [
        {
          type: "element",
          tagName: "code",
          properties: {},
          children: [{ type: "text", value: "Counter();" }],
        },
      ],
    },
  ],
};

/** The demo DocPage node (deterministic, so server and client trees align for hydration). */
const DemoDocPage = () => h.article({ class: "docs-content" }, renderHast(tree));

let container: HTMLElement;
let app: WeftApp.WeftApp | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  if (app) await Effect.runPromise(WeftApp.dispose(app));
  app = undefined;
  container.remove();
});

describe("website DocPage + live demo (browser)", () => {
  it("renders prose and a live demo on the server, then hydrates to interactivity", async () => {
    // 1. Server-render to hydratable HTML and install it as the static markup.
    const html = await Effect.runPromise(
      Effect.provide(renderToStringHydratable(DemoDocPage()), NoRpc),
    );
    container.innerHTML = html;

    // 2. DocPage render: prose is present before any client JS runs.
    expect(container.querySelector("h1")?.textContent).toContain("Reactive Counter");
    expect(container.textContent).toContain("Click to increment.");

    // 3. The live demo's preview is server-rendered at its initial value.
    const value = () => container.querySelector(".counter-value");
    expect(value()?.textContent).toContain("0");

    // 4. Hydrate over the server markup; the demo becomes interactive in place.
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.hydrate(app, DemoDocPage(), container));
    const increment = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Increment",
    );
    expect(increment).toBeDefined();

    increment!.click();
    await vi.waitFor(() => expect(value()?.textContent).toContain("1"));
  });
});

describe("per-route doc-data split — flash-free lazy hydration (browser)", () => {
  /** A doc's metadata (no tree) for the split `Docs` service. */
  const introMeta: DocMeta = {
    slug: "intro",
    category: "tutorial",
    path: "tutorial/intro",
    frontmatter: { title: "Intro", order: 0, section: "tutorial" },
    headings: [],
  };

  /** The doc's heavy tree — the payload a per-doc chunk carries, fetched async by `loadTree`. */
  const introTree: HastRoot = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "h1",
        properties: {},
        children: [{ type: "text", value: "Intro" }],
      },
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [{ type: "text", value: "Lazily loaded body." }],
      },
    ],
  };

  // A route component whose body resolves **asynchronously**, exactly as `Docs.load`
  // does when it awaits a per-doc chunk's dynamic `import()`. This is the property the
  // split relies on: a bare async component (no Suspense/Boundary) must hydrate the
  // server DOM in place with no fallback flash. (`Docs.load` memo/undefined logic is
  // covered in `docs-service.test.ts`.)
  const IntroRoute = () =>
    Component.gen(function* () {
      const tree = yield* Effect.promise(() => Promise.resolve(introTree));
      return yield* DocPage({ ...introMeta, tree });
    })({});

  it("AC3: server-rendered doc body survives hydration in place with no flash", async () => {
    // Server render (awaits the async body) → install as static markup.
    const html = await Effect.runPromise(
      Effect.provide(renderToStringHydratable(IntroRoute()), NoRpc),
    );
    container.innerHTML = html;
    const bodyText = () => container.querySelector("p")?.textContent;
    expect(container.querySelector("h1")?.textContent).toContain("Intro");
    expect(bodyText()).toContain("Lazily loaded body.");

    // The server-rendered <p> node — capture identity to prove hydration adopts it in place.
    const serverP = container.querySelector("p");

    // Hydrate over the markup; the async body resolves during hydrate.
    app = WeftApp.make(NoRpc);
    await Effect.runPromise(WeftApp.hydrate(app, IntroRoute(), container));

    // Content is unchanged and the original DOM node was adopted (not re-created) → no flash.
    expect(bodyText()).toContain("Lazily loaded body.");
    expect(container.querySelector("p")).toBe(serverP);
  });
});
