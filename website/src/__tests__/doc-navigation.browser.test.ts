/**
 * End-to-end browser test for doc→doc client navigation
 * (spec: `packages/router/src/resolve-before-commit.specs.md`, AC10).
 *
 * Mounts the real website `App` (real routes, real `DocsLive` backed by the
 * per-doc `import()` chunks the docs plugin emits) and navigates between two
 * docs. The router pre-runs the doc leaf — `yield* docs.load(...)` and the
 * doc-page chunk both resolve **before** the commit — so no animation frame
 * across the transition may see the content region empty. Sampled per
 * `requestAnimationFrame`, not per DOM mutation: the renderer's region swap can
 * interleave Effect microtask yields between removal and insertion within one
 * macrotask, which a MutationObserver records but which never paints (spec
 * AC10). This encodes the measured pre-fix regression (a ~1-RTT painted blank
 * on first visit to a doc) as a permanent test.
 */

import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "../app";
import { DocsLive } from "../lib/docs-live";

let container: HTMLElement;
let app: WeftApp.WeftApp<any, any> | undefined;

const FIRST = "/docs/tutorial/01-your-first-app";
const SECOND = "/docs/tutorial/02-reactivity";

beforeEach(() => {
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
  window.history.replaceState(null, "", FIRST);
});

afterEach(async () => {
  if (app !== undefined) await Effect.runPromise(WeftApp.dispose(app));
  app = undefined;
  container.remove();
  window.history.replaceState(null, "", "/");
});

describe("doc→doc navigation never blanks the content region (AC10)", () => {
  it("keeps the current doc mounted while the next doc's chunk + tree resolve", async () => {
    app = WeftApp.make(RouterLive(App, { context: DocsLive }));
    // Client-first mount at the first doc (no SSR markup in this test).
    await Effect.runPromise(WeftApp.mount(app, RouterApp(App), container));

    // The first doc's content is rendered.
    await vi.waitFor(
      () => expect(container.querySelector("article h1")?.textContent).toBeTruthy(),
      { timeout: 10_000 },
    );
    const firstTitle = container.querySelector("article h1")?.textContent;

    // Sample the article on every animation frame: no frame across the
    // transition may see it empty (a painted blank — spec AC10).
    const article = container.querySelector("article")!;
    let sawEmptyFrame = false;
    let sampling = true;
    const sample = (): void => {
      if (!sampling) return;
      if ((article.textContent ?? "").trim().length === 0) {
        sawEmptyFrame = true;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);

    // Navigate to a doc whose tree chunk has not been fetched yet.
    const link = container.querySelector<HTMLAnchorElement>(`a[href='${SECOND}']`);
    expect(link).not.toBeNull();
    link!.click();

    await vi.waitFor(
      () => {
        const title = container.querySelector("article h1")?.textContent;
        expect(title).toBeTruthy();
        expect(title).not.toBe(firstTitle);
      },
      { timeout: 10_000 },
    );
    // Let one more frame pass so the post-commit state is sampled too.
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    sampling = false;

    expect(sawEmptyFrame).toBe(false);
    expect(window.location.pathname).toBe(SECOND);
  });
});
