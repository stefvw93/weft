/**
 * Universal app definition: side-effect-free.
 *
 * Exports the `Router` def consumed by both entries: `entry-server.ts` renders it
 * to a hydratable HTML document, `entry-client.ts` hydrates and takes over
 * navigation. No `mount`/`hydrate`/`handler` here, so the module is importable by
 * tests and by both build targets without running anything.
 *
 * Route tree: the root layout (outlet plus the global navigation progress bar)
 * holds the landing page (full-width, no sidebar) alongside the `DocsShell`
 * layout, which wraps the doc routes so the chrome persists across doc-to-doc
 * navigation. Every section (tutorial, how-to, explanation, reference) routes
 * uniformly through `/docs/:category/:slug`.
 */

import { Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { Stream } from "effect";
import { DocsShell } from "./layouts/docs-shell";
import { docsIndexRoute, docsRoute } from "./routes/docs";
import { Home } from "./routes/home";
import "./app.css";

/**
 * Kill switch for the navigation progress bar. Disabled for now: the bar is
 * visually rough and flickers on some navigations; flip back to `true` once
 * fixed. While `false` the bar renders permanently idle (invisible) and the
 * co-located browser test is skipped (`__tests__/nav-progress.browser.test.ts`).
 */
const NAV_PROGRESS_ENABLED: boolean = false;

/** Utilities shared by both bar states (`nav-progress` is the test hook). */
const NAV_PROGRESS_BASE =
  "nav-progress pointer-events-none fixed inset-x-0 top-(--top-bar-height) z-30 h-0.5 overflow-hidden";

/**
 * The root layout: the injected outlet plus the global navigation progress bar
 * (see `src/nav-progress.specs.md`). The bar lives here (not in `DocsShell`),
 * so it is mounted during every navigation, including Home → docs where the
 * docs chrome doesn't exist yet. `Router.navigating` flips to `Navigating`
 * only while a deferred-commit navigation has real async work; the 150ms
 * transition delay is the anti-flash guard, so near-instant navigations never
 * paint the bar (`is-navigating` is a semantic test hook, not a style).
 */
const RootLayout = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  const nav = yield* Router.navigatingStream;
  return yield* h.fragment([
    h.div(
      {
        id: "nav-progress",
        "aria-hidden": "true",
        class: Stream.map(nav.changes, (s) =>
          NAV_PROGRESS_ENABLED && s._tag === "Navigating"
            ? `${NAV_PROGRESS_BASE} is-navigating opacity-100 transition-opacity delay-150 duration-0`
            : `${NAV_PROGRESS_BASE} opacity-0`,
        ),
      },
      [
        h.div({
          class:
            "h-full w-2/5 bg-primary animate-nav-progress motion-reduce:w-full motion-reduce:animate-none",
        }),
      ],
    ),
    outlet,
  ]);
});

export const App = Router.router(
  Router.layout({ component: RootLayout }, [
    Home,
    Router.layout({ component: DocsShell }, [docsIndexRoute, docsRoute]),
  ]),
  {
    notFound: () =>
      h.section({ class: "mx-auto max-w-4xl px-5 py-24 text-center" }, [
        h.h2({ class: "mb-4 text-2xl font-semibold" }, "404: page not found"),
        h.p([h.a({ href: "/", class: "text-indigo-11 no-underline" }, "Go home")]),
      ]),
  },
);
