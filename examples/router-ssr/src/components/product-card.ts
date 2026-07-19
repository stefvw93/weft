/**
 * `ProductCard`: a reusable product tile, shared by the landing "featured" grid
 * and the `/products` listing grid.
 *
 * It is a plain `Component.make` called as `ProductCard({ product })` (no JSX),
 * placing its node directly in the tree. The "View" link uses `href(productRoute,
 * …)` so the URL is type-checked against the detail route's `:id` schema.
 *
 * The "View" link is a normal in-app link, so the click is an **SPA navigation**,
 * not a full load: the detail page's `Boundary.rpc` resolves its live stock
 * client-first (fallback → forked rpc call → swap-in) with no SSR payload present.
 * This exercises the client-first mount path the rpc model unlocked.
 */

import { Component, h } from "@weftui/core";
import { href } from "@weftui/router";
import { formatPrice, type Product } from "../data/products";
import { productRoute } from "../pages/product-detail";

/** A single catalog tile linking to its detail page (SPA nav, see above). */
export const ProductCard = Component.make((props: { readonly product: Product }) =>
  h.article({ class: "card", "data-product": props.product.id }, [
    h.div({ class: "card-emoji" }, props.product.emoji),
    h.h3(props.product.name),
    h.p({ class: "card-price" }, formatPrice(props.product.priceCents)),
    h.p({ class: "card-blurb" }, props.product.blurb),
    h.a({ href: href(productRoute, { path: { id: props.product.id } }) }, "View"),
  ]),
);
