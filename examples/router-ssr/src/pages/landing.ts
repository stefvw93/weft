/**
 * `/`: the shop landing page.
 *
 * A static marketing page: a hero, a call-to-action into the listing, and a
 * "featured" grid reusing {@link ProductCard}. `Component.make` keeps the body
 * (and its `href` calls) deferred until the router renders it, after
 * `Router.router(...)` has compiled the tree and stamped the leaf registry.
 */

import { Component, h } from "@weftui/core";
import { href, Router } from "@weftui/router";
import { ProductCard } from "../components/product-card";
import { PRODUCTS } from "../data/products";
import { productsRoute } from "./listing";

/** The first three catalog items, shown as "featured" on the landing page. */
const featured = PRODUCTS.slice(0, 3);

/** `/`: hero + CTA + featured product grid. */
export const homeRoute = Router.route("", {
  component: Component.make(() =>
    h.section({ id: "page", class: "landing" }, [
      h.h2("Brew better coffee"),
      h.p("A tiny shop demonstrating SSR routing with @weftui/router."),
      h.p([h.a({ href: href(productsRoute), class: "cta" }, "Shop all products →")]),
      h.h3("Featured"),
      h.div(
        { id: "featured", class: "grid" },
        featured.map((product) => ProductCard({ product })),
      ),
    ]),
  ),
});
