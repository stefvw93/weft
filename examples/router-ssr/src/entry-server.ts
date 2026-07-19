/**
 * Server entry: renders the matched route to a hydratable HTML document.
 *
 * `documentShell` is the typed document shell `Node`. It builds `<html>/<head>/
 * <body>` with the `#root` mount point and the client entry `<script>`, splicing
 * the app via `yield* Router.Outlet` (injected per request by `RouterServer`).
 * `RouterServer` matches the request URL, renders `RouterApp(App)` inside the
 * shell to hydratable HTML, and reports the status (404 for not-found).
 * `<!DOCTYPE html>` is prepended by `RouterServer`.
 *
 * Both `render` (returning `{ html, status }`) and the `effect/unstable/http`-style
 * `handler` (`Request → Response`, via `RouterServer.toWebHandler`) are exported;
 * the dev server uses `handler` and post-processes the HTML for Vite HMR.
 */

import { Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { RouterServer } from "@weftui/router/server";
import { Effect } from "effect";
import { App } from "./app";
import { StockLive, StockRpcs } from "./data/inventory";

/** The app's `Boundary.rpc` foundation: the shared contract + its server handlers. */
const rpc = { group: StockRpcs, handlers: StockLive } as const;

/**
 * The document shell `component` thunk. Splices the app via `yield* Router.Outlet`
 * (the router injects it per request), the same callback form as a route/layout
 * `component`, no `app` arg and no `Node<any, any>`.
 */
export const documentShell = Component.gen(function* () {
  const app = yield* Router.Outlet;
  return yield* h.html({ lang: "en" }, [
    h.head([
      h.meta({ charset: "utf-8" }),
      h.meta({ name: "viewport", content: "width=device-width, initial-scale=1" }),
      h.title("Weft shop: router SSR"),
    ]),
    h.body([
      h.div({ id: "root" }, [app]),
      h.script({ type: "module", src: "/src/entry-client.ts" }),
    ]),
  ]);
});

/** Renders `url` to `{ html, status }`. */
export const render = (url: string): Promise<{ html: string; status: number }> =>
  Effect.runPromise(RouterServer.render(App, { document: documentShell, rpc, url }));

/** A Web `fetch`-style handler rendering the matched route to `text/html`. */
export const handler = RouterServer.toWebHandler(App, { document: documentShell, rpc });
