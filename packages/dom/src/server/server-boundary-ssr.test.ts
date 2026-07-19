import * as assert from "node:assert/strict";
import { AppRpcClientTag, Boundary, h } from "@weftui/core";
import type { AppRpcClient, Node } from "@weftui/core";
import { Rpc } from "effect/unstable/rpc";
import { Effect, Exit, Filter, Layer, Result, Schema, Stream } from "effect";
import { describe, it } from "vite-plus/test";
import { renderToStream } from "./render-to-stream";
import { renderToString, renderToStringHydratable } from "./render-to-string";

/**
 * Adapts a bare `(data) => Node` render to the `(resource) => Node` signature by
 * reading the resource's **seeded** value once. The static resource the SSR
 * renderer builds is await-first, so `value.get` resolves synchronously to the
 * loaded data and the produced HTML is byte-identical to the bare-data render
 * these tests assert (no reactive-region markers).
 */
const fromValue =
  <A, E, R>(f: (a: A) => Node<E, R>) =>
  (resource: Boundary.Resource<A>) =>
    Effect.gen(function* () {
      const data = yield* resource.value.get;
      return yield* f(data);
    });

/**
 * Builds a stub {@link AppRpcClientTag} layer from a `tag → handler` record,
 * standing in for the in-process client `@weftui/router` provides on the
 * server. The renderer only needs `call(tag, payload)` to resolve a boundary; the
 * handler returns the already-decoded success (or fails/dies) just like the real
 * in-process client over the handler Layer.
 */
const appRpcLayer = (
  handlers: Record<string, (payload: unknown) => Effect.Effect<unknown, unknown>>,
) =>
  Layer.succeed(AppRpcClientTag, {
    call: (tag, payload) =>
      (handlers[tag] ?? (() => Effect.die(new Error(`no handler for ${tag}`))))(payload),
  } satisfies AppRpcClient);

const provideRpc = (
  effect: Effect.Effect<string, Error, AppRpcClientTag>,
  handlers: Record<string, (payload: unknown) => Effect.Effect<unknown, unknown>>,
) => Effect.provide(effect, appRpcLayer(handlers));

const provideStream = (
  stream: Stream.Stream<string, Error, AppRpcClientTag>,
  handlers: Record<string, (payload: unknown) => Effect.Effect<unknown, unknown>>,
) => Stream.provide(stream, appRpcLayer(handlers));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const StockKey = Schema.Struct({ id: Schema.Number });
const Product = Schema.Struct({ name: Schema.String, price: Schema.Number });
type ProductShape = typeof Product.Type;

class LoadError extends Schema.TaggedErrorClass<LoadError>()("LoadError", {
  reason: Schema.String,
}) {}

/** Success rpc: `GetProduct` (StockKey → Product). */
const GetProduct = Rpc.make("GetProduct", { payload: StockKey, success: Product });
/** Failing rpc: declares `error: LoadError` so a resolved error can be encoded. */
const Failing = Rpc.make("Failing", { payload: StockKey, success: Product, error: LoadError });

/** Resolves the product through the ambient rpc client, renders its name. */
const ProductBoundary = () =>
  Boundary.rpc(
    GetProduct,
    () => ({ id: 1 }),
    fromValue((data) => h.div({ class: "product" }, data.name)),
  );

const productHandlers = {
  GetProduct: () => Effect.succeed<ProductShape>({ name: "Widget", price: 9 }),
};

const SCRIPT_RE = /<script type="application\/json">(.*?)<\/script>/;
const SCRIPT_RE_G = /<script type="application\/json">(.*?)<\/script>/g;

const decodeScript = (json: string) =>
  Effect.runPromise(Schema.decodeUnknownEffect(Product)(JSON.parse(json)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Boundary.rpc: hydratable SSR (AC-10)", () => {
  it("emits an inline JSON payload that decodes back to the resolved data", async () => {
    const html = await Effect.runPromise(
      provideRpc(renderToStringHydratable(ProductBoundary()), productHandlers),
    );

    const match = SCRIPT_RE.exec(html);
    assert.ok(match !== null, "expected an application/json payload script");
    const decoded = await decodeScript(match[1] as string);
    assert.deepEqual(decoded, { name: "Widget", price: 9 });
  });

  it("renders render(data) HTML in place", async () => {
    const html = await Effect.runPromise(
      provideRpc(renderToStringHydratable(ProductBoundary()), productHandlers),
    );
    assert.ok(html.includes('<div class="product">Widget</div>'));
  });

  it("emits the payload before the render(data) HTML (positional, AC-14)", async () => {
    const html = await Effect.runPromise(
      provideRpc(renderToStringHydratable(ProductBoundary()), productHandlers),
    );
    assert.ok(html.indexOf("<script") < html.indexOf("<div"));
  });
});

describe("Boundary.rpc: plain SSR (AC-11/AC-12)", () => {
  it("renderToString renders render(data) HTML with no payload script", async () => {
    const html = await Effect.runPromise(
      provideRpc(renderToString(ProductBoundary()), productHandlers),
    );
    assert.ok(html.includes('<div class="product">Widget</div>'));
    assert.ok(!html.includes("<script"));
  });

  it("renderToStream (plain) renders render(data) HTML with no payload script", async () => {
    const html = await Effect.runPromise(
      Stream.mkString(provideStream(renderToStream(ProductBoundary()), productHandlers)),
    );
    assert.ok(html.includes('<div class="product">Widget</div>'));
    assert.ok(!html.includes("<script"));
  });
});

describe("Boundary.rpc: same tag, different payload", () => {
  // The payload is a typed input, not a per-entity id: two boundaries sharing the
  // rpc tag with different payloads resolve independently.
  it("resolves each boundary from its own payload", async () => {
    const handlers = {
      GetProduct: (payload: unknown) =>
        Effect.succeed<ProductShape>({ name: `P${(payload as { id: number }).id}`, price: 1 }),
    };
    const node = h.div({}, [
      Boundary.rpc(
        GetProduct,
        () => ({ id: 1 }),
        fromValue((d) => h.span({ class: "a" }, d.name)),
      ),
      Boundary.rpc(
        GetProduct,
        () => ({ id: 2 }),
        fromValue((d) => h.span({ class: "b" }, d.name)),
      ),
    ]);
    const html = await Effect.runPromise(provideRpc(renderToString(node), handlers));
    assert.ok(html.includes('<span class="a">P1</span>'));
    assert.ok(html.includes('<span class="b">P2</span>'));
  });
});

describe("Boundary.rpc: nesting", () => {
  it("emits nested payloads positionally, each decodable", async () => {
    const handlers = {
      Outer: () => Effect.succeed<ProductShape>({ name: "Outer", price: 1 }),
      Inner: () => Effect.succeed<ProductShape>({ name: "Inner", price: 2 }),
    };
    const OuterRpc = Rpc.make("Outer", { payload: StockKey, success: Product });
    const InnerRpc = Rpc.make("Inner", { payload: StockKey, success: Product });

    const Nested = () =>
      Boundary.rpc(
        OuterRpc,
        () => ({ id: 1 }),
        fromValue((outer) =>
          h.div({}, [
            outer.name,
            Boundary.rpc(
              InnerRpc,
              () => ({ id: 2 }),
              fromValue((inner) => h.span({}, inner.name)),
            ),
          ]),
        ),
      );

    const html = await Effect.runPromise(provideRpc(renderToStringHydratable(Nested()), handlers));
    const scripts = [...html.matchAll(SCRIPT_RE_G)];
    assert.equal(scripts.length, 2);

    const outer = await decodeScript(scripts[0]![1] as string);
    const inner = await decodeScript(scripts[1]![1] as string);
    assert.equal(outer.name, "Outer");
    assert.equal(inner.name, "Inner");

    // Outer payload precedes the <div>; inner payload sits inside the <div>,
    // before the <span> it hydrates.
    assert.ok(html.indexOf(scripts[0]![0]) < html.indexOf("<div>"));
    const innerIdx = html.indexOf(scripts[1]![0]);
    assert.ok(innerIdx > html.indexOf("<div>"));
    assert.ok(innerIdx < html.indexOf("<span>"));
  });
});

describe("Boundary.rpc: typed-failure replay (server emit, AC-7…AC-9)", () => {
  // A resolved rpc error is encoded by the enclosing failure `Boundary` into a
  // `data-weft-boundary-failure` payload (hydratable), or shown as the no-JS
  // fallback only (plain). A defect is never encoded.
  const FAILURE_SCRIPT_RE =
    /<script type="application\/json" data-weft-boundary-failure>(.*?)<\/script>/;

  const failingBoundary = () =>
    Boundary.rpc(
      Failing,
      () => ({ id: 1 }),
      fromValue((data) => h.div({ class: "product" }, data.name)),
    );

  const failingHandlers = {
    Failing: () => Effect.fail(new LoadError({ reason: "db down" })),
  };

  it("plain SSR shows the fallback with no failure payload (AC-8)", async () => {
    const node = Boundary.catch(
      { fallback: (e: LoadError) => h.div({ class: "fallback" }, e.reason) },
      [failingBoundary()],
    );

    const html = await Effect.runPromise(provideRpc(renderToString(node), failingHandlers));
    assert.ok(html.includes('<div class="fallback">db down</div>'));
    assert.ok(!html.includes("data-weft-boundary-failure"));
    assert.ok(!html.includes('class="product"'));
  });

  it("hydratable emits the failure payload before the fallback, decodable to the error (AC-7)", async () => {
    const node = Boundary.catch(
      { fallback: (e: LoadError) => h.div({ class: "fallback" }, e.reason) },
      [failingBoundary()],
    );

    const html = await Effect.runPromise(
      provideRpc(renderToStringHydratable(node), failingHandlers),
    );

    const match = FAILURE_SCRIPT_RE.exec(html);
    assert.ok(match !== null, "expected a data-weft-boundary-failure payload");
    const payload = JSON.parse(match[1] as string) as { index: number; error: unknown };
    assert.equal(payload.index, 0);
    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(LoadError)(payload.error));
    assert.equal(decoded.reason, "db down");

    // Payload precedes the fallback; the fallback is still rendered for no-JS.
    assert.ok(html.includes('<div class="fallback">db down</div>'));
    assert.ok(html.indexOf(match[0]) < html.indexOf('<div class="fallback">'));
  });

  it("relocates the payload to the outer boundary when the inner match returns null (AC-9)", async () => {
    // Inner `catchFilter` declines (Result.fail → match null); the failure
    // re-propagates without draining, so the outer boundary emits the payload.
    const node = Boundary.catch(
      { fallback: (e: LoadError) => h.div({ class: "outer" }, e.reason) },
      [
        Boundary.catchFilter(
          Filter.make((e) => Result.fail(e)),
          () => h.div({}),
          [failingBoundary()],
        ),
      ],
    );

    const html = await Effect.runPromise(
      provideRpc(renderToStringHydratable(node), failingHandlers),
    );
    const match = FAILURE_SCRIPT_RE.exec(html);
    assert.ok(match !== null, "expected the relocated failure payload");
    const payload = JSON.parse(match[1] as string) as { index: number; error: unknown };
    // Index recomputed against the OUTER boundary's children (still 0 here).
    assert.equal(payload.index, 0);
    assert.ok(html.includes('<div class="outer">db down</div>'));
  });

  it("does not emit a failure payload for an rpc defect (AC-9)", async () => {
    const node = Boundary.catchCause({ fallback: () => h.div({ class: "fallback" }, "boom") }, [
      Boundary.rpc(
        Failing,
        () => ({ id: 1 }),
        fromValue((data) => h.div({}, data.name)),
      ),
    ]);

    const html = await Effect.runPromise(
      provideRpc(renderToStringHydratable(node), {
        Failing: () => Effect.die(new Error("kaboom")),
      }),
    );
    assert.ok(html.includes('<div class="fallback">boom</div>'));
    assert.ok(!html.includes("data-weft-boundary-failure"));
  });
});

describe("Boundary.rpc: encode failure (server-side)", () => {
  it("fails the hydratable render when resolved data does not satisfy the success schema", async () => {
    // The handler yields a value whose `name` is a number, violating `Product`;
    // the hydratable pass `Schema.encode`s the success, so the bad value surfaces
    // as a stream failure rather than emitting a corrupt payload.
    const node = Boundary.rpc(
      GetProduct,
      () => ({ id: 1 }),
      fromValue((data) => h.div({ class: "product" }, String(data.name))),
    );

    const exit = await Effect.runPromiseExit(
      provideRpc(renderToStringHydratable(node), {
        GetProduct: () => Effect.succeed({ name: 123, price: 9 } as unknown as ProductShape),
      }),
    );
    assert.ok(Exit.isFailure(exit));
  });
});

describe("Boundary.rpc: payload escaping (XSS-safe)", () => {
  it("escapes characters unsafe in an inline <script> and still round-trips", async () => {
    const Evil = Schema.Struct({ html: Schema.String });
    const EvilRpc = Rpc.make("Evil", { payload: StockKey, success: Evil });
    const node = Boundary.rpc(
      EvilRpc,
      () => ({ id: 1 }),
      () => h.div({}, "ok"),
    );

    const html = await Effect.runPromise(
      provideRpc(renderToStringHydratable(node), {
        Evil: () => Effect.succeed({ html: "</script><script>alert(1)</script>" }),
      }),
    );

    // The raw closing tag must not appear inside the payload: `<` is escaped.
    assert.ok(!html.includes("</script><script>alert"));
    assert.ok(html.includes("\\u003c/script\\u003e\\u003cscript\\u003e"));

    // It still parses as JSON and decodes to the original string.
    const match = SCRIPT_RE.exec(html);
    assert.ok(match !== null);
    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(Evil)(JSON.parse(match[1] as string)),
    );
    assert.equal(decoded.html, "</script><script>alert(1)</script>");
  });
});
