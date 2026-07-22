/**
 * Example: Server Boundary, `Boundary.rpc` client-first mount.
 *
 * `Boundary.rpc` is Weft's server-resolved, client-refreshable data boundary. Its
 * four lifecycles (SSR, hydrate-replay, refetch, client-first mount) all resolve one
 * rpc through the ambient `AppRpcClientTag` seam. `@weftui/router` normally provides
 * that seam, but it is a plain `Context.Service` key from `@weftui/core`, so a **router-less**
 * client app can provide it directly, which is exactly what this example does to show
 * the **client-first mount** path in isolation:
 *
 * 1. the boundary renders its `fallback` immediately,
 * 2. it forks the rpc `call` (here an in-process stub with simulated latency),
 * 3. it swaps in `render(resource)` once the call resolves, and
 * 4. the region stays live: `resource.refetch` re-runs the call and patches in place.
 *
 * `app.ts` is side-effect-free: it exports `App` (the boundary node, whose `R` carries
 * `AppRpcClientTag`) and `AppRpcClientLive` (the in-process client). The seam must be
 * provided at the **mount call site** (not inside `App`), because the renderer drains
 * the boundary's forked call in the mount's context. See
 * `packages/core/src/boundary/ambient-context-propagation` framing. `main.ts` and the
 * browser test both `Effect.provide(mount(App(), root), AppRpcClientLive)`.
 */

import { AppRpcClientTag, Boundary, h, Subscribable } from "@weftui/core";
import type { AppRpcClient } from "@weftui/core";
import { Rpc } from "effect/unstable/rpc";
import { Effect, Layer, Schema, Stream } from "effect";

/** The rpc contract: `_tag` "GetProduct" is the boundary's stable identity. */
const ProductKey = Schema.Struct({ id: Schema.Number });
const Product = Schema.Struct({
  name: Schema.String,
  price: Schema.Number,
  restocks: Schema.Number,
});
export const GetProduct = Rpc.make("GetProduct", { payload: ProductKey, success: Product });

/**
 * An in-process `AppRpcClient` standing in for a network client. `call` returns the
 * already-decoded success value; `restocks` increments per call so a refetch visibly
 * produces new data. A short delay makes the fallback observable before the swap.
 */
export const AppRpcClientLive: Layer.Layer<AppRpcClientTag> = Layer.sync(AppRpcClientTag, () => {
  let restocks = 0;
  return {
    call: (_tag, _payload) =>
      Effect.succeed({ name: "Widget", price: 42, restocks: restocks++ }).pipe(
        Effect.delay("400 millis"),
      ),
  } satisfies AppRpcClient;
});

/** A `Boundary.rpc` region: fallback → forked call → live, refetchable subtree. */
export const App = () =>
  Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }), // a fresh typed payload per call (mount + each refetch)
    (resource) =>
      h.div({ class: "product" }, [
        h.h2([Stream.map(Subscribable.changes(resource.value), (p) => p.name)]),
        h.p({ class: "price" }, [
          "$",
          Stream.map(Subscribable.changes(resource.value), (p) => String(p.price)),
        ]),
        h.p({ class: "restocks" }, [
          "restocked ",
          Stream.map(Subscribable.changes(resource.value), (p) => String(p.restocks)),
          " times",
        ]),
        h.p({ class: "status" }, [
          Stream.map(Subscribable.changes(resource.pending), (p) =>
            p ? "refreshing…" : "up to date",
          ),
        ]),
        h.button({ type: "button", class: "refresh", onclick: () => resource.refetch }, "Refresh"),
      ]),
    { fallback: h.div({ class: "fallback" }, "Loading product…") },
  );
