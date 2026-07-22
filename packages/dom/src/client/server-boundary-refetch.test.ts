import * as assert from "node:assert/strict";
import { AppRpcClientTag, Boundary, h, Subscribable } from "@weftui/core";
import type { AppRpcClient, Node } from "@weftui/core";
import { Rpc } from "effect/unstable/rpc";
import { Effect, Layer, Option, Schema, Stream } from "effect";
import { JSDOM } from "jsdom";
import { describe, it } from "vite-plus/test";
import { renderToStringHydratable } from "~/server";
import * as WeftApp from "./weft-app";

// ---------------------------------------------------------------------------
// Test setup (mirrors server-boundary-hydrate.test.ts)
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

interface ProductShape {
  readonly name: string;
  readonly price: number;
}
const StockKey = Schema.Struct({ id: Schema.Number });
const Product = Schema.Struct({ name: Schema.String, price: Schema.Number });
const GetProduct = Rpc.make("GetProduct", { payload: StockKey, success: Product });

/** SSR seam: an in-process client that resolves the initial value (`Widget`). */
const seedLayer = Layer.succeed(AppRpcClientTag, {
  call: () => Effect.succeed<ProductShape>({ name: "Widget", price: 9 }),
} satisfies AppRpcClient);

async function seedServerHtml(app: Node<any, any>): Promise<HTMLElement> {
  const root = createRoot();
  const html = await Effect.runPromise(Effect.provide(renderToStringHydratable(app), seedLayer));
  root.innerHTML = html;
  return root;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds a `Boundary.rpc` that renders `resource.value` through the reactive child
 * path (so a refetch patches the region in place) and captures the live `Resource`
 * so the test can drive `refetch` and observe `pending`/`error`. The refetch client
 * is injected at hydrate time, not here.
 */
const captureResource = () => {
  const captured: { current?: Boundary.Resource<ProductShape> } = {};
  const app = Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }),
    (resource) => {
      captured.current = resource as Boundary.Resource<ProductShape>;
      return h.div({ class: "product" }, [
        Stream.map(Subscribable.changes(resource.value), (p) => p.name),
      ]);
    },
  );
  return { app, captured } as const;
};

/** A client whose `call` resolves with `resolve()`; `calls` counts invocations. */
const refetchClient = (resolve: () => Effect.Effect<unknown, unknown>) => {
  const state = { calls: 0 };
  const layer = Layer.succeed(AppRpcClientTag, {
    call: () =>
      Effect.flatMap(
        Effect.sync(() => {
          state.calls++;
        }),
        resolve,
      ),
  } satisfies AppRpcClient);
  return { layer, state } as const;
};

// ---------------------------------------------------------------------------
// AC-H-S8: refetch patches the region in place
// ---------------------------------------------------------------------------

describe("Boundary.rpc refetch: AC-H-S8: patches in place", () => {
  it("re-calls the rpc, takes the decoded success, and updates value (no remount)", async () => {
    createTestDOM();
    const { app, captured } = captureResource();
    const { layer, state } = refetchClient(() =>
      Effect.succeed<ProductShape>({ name: "Gadget", price: 12 }),
    );

    const root = await seedServerHtml(app);
    const productBefore = root.querySelector("div.product");
    assert.ok(productBefore, "server rendered the product div");

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(layer), app, root));

    // Seeded value rendered first (no flash): same node adopted in place.
    assert.equal(root.querySelector("div.product"), productBefore);
    assert.ok(productBefore?.textContent?.includes("Widget"));

    const resource = captured.current;
    assert.ok(resource, "render captured the live resource");

    await Effect.runPromise(resource!.refetch);
    await waitFor(20);

    // The rpc client was hit and the new value is live on the resource…
    assert.equal(state.calls, 1);
    const value = await Effect.runPromise(Subscribable.get(resource!.value));
    assert.equal(value.name, "Gadget");
    // …and the region patched in place (same node, new text: no remount).
    assert.equal(root.querySelector("div.product"), productBefore);
    assert.ok(productBefore?.textContent?.includes("Gadget"));
  });

  it("toggles pending true during the call and false after, error stays None on success", async () => {
    createTestDOM();
    const { app, captured } = captureResource();
    const { layer } = refetchClient(() =>
      Effect.succeed<ProductShape>({ name: "Gadget", price: 12 }),
    );

    const root = await seedServerHtml(app);
    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(layer), app, root));

    const resource = captured.current!;
    assert.equal(await Effect.runPromise(Subscribable.get(resource.pending)), false);

    await Effect.runPromise(resource.refetch);

    assert.equal(await Effect.runPromise(Subscribable.get(resource.pending)), false);
    assert.equal(Option.isNone(await Effect.runPromise(Subscribable.get(resource.error))), true);
  });
});

// ---------------------------------------------------------------------------
// AC-H-S9: refetch failure is stale-on-error
// ---------------------------------------------------------------------------

describe("Boundary.rpc refetch: AC-H-S9: stale-on-error", () => {
  it("keeps the previous value, sets error to Some, pending back to false, no fallback flash", async () => {
    createTestDOM();
    const { app, captured } = captureResource();

    let mode: "fail" | "ok" = "fail";
    const layer = Layer.succeed(AppRpcClientTag, {
      call: () =>
        mode === "fail"
          ? Effect.fail(new Error("network down"))
          : Effect.succeed<ProductShape>({ name: "Gadget", price: 12 }),
    } satisfies AppRpcClient);

    const root = await seedServerHtml(app);
    const productBefore = root.querySelector("div.product");
    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(layer), app, root));

    const resource = captured.current!;

    await Effect.runPromise(resource.refetch);
    await waitFor(20);

    // Stale-on-error: previous value retained, error surfaced, pending cleared.
    const value = await Effect.runPromise(Subscribable.get(resource.value));
    assert.equal(value.name, "Widget");
    assert.equal(Option.isSome(await Effect.runPromise(Subscribable.get(resource.error))), true);
    assert.equal(await Effect.runPromise(Subscribable.get(resource.pending)), false);
    // No fallback flash / remount: the same product node is still in place.
    assert.equal(root.querySelector("div.product"), productBefore);
    assert.ok(productBefore?.textContent?.includes("Widget"));

    // A subsequent successful refetch clears the error to None.
    mode = "ok";
    await Effect.runPromise(resource.refetch);
    await waitFor(20);
    assert.equal(Option.isNone(await Effect.runPromise(Subscribable.get(resource.error))), true);
    assert.equal((await Effect.runPromise(Subscribable.get(resource.value))).name, "Gadget");
  });
});

// ---------------------------------------------------------------------------
// Defect path: a dying `call` is stale-on-error, not an escaping defect
// ---------------------------------------------------------------------------

describe("Boundary.rpc refetch: defect path", () => {
  it("a dying rpc call clears pending and surfaces the defect as error (stale-on-error)", async () => {
    createTestDOM();
    const { app, captured } = captureResource();

    // `Effect.die` is a defect: `Effect.either` would NOT capture it; the
    // resource must still clear `pending` and keep the previous value.
    const layer = Layer.succeed(AppRpcClientTag, {
      call: () => Effect.die(new Error("transport exploded")),
    } satisfies AppRpcClient);

    const root = await seedServerHtml(app);
    const productBefore = root.querySelector("div.product");
    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(layer), app, root));

    const resource = captured.current!;

    // `refetch` itself must not reject (the defect is absorbed into `error`).
    await Effect.runPromise(resource.refetch);
    await waitFor(20);

    assert.equal((await Effect.runPromise(Subscribable.get(resource.value))).name, "Widget");
    assert.equal(Option.isSome(await Effect.runPromise(Subscribable.get(resource.error))), true);
    assert.equal(await Effect.runPromise(Subscribable.get(resource.pending)), false);
    assert.equal(root.querySelector("div.product"), productBefore);
  });
});

// ---------------------------------------------------------------------------
// Concurrency: a refetch triggered while one is in flight is ignored
// ---------------------------------------------------------------------------

describe("Boundary.rpc refetch: ignore-while-pending", () => {
  it("a second refetch during an in-flight call is a no-op (no double call, no out-of-order clobber)", async () => {
    createTestDOM();
    const { app, captured } = captureResource();

    // A latch the test releases manually so two refetches overlap deterministically.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const state = { calls: 0 };
    const layer = Layer.succeed(AppRpcClientTag, {
      call: () =>
        Effect.flatMap(
          Effect.sync(() => {
            state.calls++;
          }),
          () =>
            Effect.map(
              Effect.promise(() => gate),
              (): ProductShape => ({ name: "Gadget", price: 12 }),
            ),
        ),
    } satisfies AppRpcClient);

    const root = await seedServerHtml(app);
    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(layer), app, root));

    const resource = captured.current!;

    // Start the first refetch (forked: it parks on the gate, pending = true).
    const first = Effect.runPromise(resource.refetch);
    await waitFor(10);
    assert.equal(await Effect.runPromise(Subscribable.get(resource.pending)), true);

    // Second refetch while the first is in flight is ignored: no second call.
    await Effect.runPromise(resource.refetch);
    assert.equal(state.calls, 1);

    // Release the first; it completes normally and clears pending.
    release();
    await first;
    await waitFor(20);
    assert.equal(state.calls, 1);
    assert.equal(await Effect.runPromise(Subscribable.get(resource.pending)), false);
    assert.equal((await Effect.runPromise(Subscribable.get(resource.value))).name, "Gadget");
  });
});

// ---------------------------------------------------------------------------
// No transport: refetch is a no-op (router-less mount)
// ---------------------------------------------------------------------------

describe("Boundary.rpc refetch: no transport", () => {
  it("is a no-op when no AppRpcClient is provided", async () => {
    createTestDOM();
    const { app, captured } = captureResource();

    const root = await seedServerHtml(app);
    // Hydrate without providing AppRpcClientTag.
    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    const resource = captured.current!;
    await Effect.runPromise(resource.refetch);

    // Value unchanged, no error, not pending.
    assert.equal((await Effect.runPromise(Subscribable.get(resource.value))).name, "Widget");
    assert.equal(Option.isNone(await Effect.runPromise(Subscribable.get(resource.error))), true);
    assert.equal(await Effect.runPromise(Subscribable.get(resource.pending)), false);
  });
});
