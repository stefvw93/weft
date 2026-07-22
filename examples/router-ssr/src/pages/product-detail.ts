/**
 * `/products/:id`: the product detail page, with an `:id` **path param** and a
 * refetchable **`Boundary.rpc`**.
 *
 * The leaf reads the decoded `{ path }` straight from its handler args, so
 * `path.id` is already a `number`. An unknown id calls `notFound()` for a dynamic
 * 404 (HTTP 404 on the server, the fallback page on client navigation).
 *
 * The product's static metadata (name/price/blurb) comes from the isomorphic
 * catalog, but its **live stock** comes from the {@link GetStock} rpc:
 *
 * - **SSR** resolves it in-process (over the server handler Layer) and inlines the
 *   payload; **hydrate** replays that payload with no extra request.
 * - **Refetch** (the button) re-resolves the rpc over `POST /_eui/rpc`, re-running
 *   the handler **on the server** and patching the `#stock` region in place.
 * - **Client-first SPA mount** (navigating in from the listing, no SSR payload)
 *   shows the `fallback`, then forks the same rpc call and swaps the live stock in.
 *
 * The rpc **tag** is the stable identity and the **payload** carries the product
 * id, so there is no per-product boundary id and no co-located server `load`.
 */

import { Boundary, h, Subscribable } from "@weftui/core";
import { notFound, Router } from "@weftui/router";
import { Schema, Stream } from "effect";
import { GetStock } from "../data/inventory";
import { formatPrice, getProduct } from "../data/products";

/** Shared `:id` path-param schema: decodes the string segment to a number. */
const idParam = { id: Schema.NumberFromString };

/** `/products/:id`: product metadata + a refetchable live-stock `Boundary.rpc`. */
export const productRoute = Router.route("products/:id", {
  path: idParam,
  component: ({ path }) => {
    const product = getProduct(path.id);
    if (product === undefined) {
      // Unknown product → dynamic 404 (server: HTTP 404; client nav: fallback page).
      return notFound(`/products/${path.id}`);
    }
    return Boundary.rpc(
      GetStock,
      () => ({ id: product.id }),
      (resource) =>
        h.section({ id: "page", class: "product" }, [
          h.div({ class: "product-emoji" }, product.emoji),
          h.h2(product.name),
          h.p({ class: "product-price" }, formatPrice(product.priceCents)),
          h.p({ class: "product-blurb" }, product.blurb),
          h.p([
            "in stock: ",
            h.span({ id: "stock" }, [
              Stream.map(Subscribable.changes(resource.value), (stock) => String(stock.units)),
            ]),
          ]),
          h.p([
            "refreshing: ",
            h.span({ id: "pending" }, [
              Stream.map(Subscribable.changes(resource.pending), (pending) =>
                pending ? "yes" : "no",
              ),
            ]),
          ]),
          h.button(
            { type: "button", id: "refresh", onclick: () => resource.refetch },
            "Refresh stock",
          ),
        ]),
      {
        fallback: h.section({ id: "page", class: "product" }, [
          h.p({ id: "stock-fallback" }, "loading stock…"),
        ]),
      },
    );
  },
});
