/**
 * Server entry: the app's routes as one Effect `HttpRouter` Layer.
 *
 * The default export is what the `weft()` Vite plugin serves in dev and what
 * `main.ts` launches in production. `RouterServer.layer` registers the page
 * routes, the not-found fallback and `POST /_eui/rpc` into the ambient
 * `HttpRouter`; the `StockLive` handler Layer is provided once and shared by
 * every request.
 *
 * `documentShell` is the typed document shell `Node`. It builds `<html>/<head>/
 * <body>` with the `#root` mount point, splicing the app via `yield* Router.Outlet`
 * (injected per request by `RouterServer`). `ClientAssets()` renders the script and
 * stylesheet tags for the current mode, so the shell never names a file itself.
 * `<!DOCTYPE html>` is prepended by `RouterServer`.
 */

import { Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { RouterServer } from "@weftui/router/server";
import { Layer } from "effect";
import { ClientAssets } from "virtual:weft/assets";
import { App } from "./app";
import { StockLive, StockRpcs } from "./data/inventory";

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
      ClientAssets(),
    ]),
    h.body([h.div({ id: "root" }, [app])]),
  ]);
});

/** The app's server routes, with the rpc handlers provided. */
export default RouterServer.layer(App, { document: documentShell, rpc: StockRpcs }).pipe(
  Layer.provide(StockLive),
);
