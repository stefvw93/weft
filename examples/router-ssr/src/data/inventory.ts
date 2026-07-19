/**
 * The shop's **server-only** live inventory, plus its rpc contract.
 *
 * Live stock changes constantly and is read from a back-office system the browser
 * must never touch. With `Boundary.rpc` the client/server split is **structural**,
 * not a bundler trick: the {@link GetStock} rpc **contract** (pure Schema, in
 * {@link StockRpcs}) is safe to share with the client, while its **handler**
 * ({@link StockLive}), the only code that reads the server-only {@link Inventory},
 * lives in a Layer the client never imports. Tree-shaking keeps the inventory
 * source out of the browser bundle; no prune plugin required.
 *
 * The rpc **tag** (`"GetStock"`) is the boundary's stable id and the **payload
 * schema** ({@link StockKey}) its typed input, so per-product live data needs no
 * hand-rolled boundary id and refetch carries the product id as a real payload.
 */

import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Context, Effect, Layer, Schema } from "effect";

/** Wire contract for a product's live stock: encoded to JSON on the server, decoded on the client. */
export const Stock = Schema.Struct({ units: Schema.Number });

/** Decoded stock shape handed to the detail page's `Resource`. */
export type Stock = typeof Stock.Type;

/** Typed payload of {@link GetStock}: the product id whose live stock to read. */
export const StockKey = Schema.Struct({ id: Schema.Number });

/**
 * The `GetStock` rpc: {@link StockKey} payload → {@link Stock} success. Passed
 * directly to `Boundary.rpc` (its `_tag` is the stable boundary id, its payload
 * schema the typed input) and merged into {@link StockRpcs}.
 */
export const GetStock = Rpc.make("GetStock", { payload: StockKey, success: Stock });

/** The app's merged `RpcGroup`. Shared by both the client and server router wiring. */
export const StockRpcs = RpcGroup.make(GetStock);

/**
 * Server-only live-inventory source. Read only inside {@link StockLive} (the rpc
 * handler Layer), which the client never imports, so it never reaches the browser.
 */
export class Inventory extends Context.Service<
  Inventory,
  { readonly stockFor: (id: number) => Effect.Effect<Stock> }
>()("Inventory") {}

/**
 * Per-product restock counter. Module-level so a refetch (which re-resolves the
 * rpc on the **server** through `POST /_eui/rpc`) returns a strictly different
 * value than the SSR snapshot, making the in-place patch observable in the test.
 */
const restocks = new Map<number, number>();

/** Live {@link Inventory}, provided into {@link StockLive} on the server. */
export const InventoryLive = Layer.succeed(Inventory, {
  stockFor: (id) =>
    Effect.sync(() => {
      const next = (restocks.get(id) ?? 0) + 1;
      restocks.set(id, next);
      // A deterministic-but-moving figure: a base derived from the id plus the
      // restock tick, so successive refetches strictly increase.
      return { units: 7 + (id % 5) + next };
    }),
});

/**
 * Server-only handler Layer for {@link StockRpcs}: answers `GetStock` from the live
 * {@link Inventory}, with `InventoryLive` provided so the Layer is fully discharged
 * (`R = never`). Wired into `RouterServer({ rpc: { group, handlers } })` and served
 * at `POST /_eui/rpc`; an in-process client over the same Layer resolves SSR
 * boundaries. The client bundle never imports it.
 */
export const StockLive = StockRpcs.toLayer({
  GetStock: (payload) => Effect.flatMap(Inventory, (inventory) => inventory.stockFor(payload.id)),
}).pipe(Layer.provide(InventoryLive));
