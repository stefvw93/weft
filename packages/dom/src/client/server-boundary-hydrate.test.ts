import * as assert from "node:assert/strict";
import { AppRpcClientTag, Boundary, h, Subscribable } from "@weftui/core";
import type { AppRpcClient, Node } from "@weftui/core";
import { Rpc } from "effect/unstable/rpc";
import { Cause, Effect, Exit, Layer, Schema } from "effect";
import { JSDOM } from "jsdom";
import { describe, it } from "vite-plus/test";
import { HydrationMismatchError } from "~/data";
import { renderToStringHydratable } from "~/server";
import * as WeftApp from "./weft-app";
import type { Renderable } from "@weftui/core/types";

/**
 * Adapts a bare `(data) => Node` render to the `(resource) => Node` signature by
 * reading the resource's **seeded** value once. The replay seeds the resource with
 * the decoded payload, so `value.get` resolves synchronously to the loaded data and
 * the hydrated HTML is byte-identical to the bare-data render these replay tests
 * assert (no reactive-region markers).
 */
const fromValue =
  <A, E, R>(f: (a: A) => Node<E, R>) =>
  (resource: Boundary.Resource<A>) =>
    Effect.gen(function* () {
      const data = yield* Subscribable.get(resource.value);
      return yield* f(data);
    });

// ---------------------------------------------------------------------------
// Test setup
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

/**
 * Renders `app` to hydratable HTML, provided the in-process rpc client `layer`
 * (the SSR seam), and seeds it into a fresh root.
 */
async function seedServerHtml(
  app: Renderable,
  layer: Layer.Layer<AppRpcClientTag>,
): Promise<HTMLElement> {
  const root = createRoot();
  const html = await Effect.runPromise(Effect.provide(renderToStringHydratable(app), layer));
  root.innerHTML = html;
  return root;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const StockKey = Schema.Struct({ id: Schema.Number });
const Product = Schema.Struct({ name: Schema.String, price: Schema.Number });
type ProductShape = typeof Product.Type;

class LoadError extends Schema.TaggedErrorClass<LoadError>()("LoadError", {
  reason: Schema.String,
}) {}

const GetProduct = Rpc.make("GetProduct", { payload: StockKey, success: Product });
const Failing = Rpc.make("Failing", { payload: StockKey, success: Product, error: LoadError });

const ProductBoundary = () =>
  Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }),
    fromValue((data) => h.div({ class: "product" }, data.name)),
  );

/**
 * Stub in-process {@link AppRpcClientTag} whose `call` resolves `GetProduct` to a
 * fixed product. `calls` counts every invocation so tests can prove the client
 * resolves on the server but **never** during a client `hydrate` (replay).
 */
const makeClient = (
  resolve: () => Effect.Effect<unknown, unknown> = () =>
    Effect.succeed<ProductShape>({ name: "Widget", price: 9 }),
) => {
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
// AC-H-S1 / AC-H-S2: replay (decode) without re-calling the rpc
// ---------------------------------------------------------------------------

describe("Boundary.rpc hydrate: replay, not retry", () => {
  it("decodes the inline payload and adopts render(data) without re-creating it", async () => {
    createTestDOM();
    const { layer } = makeClient();
    const app = ProductBoundary();

    const root = await seedServerHtml(app, layer);
    const serverDiv = root.querySelector("div.product");
    assert.ok(serverDiv, "server should have rendered the product div");
    (serverDiv as unknown as { __sentinel?: boolean }).__sentinel = true;

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    // Same node object survives: adopted in place, not re-created.
    assert.equal(root.querySelector("div.product"), serverDiv);
    assert.equal((serverDiv as unknown as { __sentinel?: boolean }).__sentinel, true);
    assert.equal(serverDiv?.textContent, "Widget");
  });

  it("never calls the rpc on the client (replays the serialized result)", async () => {
    createTestDOM();
    const { layer, state } = makeClient();
    const app = ProductBoundary();

    const root = await seedServerHtml(app, layer);
    // The server walk resolved the rpc once; reset and prove hydrate adds nothing.
    assert.equal(state.calls, 1);
    state.calls = 0;

    // Provide the same client to hydrate; replay must not invoke it.
    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(layer), app, root));

    assert.equal(state.calls, 0);
  });

  it("removes the inline payload script after hydration", async () => {
    createTestDOM();
    const { layer } = makeClient();
    const app = ProductBoundary();

    const root = await seedServerHtml(app, layer);
    assert.ok(root.querySelector('script[type="application/json"]'), "payload present pre-hydrate");

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    assert.equal(root.querySelector('script[type="application/json"]'), null);
  });
});

// ---------------------------------------------------------------------------
// AC-H-S3: post-hydrate interactivity wired against adopted DOM
// ---------------------------------------------------------------------------

describe("Boundary.rpc hydrate: interactivity", () => {
  it("attaches a handler inside render(data) that fires post-hydrate", async () => {
    const dom = createTestDOM();
    const { layer } = makeClient();
    let fired = 0;
    const app = Boundary.rpc(
      GetProduct,
      () => ({ id: 1 }),
      fromValue((data) =>
        h.div({ class: "product" }, [
          h.span({}, data.name),
          h.button({ onclick: () => Effect.sync(() => void fired++) }, "buy"),
        ]),
      ),
    );

    const root = await seedServerHtml(app, layer);
    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    const button = root.querySelector("button");
    assert.ok(button);
    button?.dispatchEvent(new dom.window.Event("click"));
    await waitFor(50);

    assert.equal(fired, 1);
  });
});

// ---------------------------------------------------------------------------
// AC-H-S4: cursor stays aligned (siblings after the boundary still hydrate)
// ---------------------------------------------------------------------------

describe("Boundary.rpc hydrate: cursor alignment", () => {
  it("steps the cursor past render(data) so a following sibling hydrates", async () => {
    createTestDOM();
    const { layer } = makeClient();
    const app = h.div({}, [
      Boundary.rpc(
        GetProduct,
        () => ({ id: 1 }),
        fromValue((data) => h.span({ class: "product" }, data.name)),
      ),
      h.p({ class: "after" }, "after"),
    ]);

    const root = await seedServerHtml(app, layer);
    const serverAfter = root.querySelector("p.after");
    assert.ok(serverAfter);
    (serverAfter as unknown as { __sentinel?: boolean }).__sentinel = true;

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    // The sibling was adopted (cursor aligned past the boundary's payload + HTML).
    assert.equal(root.querySelector("p.after"), serverAfter);
    assert.equal((serverAfter as unknown as { __sentinel?: boolean }).__sentinel, true);
    assert.equal(serverAfter?.textContent, "after");
  });

  it("hydrates nested server boundaries positionally", async () => {
    createTestDOM();
    const handlers = Layer.succeed(AppRpcClientTag, {
      call: (tag) =>
        tag === "Outer"
          ? Effect.succeed<ProductShape>({ name: "Outer", price: 1 })
          : Effect.succeed<ProductShape>({ name: "Inner", price: 2 }),
    } satisfies AppRpcClient);
    const OuterRpc = Rpc.make("Outer", { payload: StockKey, success: Product });
    const InnerRpc = Rpc.make("Inner", { payload: StockKey, success: Product });
    const app = Boundary.rpc(
      OuterRpc,
      () => ({ id: 1 }),
      fromValue((outer) =>
        h.div({ class: "outer" }, [
          outer.name,
          Boundary.rpc(
            InnerRpc,
            () => ({ id: 2 }),
            fromValue((inner) => h.span({ class: "inner" }, inner.name)),
          ),
        ]),
      ),
    );

    const root = await seedServerHtml(app, handlers);
    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    assert.equal(root.querySelector("span.inner")?.textContent, "Inner");
    assert.ok(root.querySelector("div.outer")?.textContent?.includes("Outer"));
    // Both payload scripts consumed.
    assert.equal(root.querySelectorAll('script[type="application/json"]').length, 0);
  });
});

// ---------------------------------------------------------------------------
// AC-H-S5: payload absence / decode failure → recoverable mismatch
// ---------------------------------------------------------------------------

describe("Boundary.rpc hydrate: payload divergence", () => {
  const boundaryApp = () => ProductBoundary();

  it("fails with HydrationMismatchError when the payload script is missing", async () => {
    createTestDOM();
    const root = createRoot();
    // Server HTML without the leading payload script (e.g. produced by plain SSR).
    root.innerHTML = '<div class="product">Widget</div>';

    const exit = await Effect.runPromiseExit(WeftApp.hydrate(WeftApp.make(), boundaryApp(), root));

    assert.ok(Exit.isFailure(exit));
    assert.ok(Cause.squash(exit.cause) instanceof HydrationMismatchError);
  });

  it("fails with HydrationMismatchError when the payload is malformed JSON", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML =
      '<script type="application/json">not json</script><div class="product">Widget</div>';

    const exit = await Effect.runPromiseExit(WeftApp.hydrate(WeftApp.make(), boundaryApp(), root));

    assert.ok(Exit.isFailure(exit));
    assert.ok(Cause.squash(exit.cause) instanceof HydrationMismatchError);
  });

  it("fails with HydrationMismatchError when the payload violates the schema", async () => {
    createTestDOM();
    const root = createRoot();
    // Valid JSON, wrong shape for `Product` (price is a string, not a number).
    root.innerHTML =
      '<script type="application/json">{"name":"Widget","price":"nine"}</script><div class="product">Widget</div>';

    const exit = await Effect.runPromiseExit(WeftApp.hydrate(WeftApp.make(), boundaryApp(), root));

    assert.ok(Exit.isFailure(exit));
    assert.ok(Cause.squash(exit.cause) instanceof HydrationMismatchError);
  });
});

// ---------------------------------------------------------------------------
// Typed-failure replay (core AC-15): decode the encoded rpc error and reproduce
// the SAME enclosing-failure-boundary fallback without re-calling the rpc.
// ---------------------------------------------------------------------------

describe("Boundary.rpc hydrate: typed-failure replay", () => {
  /** A failing-rpc server boundary under a `catchAll` that renders the error. */
  const makeFailingApp = () =>
    Boundary.catch({ fallback: (e: LoadError) => h.div({ class: "fallback" }, e.reason) }, [
      Boundary.rpc(
        Failing,
        () => ({ id: 1 }),
        fromValue((data) => h.div({ class: "product" }, data.name)),
      ),
    ]);

  it("replays the encoded failure into the same fallback without re-calling the rpc (AC-15)", async () => {
    createTestDOM();
    const { layer, state } = makeClient(() => Effect.fail(new LoadError({ reason: "db down" })));
    const app = makeFailingApp();

    const root = await seedServerHtml(app, layer);
    assert.equal(state.calls, 1, "server called the rpc once");
    const serverFallback = root.querySelector("div.fallback");
    assert.ok(serverFallback, "server rendered the enclosing fallback");
    (serverFallback as unknown as { __sentinel?: boolean }).__sentinel = true;
    state.calls = 0;

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(layer), app, root));

    // The rpc is NOT re-called; the same fallback node is adopted in place.
    assert.equal(state.calls, 0, "client never calls the rpc (replay, not retry)");
    assert.equal(root.querySelector("div.fallback"), serverFallback);
    assert.equal((serverFallback as unknown as { __sentinel?: boolean }).__sentinel, true);
    assert.equal(serverFallback?.textContent, "db down");
    // The failure payload script is consumed.
    assert.equal(root.querySelector("script[data-weft-boundary-failure]"), null);
    // The success subtree was never reproduced.
    assert.equal(root.querySelector("div.product"), null);
  });

  it("fails with a recoverable mismatch when the failure payload is malformed", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML =
      '<script type="application/json" data-weft-boundary-failure>not json</script><div class="fallback">db down</div>';

    const exit = await Effect.runPromiseExit(
      WeftApp.hydrate(WeftApp.make(), makeFailingApp(), root),
    );

    assert.ok(Exit.isFailure(exit));
    assert.ok(Cause.squash(exit.cause) instanceof HydrationMismatchError);
  });
});
