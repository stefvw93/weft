import { expect, test } from "tstyche";
import { Boundary, type Node } from "@weftui/core";
import { Data, Filter, Result } from "effect";

// ── Fixtures ─────────────────────────────────────────────────────────────────

class FooError extends Data.TaggedError("Foo")<{ msg: string }> {}
class BarError extends Data.TaggedError("Bar")<{ code: number }> {}

interface SomeService {
  readonly _tag: "SomeService";
}
interface OtherService {
  readonly _tag: "OtherService";
}

declare const fooChild: Node<FooError>;
declare const barChild: Node<BarError>;
declare const fallbackNode: Node<never>;
declare const fooChildWithR: Node<FooError, SomeService>;
declare const fallbackWithR: Node<never, OtherService>;

// ── catchAll ─────────────────────────────────────────────────────────────────

test("catchAll", () => {
  // Children's E is fully consumed; output E is never, R is never
  expect(Boundary.catch({ fallback: (_e: FooError) => fallbackNode }, [fooChild])).type.toBe<
    Node<never, never>
  >();

  // R from children propagates out
  expect(Boundary.catch({ fallback: (_e: FooError) => fallbackNode }, [fooChildWithR])).type.toBe<
    Node<never, SomeService>
  >();

  // R from fallback propagates out
  expect(Boundary.catch({ fallback: (_e: FooError) => fallbackWithR }, [fooChild])).type.toBe<
    Node<never, OtherService>
  >();

  // R from both children and fallback unions
  expect(Boundary.catch({ fallback: (_e: FooError) => fallbackWithR }, [fooChildWithR])).type.toBe<
    Node<never, SomeService | OtherService>
  >();

  // Empty children: C inferred as never[], ChildrenR must not leak unknown
  expect(Boundary.catch({ fallback: (_e: never) => fallbackNode }, [])).type.toBe<
    Node<never, never>
  >();

  // fallback parameter type does not match children's E
  expect(Boundary.catch).type.not.toBeCallableWith({ fallback: (_e: BarError) => fallbackNode }, [
    fooChild,
  ]);
});

// ── catchAllCause ─────────────────────────────────────────────────────────────

test("catchAllCause", () => {
  // Children's E fully consumed; fallback receives full Cause
  expect(Boundary.catchCause({ fallback: (_cause) => fallbackNode }, [fooChild])).type.toBe<
    Node<never, never>
  >();

  // Empty children: ChildrenR must not leak unknown
  expect(Boundary.catchCause({ fallback: (_cause) => fallbackNode }, [])).type.toBe<
    Node<never, never>
  >();

  // R from children propagates through catchAllCause
  expect(Boundary.catchCause({ fallback: (_cause) => fallbackNode }, [fooChildWithR])).type.toBe<
    Node<never, SomeService>
  >();
});

// ── catchTag ─────────────────────────────────────────────────────────────────

test("catchTag", () => {
  // Matched tag removed from output E; unmatched BarError remains; R is never
  expect(
    Boundary.catchTag({ tag: "Foo", fallback: (_e: FooError) => fallbackNode }, [
      fooChild,
      barChild,
    ]),
  ).type.toBe<Node<BarError, never>>();

  // Single match: all errors consumed
  expect(
    Boundary.catchTag({ tag: "Foo", fallback: (_e: FooError) => fallbackNode }, [fooChild]),
  ).type.toBe<Node<never, never>>();

  // "Baz" is not present in the children's error union
  expect(Boundary.catchTag).type.not.toBeCallableWith(
    { tag: "Baz", fallback: (_e: never) => fallbackNode },
    [fooChild],
  );
});

// ── catchTags ────────────────────────────────────────────────────────────────

test("catchTags", () => {
  // Both tags caught; output E is never
  expect(
    Boundary.catchTags(
      {
        Foo: (_e: FooError) => fallbackNode,
        Bar: (_e: BarError) => fallbackNode,
      },
      [fooChild, barChild],
    ),
  ).type.toBe<Node<never, never>>();

  // Only one tag caught; the other remains in output E
  expect(
    Boundary.catchTags({ Foo: (_e: FooError) => fallbackNode }, [fooChild, barChild]),
  ).type.toBe<Node<BarError, never>>();
});

// ── catchFilter ──────────────────────────────────────────────────────────────

test("catchFilter", () => {
  // The Filter's Fail channel (X) is preserved in output: a declined error is
  // re-raised, so it stays in E (boundary may not handle the error).
  expect(
    Boundary.catchFilter(
      Filter.make((e: FooError) => Result.fail(e)),
      () => fallbackNode,
      [fooChild],
    ),
  ).type.toBe<Node<FooError, never>>();

  // Empty children: ChildrenE and ChildrenR must not leak unknown
  expect(
    Boundary.catchFilter(
      Filter.make((e: never) => Result.fail(e)),
      () => fallbackNode,
      [],
    ),
  ).type.toBe<Node<never, never>>();

  // R from children preserved when boundary is conditional
  expect(
    Boundary.catchFilter(
      Filter.make((e: FooError) => Result.fail(e)),
      () => fallbackNode,
      [fooChildWithR],
    ),
  ).type.toBe<Node<FooError, SomeService>>();
});

// ── catchIf ──────────────────────────────────────────────────────────────────

test("catchIf", () => {
  // Children's E preserved in output (predicate may return false)
  expect(
    Boundary.catchIf(
      {
        predicate: (_e: FooError) => true,
        fallback: (_e: FooError) => fallbackNode,
      },
      [fooChild],
    ),
  ).type.toBe<Node<FooError, never>>();

  // Empty children: ChildrenE and ChildrenR must not leak unknown
  expect(
    Boundary.catchIf({ predicate: (_e: never) => true, fallback: (_e: never) => fallbackNode }, []),
  ).type.toBe<Node<never, never>>();

  // R from children and fallback both propagate out
  expect(
    Boundary.catchIf(
      {
        predicate: (_e: FooError) => true,
        fallback: (_e: FooError) => fallbackWithR,
      },
      [fooChildWithR],
    ),
  ).type.toBe<Node<FooError, SomeService | OtherService>>();
});

// ── Node is an Effect, not a plain descriptor ────────────────────────────────

test("Node is an Effect, not a plain descriptor", () => {
  // a plain descriptor object is not a Node (which is an Effect)
  // @ts-expect-error 'type' does not exist in type 'Node<never, never>'
  const _notANode: Node<never> = { type: "div", props: {} };
});
