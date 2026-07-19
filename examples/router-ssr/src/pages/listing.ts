/**
 * `/products`: the product listing, with a `?sort=` **query param**.
 *
 * The leaf reads the decoded query straight from its **handler-arg props**
 * (`({ query }) => …`, the same form the original `posts` page used) and renders
 * the catalog sorted by `query.sort`. The router keys a leaf by its full URL
 * (`outlet.ts`'s `keyOf`), so a query-only navigation (a sort link, or `patchQuery`
 * / `setQuery`) re-invokes this handler with the new `query` and the grid re-sorts.
 * (For a reactive in-place reader that survives without re-rendering the leaf, see
 * `navigation.browser.test.ts`'s use of `Router.queryStream`.)
 */

import { h } from "@weftui/core";
import { href, Router, type RouteNode } from "@weftui/router";
import { ProductCard } from "../components/product-card";
import { PRODUCTS, sortProducts, SortOrder } from "../data/products";

/**
 * `/products`: sort controls + a grid sorted by `?sort=`.
 *
 * The explicit `RouteNode` annotation breaks the inference cycle created by the
 * sort links: they `href(productsRoute, …)` back to this very route, so its type
 * must be stated rather than inferred from a body that references it.
 */
export const productsRoute: RouteNode<{}, typeof SortOrder, never, never> = Router.route(
  "products",
  {
    query: SortOrder,
    component: ({ query }) =>
      h.section({ id: "page", class: "listing" }, [
        h.h2("All products"),
        h.nav({ id: "sort", class: "sort" }, [
          "sort: ",
          h.a({ href: href(productsRoute) }, "Default"),
          " · ",
          h.a({ href: href(productsRoute, { query: { sort: "price-asc" } }) }, "Price ↑"),
          " · ",
          h.a({ href: href(productsRoute, { query: { sort: "price-desc" } }) }, "Price ↓"),
          " · ",
          h.a({ href: href(productsRoute, { query: { sort: "name" } }) }, "Name"),
        ]),
        h.div(
          { id: "grid", class: "grid" },
          sortProducts(PRODUCTS, query.sort).map((product) => ProductCard({ product })),
        ),
      ]),
  },
);
