import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Cause, Data, Effect, Filter, Option, pipe, Result, Schema, Stream } from "effect";
import { Subscribable } from "@weftui/core";
import { Rpc } from "effect/unstable/rpc";
import { FAILURE_BOUNDARY, SERVER_BOUNDARY, Boundary } from "./index";
import type { Renderable, Node } from "~/combinator/types";
import { getElementDescriptor, h } from "~/combinator";

// ── Fixtures ──────────────────────────────────────────────────────────────────

class FooError extends Data.TaggedError("Foo")<{ msg: string }> {}
class BarError extends Data.TaggedError("Bar")<{ code: number }> {}

const fallbackNode = h.span("fallback");

function extractDescriptor<E = never>(
  node: Node<E, never>,
): { type: unknown; props: Boundary.FailureProps & { children?: Renderable } } {
  const descriptor = Effect.runSync(pipe(node, Effect.orDie));
  return { type: descriptor.type, props: descriptor.props as unknown as Boundary.FailureProps };
}

// ── AC1: Descriptor shape ─────────────────────────────────────────────────────

describe("AC1: descriptor shape", () => {
  it("catchAll returns { type: FAILURE_BOUNDARY, props: { match, children } }", () => {
    const node = Boundary.catch({ fallback: () => fallbackNode }, []);
    const { type, props } = extractDescriptor(node);
    assert.equal(type, FAILURE_BOUNDARY);
    assert.equal(typeof props.match, "function");
    assert.ok(Array.isArray(props.children));
  });

  it("catchAllCause returns FAILURE_BOUNDARY descriptor", () => {
    const node = Boundary.catchCause({ fallback: () => fallbackNode }, []);
    const { type } = extractDescriptor(node);
    assert.equal(type, FAILURE_BOUNDARY);
  });

  it("catchTag returns FAILURE_BOUNDARY descriptor", () => {
    const child = h.div() as Node<FooError>;
    const node = Boundary.catchTag({ tag: "Foo", fallback: () => fallbackNode }, [child]);
    const { type } = extractDescriptor(node);
    assert.equal(type, FAILURE_BOUNDARY);
  });

  it("catchTags returns FAILURE_BOUNDARY descriptor", () => {
    const child = h.div() as Node<FooError>;
    const node = Boundary.catchTags({ Foo: () => fallbackNode }, [child]);
    const { type } = extractDescriptor(node);
    assert.equal(type, FAILURE_BOUNDARY);
  });

  it("catchFilter returns FAILURE_BOUNDARY descriptor", () => {
    const node = Boundary.catchFilter(
      Filter.make((e) => Result.fail(e)),
      () => fallbackNode,
      [],
    );
    const { type } = extractDescriptor(node);
    assert.equal(type, FAILURE_BOUNDARY);
  });

  it("catchIf returns FAILURE_BOUNDARY descriptor", () => {
    const node = Boundary.catchIf({ predicate: () => true, fallback: () => fallbackNode }, []);
    const { type } = extractDescriptor(node);
    assert.equal(type, FAILURE_BOUNDARY);
  });

  it("children are preserved in props", () => {
    const child = h.div();
    const node = Boundary.catch({ fallback: () => fallbackNode }, [child]);
    const { props } = extractDescriptor(node);
    assert.equal((props.children as Renderable[])?.length, 1);
    assert.equal((props.children as Renderable[])?.[0], child);
  });
});

// ── AC4: catchAll match ───────────────────────────────────────────────────────

describe("AC4: catchAll match", () => {
  it("returns fallback node for typed failure", () => {
    const expected = h.span();
    const node = Boundary.catch({ fallback: () => expected }, []);
    const { props } = extractDescriptor(node);
    const result = props.match(Cause.fail(new FooError({ msg: "oops" })));
    assert.equal(result, expected);
  });

  it("passes the failure value to the fallback", () => {
    let received: unknown;
    const err = new FooError({ msg: "test" });
    const node = Boundary.catch(
      {
        fallback: (e) => {
          received = e;
          return fallbackNode;
        },
      },
      [],
    );
    const { props } = extractDescriptor(node);
    props.match(Cause.fail(err));
    assert.equal(received, err);
  });

  it("returns null for defect (Cause.die)", () => {
    const node = Boundary.catch({ fallback: () => fallbackNode }, []);
    const { props } = extractDescriptor(node);
    assert.equal(props.match(Cause.die("boom")), null);
  });

  it("returns null for interrupt", () => {
    const node = Boundary.catch({ fallback: () => fallbackNode }, []);
    const { props } = extractDescriptor(node);
    // Cause.empty has no failure: represents interrupt-like empty cause
    assert.equal(props.match(Cause.empty), null);
  });
});

// ── AC7: catchAllCause match ──────────────────────────────────────────────────

describe("AC7: catchAllCause match", () => {
  it("returns fallback for typed failure", () => {
    const node = Boundary.catchCause({ fallback: () => fallbackNode }, []);
    const { props } = extractDescriptor(node);
    const result = props.match(Cause.fail(new FooError({ msg: "e" })));
    assert.equal(result, fallbackNode);
  });

  it("returns fallback for defect (Cause.die)", () => {
    const node = Boundary.catchCause({ fallback: () => fallbackNode }, []);
    const { props } = extractDescriptor(node);
    const result = props.match(Cause.die("boom"));
    assert.equal(result, fallbackNode);
  });

  it("passes the full Cause to the fallback", () => {
    let received: unknown;
    const cause = Cause.die("boom");
    const node = Boundary.catchCause(
      {
        fallback: (c) => {
          received = c;
          return fallbackNode;
        },
      },
      [],
    );
    const { props } = extractDescriptor(node);
    props.match(cause);
    assert.equal(received, cause);
  });
});

// ── AC9: catchTag match ───────────────────────────────────────────────────────

describe("AC9: catchTag match", () => {
  const fooChild = h.div() as Node<FooError>;

  it("returns fallback when tag matches", () => {
    const node = Boundary.catchTag({ tag: "Foo", fallback: () => fallbackNode }, [fooChild]);
    const { props } = extractDescriptor(node);
    const result = props.match(Cause.fail(new FooError({ msg: "e" })));
    assert.equal(result, fallbackNode);
  });

  it("returns null when tag does not match", () => {
    const node = Boundary.catchTag({ tag: "Foo", fallback: () => fallbackNode }, [fooChild]);
    const { props } = extractDescriptor(node);
    const result = props.match(Cause.fail(new BarError({ code: 42 })));
    assert.equal(result, null);
  });

  it("returns null for defect", () => {
    const node = Boundary.catchTag({ tag: "Foo", fallback: () => fallbackNode }, [fooChild]);
    const { props } = extractDescriptor(node);
    assert.equal(props.match(Cause.die("boom")), null);
  });
});

// ── AC14: catchTags match ─────────────────────────────────────────────────────

describe("AC14: catchTags match", () => {
  const fooFallback = h.span({ id: "foo" });
  const barFallback = h.span({ id: "bar" });
  const fooChild = h.div() as Node<FooError>;
  const barChild = h.div() as Node<BarError>;

  it("routes to Foo handler for FooError", () => {
    const node = Boundary.catchTags({ Foo: () => fooFallback, Bar: () => barFallback }, [
      fooChild,
      barChild,
    ]);
    const { props } = extractDescriptor(node);
    assert.equal(props.match(Cause.fail(new FooError({ msg: "e" }))), fooFallback);
  });

  it("routes to Bar handler for BarError", () => {
    const node = Boundary.catchTags({ Foo: () => fooFallback, Bar: () => barFallback }, [
      fooChild,
      barChild,
    ]);
    const { props } = extractDescriptor(node);
    assert.equal(props.match(Cause.fail(new BarError({ code: 0 }))), barFallback);
  });

  it("returns null for unregistered tag", () => {
    const node = Boundary.catchTags({ Foo: () => fooFallback }, [fooChild]);
    const { props } = extractDescriptor(node);
    assert.equal(props.match(Cause.fail(new BarError({ code: 0 }))), null);
  });

  it("returns null for defect", () => {
    const node = Boundary.catchTags({ Foo: () => fooFallback }, [fooChild]);
    const { props } = extractDescriptor(node);
    assert.equal(props.match(Cause.die("boom")), null);
  });
});

// ── AC17: catchFilter match ─────────────────────────────────────────────────────

describe("AC17: catchFilter match", () => {
  it("returns node when fallback returns Option.some", () => {
    const node = Boundary.catchFilter(
      Filter.make((e) => Result.succeed(e)),
      () => fallbackNode,
      [],
    );
    const { props } = extractDescriptor(node);
    const result = props.match(Cause.fail(new FooError({ msg: "e" })));
    assert.equal(result, fallbackNode);
  });

  it("returns null when fallback returns Option.none", () => {
    const node = Boundary.catchFilter(
      Filter.make((e) => Result.fail(e)),
      () => fallbackNode,
      [],
    );
    const { props } = extractDescriptor(node);
    const result = props.match(Cause.fail(new FooError({ msg: "e" })));
    assert.equal(result, null);
  });

  it("returns null for defect", () => {
    const node = Boundary.catchFilter(
      Filter.make((e) => Result.succeed(e)),
      () => fallbackNode,
      [],
    );
    const { props } = extractDescriptor(node);
    assert.equal(props.match(Cause.die("boom")), null);
  });
});

// ── AC20: catchIf match ───────────────────────────────────────────────────────

describe("AC20: catchIf match", () => {
  it("returns fallback when predicate is true", () => {
    const node = Boundary.catchIf({ predicate: () => true, fallback: () => fallbackNode }, []);
    const { props } = extractDescriptor(node);
    const result = props.match(Cause.fail(new FooError({ msg: "e" })));
    assert.equal(result, fallbackNode);
  });

  it("returns null when predicate is false", () => {
    const node = Boundary.catchIf({ predicate: () => false, fallback: () => fallbackNode }, []);
    const { props } = extractDescriptor(node);
    const result = props.match(Cause.fail(new FooError({ msg: "e" })));
    assert.equal(result, null);
  });

  it("returns null for defect", () => {
    const node = Boundary.catchIf({ predicate: () => true, fallback: () => fallbackNode }, []);
    const { props } = extractDescriptor(node);
    assert.equal(props.match(Cause.die("boom")), null);
  });

  it("passes the error to the predicate", () => {
    let received: unknown;
    const err = new FooError({ msg: "pred-test" });
    const node = Boundary.catchIf(
      {
        predicate: (e) => {
          received = e;
          return true;
        },
        fallback: () => fallbackNode,
      },
      [],
    );
    const { props } = extractDescriptor(node);
    props.match(Cause.fail(err));
    assert.equal(received, err);
  });
});

// ── AC23/24: Call shape ───────────────────────────────────────────────────────

describe("AC23/24: call shape", () => {
  it("all variants accept (props, children)", () => {
    const fooChild = h.div() as Node<FooError>;
    assert.doesNotThrow(() => Boundary.catch({ fallback: () => fallbackNode }, [fooChild]));
    assert.doesNotThrow(() => Boundary.catchCause({ fallback: () => fallbackNode }, [fooChild]));
    assert.doesNotThrow(() =>
      Boundary.catchTag({ tag: "Foo", fallback: () => fallbackNode }, [fooChild]),
    );
    assert.doesNotThrow(() =>
      Boundary.catchFilter(
        Filter.make((e) => Result.succeed(e)),
        () => fallbackNode,
        [fooChild],
      ),
    );
    assert.doesNotThrow(() =>
      Boundary.catchIf({ predicate: () => true, fallback: () => fallbackNode }, [fooChild]),
    );
  });

  it("catchTags accepts (handlers, children)", () => {
    const fooChild = h.div() as Node<FooError>;
    assert.doesNotThrow(() => Boundary.catchTags({ Foo: () => fallbackNode }, [fooChild]));
  });
});

// ── Boundary.rpc: descriptor shape ────────────────────────────────────────────

const StockKey = Schema.Struct({ id: Schema.Number });
const Stock = Schema.Struct({ units: Schema.Number });
const GetStock = Rpc.make("GetStock", { payload: StockKey, success: Stock });

describe("Boundary.rpc: descriptor shape", () => {
  it("returns { type: SERVER_BOUNDARY, props: { tag, payloadSchema, successSchema, errorSchema, payload, render, fallback } }", () => {
    const node = Boundary.rpc(
      GetStock,
      () => ({ id: 1 }),
      () => h.div("Widget"),
    );
    const descriptor = getElementDescriptor(node);
    assert.ok(descriptor, "descriptor should be readable without running the node");
    assert.equal(descriptor.type, SERVER_BOUNDARY);
    const props = descriptor.props as {
      tag: unknown;
      payloadSchema: unknown;
      successSchema: unknown;
      errorSchema: unknown;
      payload: unknown;
      render: unknown;
      fallback: unknown;
    };
    // The rpc tag is the stable boundary id: there is no hand-rolled `id`.
    assert.equal(props.tag, "GetStock");
    assert.ok(props.payloadSchema, "payload schema carried for SSR/refetch encode");
    assert.ok(props.successSchema, "success schema carried to decode the inline payload");
    assert.ok(props.errorSchema, "error schema carried for typed-failure replay");
    assert.equal(typeof props.payload, "function");
    assert.equal(typeof props.render, "function");
  });

  it("does not run `payload` or `render` when the descriptor is read", () => {
    let payloadCalls = 0;
    let renderCalls = 0;
    const node = Boundary.rpc(
      GetStock,
      () => {
        payloadCalls++;
        return { id: 1 };
      },
      () => {
        renderCalls++;
        return h.div("Widget");
      },
    );
    getElementDescriptor(node);
    assert.equal(payloadCalls, 0);
    assert.equal(renderCalls, 0);
  });

  it("carries the optional `fallback` from options", () => {
    const fallback = h.div("Loading…");
    const node = Boundary.rpc(
      GetStock,
      () => ({ id: 1 }),
      () => h.div("x"),
      { fallback },
    );
    const props = getElementDescriptor(node)?.props as { fallback: unknown };
    assert.equal(props.fallback, fallback);
  });

  it("`payload` thunk is invoked fresh each call (not memoized at construction)", () => {
    let n = 0;
    const node = Boundary.rpc(
      GetStock,
      () => ({ id: ++n }),
      () => h.div("x"),
    );
    const payload = getElementDescriptor(node)?.props.payload as () => { id: number };
    assert.deepEqual(payload(), { id: 1 });
    assert.deepEqual(payload(), { id: 2 });
  });

  it("hands `render` a resource-shaped argument (value/refetch/pending/error)", () => {
    let received: Boundary.Resource<typeof Stock.Type> | undefined;
    const node = Boundary.rpc(
      GetStock,
      () => ({ id: 1 }),
      (resource) => {
        received = resource;
        return h.div("x");
      },
    );
    // `rpc()` does not invoke `render`; pull it off the descriptor and call it
    // with the static resource the SSR renderer would build, proving it carries
    // the reactive Resource shape (value/refetch/pending/error).
    const render = getElementDescriptor(node)?.props.render as (
      r: Boundary.Resource<typeof Stock.Type>,
    ) => Renderable;
    const stub: Boundary.Resource<typeof Stock.Type> = {
      value: Subscribable.make({
        get: Effect.succeed({ units: 3 }),
        changes: Stream.make({ units: 3 }),
      }),
      refetch: Effect.void,
      pending: Subscribable.make({ get: Effect.succeed(false), changes: Stream.make(false) }),
      error: Subscribable.make({
        get: Effect.succeed(Option.none()),
        changes: Stream.make(Option.none()),
      }),
    };
    render(stub);
    assert.ok(received, "render should have been invoked with a resource");
    assert.ok(received?.value);
    assert.ok(received?.refetch);
    assert.ok(received?.pending);
    assert.ok(received?.error);
  });
});
