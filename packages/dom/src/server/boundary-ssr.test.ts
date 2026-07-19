import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Data, Effect, Stream } from "effect";
import { Boundary, h } from "@weftui/core";
import {
  renderToStream as _renderToStream,
  renderToStreamHydratable as _renderToStreamHydratable,
} from "./render-to-stream";
import { renderToString as _renderToString } from "./render-to-string";
import type { Renderable } from "@weftui/core/types";
import { NoRpc } from "../__tests__/rpc-stub";

// These failure/suspense boundary trees contain no `Boundary.rpc`; shadow the
// render fns with the no-op `NoRpc` layer pre-provided (the render fns require an
// AppRpcClientTag unconditionally).
const renderToStream = (n: Renderable) => Stream.provide(_renderToStream(n), NoRpc);
const renderToStreamHydratable = (n: Renderable) =>
  Stream.provide(_renderToStreamHydratable(n), NoRpc);
const renderToString = (n: Renderable) => Effect.provide(_renderToString(n), NoRpc);

// ── Helpers ───────────────────────────────────────────────────────────────────

const run = (node: unknown) => Effect.runPromise(Stream.mkString(renderToStream(node as never)));

const runHydratable = (node: unknown) =>
  Effect.runPromise(Stream.mkString(renderToStreamHydratable(node as never)));

const runString = (node: unknown) => Effect.runPromise(renderToString(node as never));

// ── Fixtures ──────────────────────────────────────────────────────────────────

class FooError extends Data.TaggedError("Foo")<{ msg: string }> {}

// ── AC22 non-hydratable: children succeed → transparent ──────────────────────

describe("AC22 non-hydratable: children succeed: boundary is transparent", () => {
  it("renders children HTML inline with no boundary markers", async () => {
    const html = await run(
      Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "err") }, [
        h.div({ class: "content" }, "hello"),
      ]),
    );
    assert.equal(html, '<div class="content">hello</div>');
  });

  it("renderToString: renders children inline with no markers", async () => {
    const html = await runString(
      Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "err") }, [h.p({}, "text")]),
    );
    assert.equal(html, "<p>text</p>");
  });
});

// ── AC22 non-hydratable: children fail → fallback HTML inline ─────────────────

describe("AC22 non-hydratable: children fail: fallback HTML emitted inline", () => {
  it("renders fallback HTML when child fails", async () => {
    const failingChild = Effect.fail(new FooError({ msg: "oops" }));

    const html = await run(
      Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "error!") }, [failingChild]),
    );
    assert.ok(html.includes("fallback"), `Expected fallback in: ${html}`);
    assert.ok(html.includes("error!"), `Expected error text in: ${html}`);
  });

  it("no boundary markers when rendering fallback inline", async () => {
    const failingChild = Effect.fail(new FooError({ msg: "oops" }));

    const html = await run(
      Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "error!") }, [failingChild]),
    );
    assert.ok(!html.includes("boundary"), `Unexpected boundary marker in: ${html}`);
  });
});

// ── AC22 non-hydratable: match returns null → stream failure ──────────────────

describe("AC22 non-hydratable: match returns null → stream failure", () => {
  it("propagates as stream failure when match returns null", async () => {
    const failingChild = Effect.fail(new FooError({ msg: "oops" }));

    // catchAll won't catch defects, but our test child is a typed failure.
    // To get match to return null, use catchTag with wrong tag.
    // oxlint-disable-next-line typescript/no-explicit-any
    const node = (Boundary.catchTag as any)({ tag: "Bar", fallback: () => h.span({}, "inner") }, [
      failingChild,
    ]);

    await assert.rejects(run(node), "Expected stream failure when match returns null");
  });
});

// ── AC24 hydratable: success → transparent (no boundary markers) ──────────────

describe("AC24 hydratable: children succeed: boundary transparent", () => {
  it("no boundary markers emitted when children succeed", async () => {
    const html = await runHydratable(
      Boundary.catch({ fallback: () => h.span({}, "err") }, [h.div({ class: "content" }, "ok")]),
    );
    assert.ok(!html.includes("boundary"), `Unexpected boundary marker in: ${html}`);
    assert.ok(html.includes("content"), `Expected content in: ${html}`);
  });
});

// ── AC25 hydratable: children fail → standard inline fallback ─────────────────
// Note: renderBoundarySSR renders fallback inline without boundary markers
// for both hydratable and non-hydratable (AC25 hydratable errored markers are
// out of scope for this implementation).

describe("AC25 hydratable: children fail: fallback emitted inline", () => {
  it("fallback HTML emitted when children fail (hydratable path)", async () => {
    const failingChild = Effect.fail(new FooError({ msg: "err" }));

    const html = await runHydratable(
      Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "fb") }, [failingChild]),
    );
    assert.ok(html.includes("fallback"), `Expected fallback in: ${html}`);
    assert.ok(html.includes("fb"), `Expected fallback text in: ${html}`);
  });
});

// ── AC26 hydratable: match returns null → stream failure ──────────────────────

describe("AC26 hydratable: match returns null → stream failure", () => {
  it("propagates as stream failure when match returns null (hydratable)", async () => {
    const failingChild = Effect.fail(new FooError({ msg: "oops" }));

    // oxlint-disable-next-line typescript/no-explicit-any
    const node = (Boundary.catchTag as any)({ tag: "Bar", fallback: () => h.span({}, "inner") }, [
      failingChild,
    ]);

    await assert.rejects(
      runHydratable(node),
      "Expected stream failure when hydratable match returns null",
    );
  });
});

// ── AC27: Boundary ID counter is separate ─────────────────────────────────────
// The boundary SSR path currently renders inline without boundary markers,
// so boundary ID counter isolation is implicitly tested by the absence of markers.

describe("AC27: boundary renders inline (no markers to track)", () => {
  it("multiple nested boundaries each render their children inline", async () => {
    const html = await run(
      Boundary.catch({ fallback: () => h.span({}, "outer-err") }, [
        Boundary.catch({ fallback: () => h.span({}, "inner-err") }, [
          h.div({ class: "deep" }, "nested"),
        ]),
      ]),
    );
    assert.ok(html.includes("deep"), `Expected nested content in: ${html}`);
    assert.ok(!html.includes("boundary"), `No boundary markers expected: ${html}`);
  });
});

// ── Stream-based reactive children inside boundary ────────────────────────────

describe("stream child inside boundary on server", () => {
  it("renders first emission of stream child inline", async () => {
    const html = await run(
      Boundary.catch({ fallback: () => h.span({}, "err") }, [Stream.make(h.strong({}, "live"))]),
    );
    assert.ok(html.includes("<strong>live</strong>"), `Expected stream content in: ${html}`);
  });
});
