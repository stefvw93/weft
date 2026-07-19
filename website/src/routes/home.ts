/**
 * Landing page (`/`).
 *
 * The marketing home: states Weft's value proposition and proves it with a live
 * `reactive-counter` demo. Hand-authored (not markdown-sourced), minimal technical
 * aesthetic. Uses the document shell but **not** the `DocsShell` (no sidebar/TOC).
 * The code teaser is highlighted at build time via `virtual:weft-home-snippet` and
 * rendered through the shared `renderHast` → `CodeBlock` path.
 */

import { h } from "@weftui/core";
import type { Node, Renderable } from "@weftui/core";
import { Router } from "@weftui/router";
import { tree as snippetTree } from "virtual:weft-home-snippet";
import { ReactiveCounter } from "../demos/reactive-counter";
import { renderHast } from "../lib/render-hast";

/** Repo URL for GitHub links. */
const REPO_URL = "https://github.com/stefvw93/weft";
/** Primary CTA target: the first step of the tutorial. */
const GETTING_STARTED = "/docs/tutorial/01-your-first-app";

/** The differentiators row content. */
const DIFFERENTIATORS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "No virtual DOM",
    body: "Streams update the DOM directly: no diffing, no reconciliation.",
  },
  {
    title: "No JSX, no plugins",
    body: "Plain h.* calls; components are functions you call. No build-time transform.",
  },
  {
    title: "Effect-native",
    body: "Every node is an Effect<…, E, R>: error and requirement channels flow through the tree.",
  },
  {
    title: "Flash-free SSR",
    body: "Server and client render identical trees; hydrate() resumes reactivity in place.",
  },
];

/** Hero: tagline, value prop, primary + GitHub CTAs. */
function Hero(): Renderable {
  return h.section({ class: "mb-10 text-center flex flex-col gap-6" }, [
    h.img({ src: "/logo.svg", alt: "Weft logo", class: "mx-auto h-10 w-auto" }),
    h.div({ class: "flex flex-col gap-1" }, [
      h.h1({ class: "text-6xl leading-[1.1] tracking-tight" }, "Weft"),
      h.h2({ class: "text-xl leading-[1.1] tracking-tight" }, "Reactive UI, woven from Effect"),
    ]),

    h.div({ class: "flex justify-center gap-3" }, [
      h.a({ href: GETTING_STARTED, class: "btn btn-primary" }, "Get started"),
      h.a(
        { href: REPO_URL, class: "btn btn-outline", target: "_blank", rel: "noreferrer" },
        "GitHub",
      ),
    ]),
  ]);
}

/** Live hero demo: the real reactive-counter, interactive after hydrate. */
function LiveDemo(): Renderable {
  // `home-demo` is a semantic test hook.
  return h.section({ class: "home-demo mx-auto mb-14 flex flex-col items-center gap-3 p-7" }, [
    h.p(
      {
        class:
          "text-base md:text-[1.1rem] leading-relaxed text-slate-11 whitespace-pre-line md:whitespace-pre text-center",
      },
      [
        "Weft is an ",
        h.a({ href: "https://effect.website", target: "_blank", class: "underline" }, "Effect"),
        "-native reactive DOM library.\nStreams drive every update, on the server and in the browser.",
      ],
    ),
    h.div(
      { class: "text-[0.78rem] uppercase tracking-wider text-slate-11" },
      "Live: click to increment",
    ),
    ReactiveCounter(),
  ]);
}

/** Differentiators row. */
function Differentiators(): Renderable {
  return h.section(
    { class: "mb-14 grid grid-cols-1 gap-4 sm:grid-cols-2" },
    DIFFERENTIATORS.map((item) =>
      h.div({ class: "card bg-base-200" }, [
        h.div({ class: "card-body" }, [
          h.h3({ class: "card-title text-base" }, item.title),
          h.p({ class: "text-[0.9rem] leading-relaxed text-slate-11" }, item.body),
        ]),
      ]),
    ),
  );
}

/** Annotated code teaser, highlighted at build time. */
function CodeTeaser(): Renderable {
  // `home-teaser` is a semantic test hook.
  return h.section({ class: "home-teaser" }, [
    h.h2({ class: "mb-3 text-xl" }, "A component is a function. State is a stream."),
    h.div({}, renderHast(snippetTree)),
  ]);
}

/** Footer: links + early-development note. */
function Footer(): Renderable {
  return h.footer({ class: "mt-16 border-t border-slate-6 pt-6 text-center" }, [
    h.nav(
      {
        class:
          "mb-3 flex justify-center gap-5 [&_a]:text-[0.9rem] [&_a]:text-indigo-11 [&_a]:no-underline",
      },
      [
        h.a({ href: GETTING_STARTED }, "Docs"),
        h.a({ href: "/docs/reference/core" }, "API"),
        h.a({ href: REPO_URL, target: "_blank", rel: "noreferrer" }, "GitHub"),
      ],
    ),
    h.p({ class: "text-[0.8rem] text-slate-11" }, "Weft is in early development. APIs may change."),
  ]);
}

/** The landing page component (no props; full-width, no DocsShell). */
export const HomePage = (): Node =>
  h.div({ class: "mx-auto max-w-4xl px-5 pb-20 pt-16" }, [
    Hero(),
    LiveDemo(),
    Differentiators(),
    CodeTeaser(),
    Footer(),
  ]);

/** The `/` route. */
export const Home = Router.route("", { component: HomePage });
