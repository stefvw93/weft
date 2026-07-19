import * as assert from "node:assert/strict";
import { AppRpcClientTag, Boundary, h } from "@weftui/core";
import type { AppRpcClient } from "@weftui/core";
import { Rpc } from "effect/unstable/rpc";
import { Cause, Deferred, Effect, Exit, Layer, Schema } from "effect";
import { JSDOM } from "jsdom";
import { describe, it } from "vite-plus/test";
import { RenderError } from "~/data";
import * as WeftApp from "./weft-app";

// ---------------------------------------------------------------------------
// Test setup — client-first mount (C1): no SSR payload to replay.
// ---------------------------------------------------------------------------

function createTestDOM(): JSDOM {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Comment = dom.window.Comment;
  global.Text = dom.window.Text;
  return dom;
}

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls until `get` returns a non-null element, or times out. */
async function waitForEl(get: () => Element | null): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (get() !== null) return;
    await waitFor(10);
  }
}

interface ProductShape {
  readonly name: string;
  readonly price: number;
}
const StockKey = Schema.Struct({ id: Schema.Number });
const Product = Schema.Struct({ name: Schema.String, price: Schema.Number });
const GetProduct = Rpc.make("GetProduct", { payload: StockKey, success: Product });

const client = (resolve: () => Effect.Effect<unknown, unknown>) =>
  Layer.succeed(AppRpcClientTag, {
    call: (_tag, payload) =>
      Effect.flatMap(
        Effect.sync(() => payload),
        resolve,
      ),
  } satisfies AppRpcClient);

const boundary = () =>
  Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }),
    (resource) =>
      h.div({ class: "product" }, [
        Effect.map(resource.value.get, (p) => (p as ProductShape).name),
      ]),
    { fallback: h.div({ class: "fallback" }, "Loading…") },
  );

// ---------------------------------------------------------------------------
// C1: fallback → swap
// ---------------------------------------------------------------------------

describe("Boundary.rpc mount — client-first (C1)", () => {
  it("renders the fallback, forks the rpc call, then swaps in render(resource)", async () => {
    createTestDOM();
    const root = createRoot();
    // Gate the resolve on a Deferred the test controls, so the forked swap
    // provably has not happened by the time `mount` resolves — making the
    // fallback observable before the live subtree swaps in (deterministic; a
    // timer-based delay races the mount under Effect 4's fiber scheduling).
    const gate = await Effect.runPromise(Deferred.make<ProductShape>());
    const layer = client(() => Deferred.await(gate));

    await Effect.runPromise(WeftApp.mount(WeftApp.make(layer), boundary(), root));

    // Fallback is visible while the (gated) rpc resolution is still in flight.
    assert.ok(root.querySelector("div.fallback"), "fallback rendered while pending");
    assert.equal(root.querySelector("div.product"), null);

    // Open the gate → the forked call resolves and the live subtree swaps in.
    await Effect.runPromise(Deferred.succeed(gate, { name: "Gadget", price: 12 }));
    await waitForEl(() => root.querySelector("div.product"));
    assert.equal(root.querySelector("div.fallback"), null, "fallback removed after swap");
    const product = root.querySelector("div.product");
    assert.ok(product, "live subtree swapped in");
    assert.ok(product?.textContent?.includes("Gadget"));
  });

  it("leaves the fallback in place when the forked rpc call fails", async () => {
    createTestDOM();
    const root = createRoot();
    const layer = client(() => Effect.fail(new Error("network down")));

    await Effect.runPromise(WeftApp.mount(WeftApp.make(layer), boundary(), root));

    await waitFor(30);
    // Stale-on-error: no prior value to keep, so the fallback stays.
    assert.ok(root.querySelector("div.fallback"), "fallback left in place on failure");
    assert.equal(root.querySelector("div.product"), null);
  });

  it("fails with a descriptive RenderError when no AppRpcClient is in context", async () => {
    createTestDOM();
    const root = createRoot();

    // Router-less mount: no AppRpcClientTag provided.
    const exit = await Effect.runPromiseExit(WeftApp.mount(WeftApp.make(), boundary(), root));

    assert.ok(Exit.isFailure(exit));
    const error = Cause.squash(exit.cause);
    assert.ok(error instanceof RenderError);
    assert.ok((error as RenderError).message.includes("AppRpcClient"));
  });
});
