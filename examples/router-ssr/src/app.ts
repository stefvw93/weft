/**
 * The shared, isomorphic router app for the `router-ssr` e-commerce example.
 *
 * `app.ts` is a thin **assembler**: it imports the page routes (each co-located
 * with its component in `src/pages`) and the root {@link Shell} layout, then seals
 * the tree with `Router.router(...)` into the exported {@link App} `RouterDef`. It
 * is side-effect-free: it never mounts or serves. The server (`entry-server.ts`)
 * renders the matched route to hydratable HTML; the browser (`entry-client.ts`)
 * hydrates `RouterApp(App)` over it and takes over navigation via the History API.
 *
 * The shop is three pages under one persistent `Shell`:
 *
 * - **`/`** ({@link homeRoute}): a static landing page with a featured grid.
 * - **`/products`** ({@link productsRoute}): a listing with a `?sort=` **query
 *   param** read reactively, so changing the sort re-orders the grid in place.
 * - **`/products/:id`** ({@link productRoute}): a detail page with an `:id`
 *   **path param** and a refetchable **`Boundary.rpc`** resolving per-product live
 *   stock through the `GetStock` rpc.
 *
 * The catalog is split by volatility: slow-changing product metadata lives in the
 * **isomorphic** `data/products` module (safe in the client bundle), while live
 * stock is served by the `GetStock` rpc whose handler Layer (`data/inventory`,
 * `StockLive`) the client never imports. The rpc contract is the only shared part.
 */

import { h } from "@weftui/core";
import { Router } from "@weftui/router";
import { Shell } from "./components/shell";
import { homeRoute } from "./pages/landing";
import { productsRoute } from "./pages/listing";
import { productRoute } from "./pages/product-detail";

// Re-export the leaf routes so entries/tests can build type-safe `href`s.
export { homeRoute, productsRoute, productRoute };

/** App-level not-found page (HTTP 404 on the server). */
const NotFound = () => h.section({ id: "page" }, [h.h2("404: page not found")]);

/**
 * The sealed router definition. The whole tree is authored with the namespaced
 * `Router.*` combinators under a single persistent {@link Shell} layout; the
 * outlet arrives by dependency injection, so the layout reads like an ordinary
 * component and never sees a `Node<any, any>`.
 */
export const App = Router.router(
  Router.layout({ component: Shell }, [homeRoute, productsRoute, productRoute]),
  { notFound: NotFound },
);
