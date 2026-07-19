import * as assert from "node:assert/strict";
import { Boundary, List, getElementDescriptor, h } from "@weftui/core";
import type { Renderable } from "@weftui/core";
import { Rpc } from "effect/unstable/rpc";
import { Effect, Schema, Stream } from "effect";
import { describe, it } from "vite-plus/test";
import { BOUNDARY_FAILURE_ATTR, collectServerBoundaries } from "./boundary-replay";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const StockKey = Schema.Struct({ id: Schema.Number });
const S = Schema.Struct({ name: Schema.String });
const GetThing = Rpc.make("GetThing", { payload: StockKey, success: S });

/**
 * Builds a `Boundary.rpc` node and returns it alongside its **live** descriptor
 * `props` object: the exact object `collectServerBoundaries` is expected to
 * return by reference (AC-BR2). `render` is a no-op subtree; it is never walked
 * (AC-BR4), so its content is irrelevant.
 */
const serverBoundary = (name: string) => {
  const node = Boundary.rpc(
    GetThing,
    () => ({ id: 1 }),
    () => h.div({}, name),
  );
  const props = getElementDescriptor(node)?.props;
  assert.ok(props, "expected a server-boundary descriptor");
  return { node, props } as const;
};

// ---------------------------------------------------------------------------
// AC-BR1: Pre-order, document order
// ---------------------------------------------------------------------------

describe("collectServerBoundaries: AC-BR1: pre-order, document order", () => {
  it("returns props in depth-first document order", () => {
    const a = serverBoundary("a");
    const b = serverBoundary("b");
    const c = serverBoundary("c");

    // a is first, b is nested deeper but earlier in document order than c.
    const tree: Renderable = h.div({}, [a.node, h.section({}, [b.node]), c.node]);
    const out = collectServerBoundaries(tree);

    assert.equal(out.length, 3);
    assert.equal(out[0], a.props);
    assert.equal(out[1], b.props);
    assert.equal(out[2], c.props);
  });

  it("returns an empty list when no server boundary is reachable", () => {
    const tree: Renderable = h.div({}, [h.span({}, "x"), "text", 42]);
    assert.deepEqual(collectServerBoundaries(tree), []);
  });
});

// ---------------------------------------------------------------------------
// AC-BR2: Reference identity
// ---------------------------------------------------------------------------

describe("collectServerBoundaries: AC-BR2: reference identity", () => {
  it("returns the same object as the descriptor's live props", () => {
    const a = serverBoundary("a");
    const out = collectServerBoundaries([a.node]);
    assert.equal(out.length, 1);
    // Reference identity (not a structural copy): the server relies on this for
    // `indexOf(owner)`.
    assert.equal(out[0], a.props);
  });
});

// ---------------------------------------------------------------------------
// AC-BR3: Descends static container nodes
// ---------------------------------------------------------------------------

describe("collectServerBoundaries: AC-BR3: descends static containers", () => {
  it("descends arrays / iterables", () => {
    const a = serverBoundary("a");
    const b = serverBoundary("b");
    const out = collectServerBoundaries([a.node, [b.node]]);
    assert.deepEqual([out[0], out[1]], [a.props, b.props]);
  });

  it("descends a fragment", () => {
    const a = serverBoundary("a");
    const out = collectServerBoundaries(h.fragment([a.node]));
    assert.deepEqual(out, [a.props]);
  });

  it("descends a suspense boundary's children (not its fallback)", () => {
    const a = serverBoundary("a");
    const fallbackOnly = serverBoundary("fallback");
    const out = collectServerBoundaries(
      Boundary.suspend({ fallback: fallbackOnly.node }, [a.node]),
    );
    // Only the child is reachable; the fallback is gone by hydrate time.
    assert.deepEqual(out, [a.props]);
  });

  it("descends a failure boundary's children", () => {
    const a = serverBoundary("a");
    const out = collectServerBoundaries(
      Boundary.catch({ fallback: () => h.div({}, "f") }, [a.node]),
    );
    assert.deepEqual(out, [a.props]);
  });

  it("descends string-element children", () => {
    const a = serverBoundary("a");
    const out = collectServerBoundaries(h.section({}, [h.div({}, [a.node])]));
    assert.deepEqual(out, [a.props]);
  });

  it("descends a static-markup node carrying an ElementDescriptor", () => {
    const a = serverBoundary("a");
    // `h.div(...)` is an Effect carrying its descriptor: walked, never executed.
    const markup = h.div({}, [a.node]);
    const out = collectServerBoundaries(markup);
    assert.deepEqual(out, [a.props]);
  });

  it("descends function components (called with their props)", () => {
    const a = serverBoundary("a");
    // A function-component descriptor returning a *captured* node: the walk calls
    // it and finds the boundary inside.
    const comp = () => a.node;
    const out = collectServerBoundaries([{ type: comp, props: {} }]);
    assert.deepEqual(out, [a.props]);
  });
});

// ---------------------------------------------------------------------------
// AC-BR4: Does not descend data-dependent regions
// ---------------------------------------------------------------------------

describe("collectServerBoundaries: AC-BR4: does not descend data-dependent regions", () => {
  it("does not descend another Boundary.rpc's render output", () => {
    const inner = serverBoundary("inner");
    const outer = Boundary.rpc(
      GetThing,
      () => ({ id: 1 }),
      // The inner boundary is only produced once the rpc resolves: not static.
      () => inner.node,
    );
    const out = collectServerBoundaries(outer);
    assert.equal(out.length, 1);
    assert.equal(out[0], getElementDescriptor(outer)?.props);
  });

  it("does not descend a List.each projection", () => {
    const item = serverBoundary("item");
    const out = collectServerBoundaries(List.each({ of: [1, 2] }, () => item.node));
    assert.deepEqual(out, []);
  });

  it("does not descend a genuinely reactive Stream child", () => {
    const out = collectServerBoundaries([Stream.make("x"), Stream.make("y")]);
    assert.deepEqual(out, []);
  });

  it("does not descend a bare Effect child with no descriptor", () => {
    const hidden = serverBoundary("hidden");
    // A bare Effect carries no ElementDescriptor, so its contents are opaque.
    const out = collectServerBoundaries([Effect.succeed(hidden.node)]);
    assert.deepEqual(out, []);
  });

  it("ignores primitives, null, undefined and booleans", () => {
    const out = collectServerBoundaries(["text", 1, 2n, null, undefined, true, false]);
    assert.deepEqual(out, []);
  });
});

// ---------------------------------------------------------------------------
// AC-BR5: Symmetry
// ---------------------------------------------------------------------------

describe("collectServerBoundaries: AC-BR5: symmetry", () => {
  it("two walks over the same static tree are positionally identical", () => {
    const a = serverBoundary("a");
    const b = serverBoundary("b");
    const tree: Renderable = h.div({}, [
      a.node,
      Boundary.catch({ fallback: () => h.div({}) }, [b.node]),
    ]);

    const first = collectServerBoundaries(tree);
    const second = collectServerBoundaries(tree);

    assert.equal(first.length, second.length);
    for (let i = 0; i < first.length; i++) {
      // Same length, same order, same identity: an index written by one walk
      // resolves to the same boundary in the other.
      assert.equal(first[i], second[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// Marker constant
// ---------------------------------------------------------------------------

describe("BOUNDARY_FAILURE_ATTR", () => {
  it("is the documented marker attribute", () => {
    assert.equal(BOUNDARY_FAILURE_ATTR, "data-weft-boundary-failure");
  });
});
