/**
 * Docs shell layout.
 *
 * The persistent chrome around every documentation page: a top bar, a left sidebar
 * nav, the center content (the router outlet), a right "On this page" TOC, and a
 * prev/next footer. Authored as a `Router.layout` **component** so it stays mounted
 * across doc-to-doc navigations — the route phase wraps it with the doc/api routes
 * via `Router.layout({ component: DocsShell }, [...])`.
 *
 * The active link, TOC, and prev/next all derive from the **current route path**,
 * read reactively from `Router.currentMatch` so a navigation updates them in place
 * without remounting the shell. Internal links are plain same-origin paths, which
 * `RouterLive` intercepts for SPA navigation on the client.
 */

import { Component, h } from "@weftui/core";
import type { Renderable } from "@weftui/core";
import { Router } from "@weftui/router";
import { Stream, SubscriptionRef } from "effect";
import { Docs, type DocsService } from "../lib/docs-service";
import type { DocHeading } from "../lib/markdown-loader";
import type { NavGroup, NavNeighbours } from "../lib/nav";
import { withBase } from "../lib/site-base";

/** Repo URL for the top-bar GitHub link. */
const REPO_URL = "https://github.com/stefvw93/weft";
/** Version label shown in the top bar — latest release tag, injected at build time. */
const VERSION = __WEFT_VERSION__;

/** Strips the query string from a normalized request URL, yielding the pathname. */
function pathnameOf(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/**
 * The static top bar: wordmark, version, GitHub link, and an inert search placeholder.
 *
 * When passed the optional `nav` control, the row leads with a hamburger button that
 * toggles the mobile sidebar drawer; it is hidden at `md`+ where the sidebar is inline.
 */
export function TopBar(nav?: { open: Stream.Stream<boolean>; onToggle: () => void }): Renderable {
  return h.header(
    {
      class: "sticky top-0 z-10 border-b border-slate-6 bg-slate-1",
      style: { height: "var(--top-bar-height)" },
    },
    [
      h.div({ class: "mx-auto flex h-13 w-full max-w-336 items-center gap-4 px-5" }, [
        nav
          ? h.button(
              {
                type: "button",
                class: "btn btn-ghost btn-sm md:hidden",
                "aria-label": "Toggle navigation",
                "aria-controls": "docs-drawer",
                "aria-expanded": Stream.map(nav.open, (o) => (o ? "true" : "false")),
                onclick: nav.onToggle,
              },
              "≡",
            )
          : null,
        h.a(
          {
            href: withBase("/"),
            class: "flex items-center gap-2 text-lg font-bold text-slate-12 no-underline",
          },
          [h.img({ src: withBase("/logo.svg"), alt: "", class: "h-4 w-auto" }), "Weft"],
        ),
        h.div({ class: "flex-1" }),
        h.span({ class: "text-xs tabular-nums text-slate-11" }, VERSION),
        // h.input({
        //   type: "search",
        //   class: "input input-bordered input-sm w-56 max-w-[40vw]",
        //   placeholder: "Search (coming soon)",
        //   disabled: true,
        //   "aria-label": "Search (coming soon)",
        // }),
        h.a(
          { href: REPO_URL, class: "btn btn-ghost btn-sm", target: "_blank", rel: "noreferrer" },
          "GitHub",
        ),
      ]),
    ],
  );
}

/** Base utilities shared by every sidebar link (`docs-nav-link` is the test hook). */
const NAV_LINK_BASE = "docs-nav-link block rounded-md px-2.5 py-1 text-[0.88rem] no-underline";

/**
 * Renders the grouped sidebar nav, marking the link that matches `activePath`.
 *
 * When `onClose` is supplied, each link fires it on click so the mobile drawer closes
 * on navigation; it does not `preventDefault`, so the router's SPA interception still
 * runs, and at `md`+ (drawer force-open) closing the state is a harmless no-op.
 */
export function renderSidebar(
  groups: readonly NavGroup[],
  activePath: string,
  onClose?: () => void,
): Renderable {
  return h.nav(
    { "aria-label": "Documentation" },
    groups.map((group) =>
      h.div({ class: "mb-5" }, [
        h.h3({ class: "mb-1.5 text-xs uppercase tracking-wider text-slate-11" }, group.label),
        h.ul(
          { class: "m-0 list-none p-0" },
          group.links.map((link) => {
            const active = link.path === activePath;
            // Active state is carried by `aria-current="page"` (the test hook) plus
            // indigo utilities; inactive links get the muted slate hover treatment.
            const cls = active
              ? `${NAV_LINK_BASE} bg-indigo-4 font-semibold text-indigo-11`
              : `${NAV_LINK_BASE} text-slate-11 hover:bg-slate-3 hover:text-slate-12`;
            return h.li([
              h.a(
                {
                  href: withBase(link.path),
                  class: cls,
                  ...(onClose ? { onclick: onClose } : {}),
                  ...(active ? { "aria-current": "page" as const } : {}),
                },
                link.title,
              ),
            ]);
          }),
        ),
      ]),
    ),
  );
}

/** Renders the "On this page" TOC from a doc's h2–h3 headings, or nothing if there are none. */
export function renderToc(headings: readonly DocHeading[]): Renderable {
  const items = headings.filter((heading) => heading.depth <= 3);
  if (items.length === 0) return null;
  return h.nav({ "aria-label": "On this page" }, [
    h.div({ class: "mb-1.5 text-xs uppercase tracking-wider text-slate-11" }, "On this page"),
    h.ul(
      { class: "m-0 list-none border-l border-slate-6 p-0" },
      items.map((item) => {
        // The BEM depth modifier (`--h3`) becomes a computed indent utility.
        const indent = item.depth === 3 ? "pl-6 text-[0.95em]" : "pl-3";
        return h.li([
          h.a(
            {
              href: `#${item.id}`,
              class: `block py-0.5 pr-3 text-slate-11 no-underline hover:text-indigo-11 ${indent}`,
            },
            item.text,
          ),
        ]);
      }),
    ),
  ]);
}

/** Shared layout for one prev/next slot (`docs-prevnext` root is the test hook). */
const PREVNEXT_SLOT =
  "flex min-w-0 flex-col gap-0.5 rounded-lg border border-slate-6 px-3.5 py-2.5 no-underline";

/** Renders the prev/next footer; each side is omitted at the ends of the doc list. */
export function renderPrevNext(neighbours: NavNeighbours): Renderable {
  const { prev, next } = neighbours;
  return h.nav(
    {
      class: "docs-prevnext mt-12 flex justify-between gap-4 border-t border-slate-6 pt-6",
      "aria-label": "Pagination",
    },
    [
      prev === undefined
        ? h.span({ class: `${PREVNEXT_SLOT} hidden` })
        : h.a({ href: withBase(prev.path), class: `prevnext-prev ${PREVNEXT_SLOT}` }, [
            h.span({ class: "text-xs text-slate-11" }, "Previous"),
            h.span({ class: "font-semibold text-indigo-11" }, prev.title),
          ]),
      next === undefined
        ? h.span({ class: PREVNEXT_SLOT })
        : h.a(
            {
              href: withBase(next.path),
              class: `prevnext-next ml-auto text-right ${PREVNEXT_SLOT}`,
            },
            [
              h.span({ class: "text-xs text-slate-11" }, "Next"),
              h.span({ class: "font-semibold text-indigo-11" }, next.title),
            ],
          ),
    ],
  );
}

/** Headings for the doc at a route pathname (empty if none/unknown). */
function headingsForPath(path: string, get: DocsService["get"]): readonly DocHeading[] {
  const parts = path.split("/").filter((p) => p.length > 0);
  const doc =
    parts[0] === "docs" && parts[1] !== undefined && parts[2] !== undefined
      ? get(parts[1], parts[2])
      : undefined;
  return doc?.headings ?? [];
}

/**
 * The docs shell component. Reads the live route path from `Router.currentMatch` and
 * drives the sidebar highlight, TOC, and prev/next reactively from the `Docs` service
 * (injected via the router's render-time `context` seam), while the outlet holds the
 * page content. Wrap with `Router.layout({ component: DocsShell }, [routes])`.
 */
export const DocsShell = Component.gen(function* () {
  const docs = yield* Docs;
  const router = yield* Router;
  const outlet = yield* Router.Outlet;
  const path = Stream.map(router.currentMatch.changes, (match) => pathnameOf(match.url));

  // Mobile sidebar drawer state (source of truth). daisyUI's drawer CSS keys off the
  // hidden checkbox's `:checked`, which we drive from this ref via its `checked`
  // attribute. The checkbox must stay non-dirty for content-attribute → `:checked`
  // reflection to work, so nothing targets it with a `<label for>`; the hamburger is a
  // `<button>` and the overlay a plain `<div>`, both flipping the ref directly.
  const open = yield* SubscriptionRef.make(false);
  const toggle = () => SubscriptionRef.update(open, (o) => !o);
  const close = () => SubscriptionRef.set(open, false);

  // Below `md` the left nav is an off-canvas daisyUI drawer (hamburger-toggled, slides
  // in over a dimmed overlay). At `md`+ `md:drawer-open` turns `.drawer` into a
  // `max-content auto` grid, so the sidebar sits inline exactly as before; the inner
  // grid then splits `main` + the right-hand TOC. The `top-[4.75rem]` offset =
  // 3.25rem topbar + 1.5rem body top padding, so nothing jumps on scroll.
  return yield* h.div({ class: "docs-shell" }, [
    TopBar({ open: open.changes, onToggle: toggle }),
    h.div(
      {
        class: ["drawer md:drawer-open", "mx-auto w-full max-w-[84rem] md:gap-8"].join(" "),
      },
      [
        h.input({
          id: "docs-drawer",
          type: "checkbox",
          class: "drawer-toggle",
          checked: Stream.map(open.changes, (o) => o),
          "aria-hidden": "true",
          tabindex: -1,
        }),
        h.div({ class: "drawer-content min-w-0 p-4" }, [
          h.div({ class: "grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_14rem]" }, [
            h.main({ class: "min-w-0 xl:px-20" }, [
              h.article(
                {
                  class:
                    "docs-content prose prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-indigo-11",
                },
                [outlet],
              ),
              Stream.map(path, (current) => renderPrevNext(docs.nav.findNav(current))),
            ]),
            h.aside(
              {
                class: "self-start text-[0.82rem] hidden lg:block lg:sticky lg:top-[4.75rem]",
              },
              [Stream.map(path, (current) => renderToc(headingsForPath(current, docs.get)))],
            ),
          ]),
        ]),
        h.aside(
          {
            class: ["drawer-side"].join(" "),
            style: {
              maxHeight: "calc(100vh - var(--top-bar-height))",
              top: "var(--top-bar-height)",
            },
          },
          [
            h.div({ class: "drawer-overlay", onclick: close }),
            h.div(
              {
                class: [
                  "w-72 bg-slate-1 p-5 md:min-h-0 md:w-56 md:bg-transparent xl:w-52 p-4",
                  "max-h-full overflow-y-auto",
                ].join(" "),
              },
              [Stream.map(path, (current) => renderSidebar(docs.nav.groups, current, close))],
            ),
          ],
        ),
      ],
    ),
  ]);
});
