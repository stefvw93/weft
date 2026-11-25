/**
 * Document shell.
 *
 * Builds `<html>/<head>/<body>` with the `#root` mount point, splicing the app via
 * `yield* Router.Outlet` (injected per request by `RouterServer`). The `<title>` and
 * meta description are derived per request from the current route's doc frontmatter
 * (read from the `Docs` service, provided to the routes Layer).
 *
 * `ClientAssets()` (from the `weft()` Vite plugin) renders the client entry script
 * and stylesheet tags for the current mode: Vite's client and the source entry in
 * dev, the hashed entry and CSS in a build. The shell never names a file itself.
 */

import { Component, h, Subscribable } from "@weftui/core";
import { Router } from "@weftui/router";
import { ClientAssets } from "virtual:weft/assets";
import { Docs, type DocsService } from "../lib/docs-service";

/** Default landing meta for non-doc routes. */
const DEFAULT_META = {
  title: "Weft: Reactive UI, woven from Effect",
  description: "An Effect-native reactive DOM library.",
} as const;

/** Strips the query string from a normalized request URL. */
function pathnameOf(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/** Per-route `<title>` and meta description, from the current doc's frontmatter. */
function metaFor(path: string, get: DocsService["get"]): { title: string; description?: string } {
  const parts = path.split("/").filter((p) => p.length > 0);
  const doc =
    parts[0] === "docs" && parts[1] !== undefined && parts[2] !== undefined
      ? get(parts[1], parts[2])
      : undefined;
  if (doc === undefined) return { ...DEFAULT_META };
  return { title: `${doc.frontmatter.title} · Weft`, description: doc.frontmatter.description };
}

/** The document shell `component`. */
export const documentShell = Component.gen(function* () {
  const docs = yield* Docs;
  const router = yield* Router;
  const match = yield* Subscribable.get(router.currentMatch);
  const meta = metaFor(pathnameOf(match.url), docs.get);
  const outlet = yield* Router.Outlet;

  // `class="dark"` resolves the Radix dark-scale vars (scoped to `.dark, .dark-theme`)
  // and `data-theme="weft-dark"` selects the DaisyUI theme. See design-system.specs.md.
  return yield* h.html({ lang: "en", class: "dark", "data-theme": "weft-dark" }, [
    h.head([
      h.meta({ charset: "utf-8" }),
      h.meta({ name: "viewport", content: "width=device-width, initial-scale=1" }),
      h.link({ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }),
      h.title(meta.title),
      ...(meta.description === undefined
        ? []
        : [h.meta({ name: "description", content: meta.description })]),
      ClientAssets(),
    ]),
    h.body([
      h.main({ id: "root" }, [outlet]),
      h.script({
        "data-goatcounter": "https://weft.goatcounter.com/count",
        async: true,
        src: "//gc.zgo.at/count.js",
      }),
    ]),
  ]);
});
