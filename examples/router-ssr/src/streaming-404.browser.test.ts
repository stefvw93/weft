/**
 * End-to-end browser test for hydrating a **streamed soft-404** document
 * (router spec SW8): a page whose `Boundary.suspend` child raises
 * `RouterNotFound` after the shell has flushed is patched (HTTP 200) with the
 * notFound page plus a `noindex` robots meta. Hydrating that document
 * must converge on the canonical client notFound page via `RouterApp`'s
 * boundary, with no `HydrationMismatchError` and no re-run of the failed
 * loader.
 *
 * The flow mirrors production exactly: `RouterServer.toStreamingWebHandler`
 * renders the route, the shell is installed into `#root`, the trailing patch
 * chunks are applied by appending **real** `<script>` nodes (innerHTML-inserted
 * scripts never execute), and `hydrate(RouterApp(def), container)` runs over
 * the substituted DOM. Asserts the headline behaviour:
 *   (a) the notFound page is visible after hydration (boundary swap: the
 *       server layout chrome inside the suspense region is replaced),
 *   (b) the suspended loader did not re-run on the client,
 *   (c) `meta[name=robots][content=noindex]` is present in `document.head`,
 *   (d) no hydration-mismatch error was logged, and
 *   (e) the page is interactive, since clicking the notFound page's link performs
 *       an intercepted client-side navigation (no full reload).
 */

import { Component, Boundary, h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { notFound, type RouterDef } from "@weftui/router";
import { Router, RouterApp, RouterLive } from "@weftui/router/client";
import { RouterServer } from "@weftui/router/server";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/** Counts client-side runs of the suspended loader; must stay at 0 on hydrate. */
let loaderRuns = 0;

/** `/`: a static landing page (the notFound link's target). */
const homeRoute = Router.route("", {
  component: () => h.div([h.span({ id: "home" }, "home")]),
});

/** `/late`: raises `RouterNotFound` inside `Boundary.suspend` (after flush). */
const lateRoute = Router.route("late", {
  component: () =>
    h.div({ id: "late-layout" }, [
      h.h1({}, "Late page"),
      Boundary.suspend({ fallback: h.p({ id: "loading" }, "loading…") }, [
        Effect.suspend(() => {
          loaderRuns++;
          return notFound("/late");
        }),
      ]),
    ]),
});

const def: RouterDef = Router.router(
  Router.layout(
    {
      component: Component.gen(function* () {
        const outlet = yield* Router.Outlet;
        return yield* h.div({ id: "app" }, [outlet]);
      }),
    },
    [homeRoute, lateRoute],
  ),
  {
    notFound: () =>
      h.section({ id: "nf" }, [h.h2({}, "404: not found"), h.a({ href: "/" }, "go home")]),
  },
);

/** The document shell, which splices the app via the injected `Router.Outlet`. */
const documentShell = Component.gen(function* () {
  const app = yield* Router.Outlet;
  return yield* h.html([h.head([h.title({}, "soft-404")]), h.body([h.div({ id: "root" }, [app])])]);
});

let container: HTMLElement;
let app: WeftApp.WeftApp<Router> | undefined;

beforeEach(() => {
  loaderRuns = 0;
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
});

afterEach(async () => {
  if (app !== undefined) await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
  document.head.querySelector('meta[name="robots"]')?.remove();
  window.history.replaceState(null, "", "/");
});

/**
 * Applies the streamed patch chunks: templates are inserted as-is; each patch
 * `<script>` is re-created via `document.createElement` so it actually executes
 * (innerHTML-inserted scripts are inert per the HTML spec). The patch scripts
 * remove themselves and their template after the swap.
 */
function applyPatches(patchesHtml: string): void {
  const holder = document.createElement("div");
  holder.innerHTML = patchesHtml;
  for (const node of Array.from(holder.childNodes)) {
    if (node instanceof HTMLScriptElement) {
      const script = document.createElement("script");
      script.textContent = node.textContent;
      document.body.append(script);
    } else {
      document.body.append(node);
    }
  }
  holder.remove();
}

/** Streams `url` through the real handler, installs shell + patches into `#root`. */
async function installStreamedDocument(url: string): Promise<void> {
  const streaming = RouterServer.toStreamingWebHandler(def, { document: documentShell });
  const res = await streaming(new Request(`http://localhost${url}`));
  expect(res.status).toBe(200);
  const body = await res.text();

  // The shell is everything up to </html>; the patch chunks follow it.
  const splitAt = body.indexOf("</html>") + "</html>".length;
  const shellHtml = body.slice(0, splitAt);
  const patchesHtml = body.slice(splitAt);
  expect(patchesHtml).toContain("data-weft-suspense-failure");

  const shellDoc = new DOMParser().parseFromString(shellHtml, "text/html");
  container.innerHTML = shellDoc.getElementById("root")?.innerHTML ?? "";
  applyPatches(patchesHtml);
}

describe("router-ssr: streamed soft-404 hydration (SW8)", () => {
  it("hydrates to the notFound page via RouterApp's boundary: no mismatch, no loader re-run", async () => {
    await installStreamedDocument("/late");

    // The substituted server DOM: layout chrome + notFound UI inside the region.
    expect(container.querySelector("#late-layout")).not.toBeNull();
    expect(container.querySelector("#nf")).not.toBeNull();
    // The patch injected the soft-404 robots meta.
    expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull();

    const consoleErrors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(" "));
      originalError(...args);
    };

    try {
      // The streaming handler ran in-process above, so SSR itself executed the
      // loader once; reset so the counter observes only client-side re-runs.
      loaderRuns = 0;
      window.history.replaceState(null, "", "/late");
      app = WeftApp.make(RouterLive(def));
      await Effect.runPromise(WeftApp.hydrate(app, RouterApp(def), container));

      // (a) The boundary swap converges on the canonical client notFound page:
      //     the server layout chrome disappears, the notFound page remains.
      await vi.waitFor(() => {
        expect(container.querySelector("#late-layout")).toBeNull();
        expect(container.querySelector("#nf")).not.toBeNull();
      });

      // (b) The failed loader was not re-run on the client (sentinel replay).
      expect(loaderRuns).toBe(0);

      // (c) The noindex meta is untouched by the swap.
      expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull();

      // (d) No hydration mismatch / divergence was logged.
      const mismatches = consoleErrors.filter((line) => /mismatch|diverged/i.test(line));
      expect(mismatches).toEqual([]);

      // (e) Interactive: the notFound page's link performs an intercepted
      //     client-side navigation (URL changes, no full page load).
      const link = container.querySelector<HTMLAnchorElement>('#nf a[href="/"]');
      expect(link).not.toBeNull();
      link!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await vi.waitFor(() => {
        expect(window.location.pathname).toBe("/");
      });
    } finally {
      console.error = originalError;
    }
  });
});
