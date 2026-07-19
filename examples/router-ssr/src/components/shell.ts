/**
 * `Shell`: the root layout wrapping every page.
 *
 * It renders the persistent shop chrome (header with brand + nav, footer) and
 * splices the active page via `yield* Router.Outlet`. As the outermost layout it
 * never re-renders across navigations, so its DOM node is stable for the whole
 * session; the navigation test asserts this directly. The nav uses
 * `href(productsRoute)` (no args, since its query is optional) for a type-safe link.
 */

import { Component, h } from "@weftui/core";
import { href, Router } from "@weftui/router";
import { Stream } from "effect";
import { productsRoute } from "../pages/listing";

/** The persistent header/nav/footer chrome around the routed outlet. */
export const Shell = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  // A top progress bar driven by the router's navigation state: it gains
  // `is-navigating` while a deferred-commit navigation resolves a lazy chunk, and is
  // idle otherwise (`pending-navigation.specs.md`). This app's routes are eager, so
  // it stays idle here. It demonstrates the `Router.navigating` wiring an app adds
  // once it code-splits a route with `Router.lazy`.
  const nav = yield* Router.navigatingStream;
  return yield* h.div({ id: "app" }, [
    h.div({
      id: "nav-progress",
      "aria-hidden": "true",
      class: Stream.map(nav.changes, (s) =>
        s._tag === "Navigating" ? "nav-progress is-navigating" : "nav-progress",
      ),
    }),
    h.header({ id: "shell-header" }, [
      h.strong("Weft shop"),
      h.nav([h.a({ href: "/" }, "Home"), " · ", h.a({ href: href(productsRoute) }, "Products")]),
    ]),
    h.main([outlet]),
    h.footer("built with @weftui/router: SSR + hydration"),
  ]);
});
