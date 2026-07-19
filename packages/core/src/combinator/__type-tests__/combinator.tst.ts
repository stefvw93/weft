/**
 * Type tests for the combinator API.
 * Validates that E and R accumulate correctly through the tree,
 * and that both `() => h.div(...)` and `Effect.gen(function* () { yield* h.div(...) })`
 * infer correctly.
 */

import { expect, test } from "tstyche";
import { Effect, Stream } from "effect";
import { h } from "../element";
import type { Renderable, ElementDescriptor, Node } from "../types";
import { Component } from "../component";

// =============================================================================
// Mock services for tests
// =============================================================================

interface UserService {
  readonly users: readonly string[];
}
interface DbService {
  readonly db: unknown;
}
class DbError {
  readonly _tag = "DbError";
}
interface ThemeService {
  readonly theme: string;
}
interface ThemeService2 {
  readonly colors: Record<string, string>;
}

interface TextFieldProps {
  name: string;
  value?: string | Stream.Stream<string, any, any>;
  onChange?: (value: string) => void;
}

declare const userStream: Stream.Stream<string, never, UserService>;
declare const dbEffect: Effect.Effect<string, DbError, DbService>;
declare const themeStream: Stream.Stream<string, never, ThemeService>;
declare const themeStream2: Stream.Stream<string, never, ThemeService2>;

// =============================================================================
// h.* element tests
// =============================================================================

test("static props: Node<never, never>", () => {
  expect(h.div({ id: "app", class: "container" }, [h.span({ class: "title" }, "Hello")])).type.toBe<
    Node<never, never>
  >();
});

test("reactive prop: R accumulates from prop value", () => {
  expect(h.div({ class: themeStream })).type.toBe<Node<never, ThemeService>>();
});

test("R accumulates from child stream directly", () => {
  expect(h.div({ class: "container" }, [userStream])).type.toBe<Node<never, UserService>>();
});

test("R from reactive prop + R from child: union", () => {
  expect(h.div({ class: themeStream }, [userStream])).type.toBe<
    Node<never, ThemeService | UserService>
  >();
});

test("E and R accumulate across siblings", () => {
  expect(h.div({}, [userStream, dbEffect])).type.toBe<Node<DbError, UserService | DbService>>();
});

test("plain function wrapper: R preserved on return type", () => {
  expect(() => h.div({}, [userStream])).type.toBe<() => Node<never, UserService>>();
});

test("Effect.gen: yield* works, R propagates into generator", () => {
  expect(
    Effect.gen(function* () {
      return yield* h.div({}, [userStream]);
    }),
  ).type.toBe<Effect.Effect<ElementDescriptor, never, UserService>>();
});

test("nesting: R propagates through levels", () => {
  expect(h.div({}, [h.div({}, [userStream]), dbEffect])).type.toBe<
    Node<DbError, UserService | DbService>
  >();
});

test("children only, no props", () => {
  expect(h.div([userStream])).type.toBe<Node<never, UserService>>();
});

// =============================================================================
// Component.gen
// =============================================================================

// --- Component.gen: props only ---

const GenField = Component.gen(function* (_: TextFieldProps) {
  return yield* h.div({ class: "field" });
});

test("reactive prop: R propagates out", () => {
  expect(GenField({ name: "email", value: userStream })).type.toBe<Node<never, UserService>>();
});

test("static props: Node<never, never>", () => {
  expect(GenField({ name: "email", value: "static@example.com" })).type.toBe<Node<never, never>>();
});

const GenThemedField = Component.gen(function* (_props: TextFieldProps) {
  return yield* h.div({ class: themeStream2 });
});

test("internal R unioned with caller's prop R", () => {
  expect(GenThemedField({ name: "email", value: userStream })).type.toBe<
    Node<never, UserService | ThemeService2>
  >();
});

// --- Component.gen: children array ---

const GenWithChildren = Component.gen(function* (_props, children) {
  return yield* h.div({ class: "field" }, children);
});

test("E from child effect unioned through children array", () => {
  expect(
    GenWithChildren({}, [
      Effect.gen(function* () {
        if (Math.random() > 0.5) yield* Effect.fail("t13" as const);
        return yield* h.span({});
      }),
    ]),
  ).type.toBe<Node<"t13", never>>();
});

// --- Component.gen: function children ---

const GenWithFnChildren = Component.gen(function* (
  _props: { value?: string | Stream.Stream<string, any, any> },
  children: (message: string) => readonly Renderable[],
) {
  return yield* h.div({ class: "field" }, children("message"));
});

test("function-as-children: E from yielded child, R from reactive prop unioned", () => {
  expect(
    GenWithFnChildren({ value: userStream }, (message) => [
      h.div({}, "Static child"),
      Effect.gen(function* () {
        if (Math.random() > 0.5) yield* Effect.fail("t14" as const);
        return yield* h.span({}, message);
      }),
    ]),
  ).type.toBe<Node<"t14", UserService>>();
});

// =============================================================================
// Component.make
// =============================================================================

// --- Component.make: props only ---

const MakeField = Component.make((_props: TextFieldProps) => h.div({ class: "field" }));

test("static props: Node<never, never>", () => {
  expect(MakeField({ name: "email", value: "static" })).type.toBe<Node<never, never>>();
});

test("reactive prop R propagates out", () => {
  expect(MakeField({ name: "email", value: userStream })).type.toBe<Node<never, UserService>>();
});

const MakeThemedField = Component.make((_props: TextFieldProps) => h.div({ class: themeStream2 }));

test("internal R unioned with caller's prop R", () => {
  expect(MakeThemedField({ name: "email", value: userStream })).type.toBe<
    Node<never, UserService | ThemeService2>
  >();
});

const MakeErrorField = Component.make((_props: TextFieldProps) =>
  Effect.flatMap(dbEffect, (val) => h.div({}, val)),
);

test("E from internal effect propagates out", () => {
  expect(MakeErrorField({ name: "email" })).type.toBe<Node<DbError, DbService>>();
});

test("E and R from both props and body unioned", () => {
  expect(MakeErrorField({ name: "email", value: userStream })).type.toBe<
    Node<DbError, UserService | DbService>
  >();
});

// --- Component.make: children array ---

const MakeWithChildren = Component.make((_props, children: readonly Renderable[]) =>
  h.div({ class: "field" }, children),
);

test("E from child effect unioned through children array", () => {
  expect(
    MakeWithChildren({}, [
      Effect.gen(function* () {
        if (Math.random() > 0.5) yield* Effect.fail("t20" as const);
        return yield* h.span({});
      }),
    ]),
  ).type.toBe<Node<"t20", never>>();
});

// --- Component.make: function children ---

const MakeWithFnChildren = Component.make(
  (
    _props: { value?: string | Stream.Stream<string, any, any> },
    children: (message: string) => readonly Renderable[],
  ) => h.div({ class: "field" }, children("message")),
);

test("function-as-children: E from yielded child, R from reactive prop unioned", () => {
  expect(
    MakeWithFnChildren({ value: userStream }, (message) => [
      h.div({}, "Static child"),
      Effect.gen(function* () {
        if (Math.random() > 0.5) yield* Effect.fail("t21" as const);
        return yield* h.span({}, message);
      }),
    ]),
  ).type.toBe<Node<"t21", UserService>>();
});

// =============================================================================
// Invalid use of children
// =============================================================================

// --- h.* element children ---

test("arbitrary object is not a Renderable", () => {
  // `{}` is not assignable to `Renderable`
  expect(h.div).type.not.toBeCallableWith({}, [{}]);
});

test("a bare function is not a Renderable", () => {
  // `() => Node` is not assignable to `Renderable`
  expect(h.div).type.not.toBeCallableWith({}, [() => h.span({})]);
});

test("a string is a valid first argument (single static child)", () => {
  h.div("valid first arg");
});

test("a number is a valid first argument (single static child)", () => {
  h.div(42);
});

test("a Symbol is not a Renderable", () => {
  // `symbol` is not assignable to `Renderable`
  expect(h.div).type.not.toBeCallableWith({}, [Symbol("x")]);
});

test("a well-formed bare ElementDescriptor IS a valid Renderable child", () => {
  // (Renderable subsumes the renderer's descriptor shape: see types/index.ts.)
  expect({
    type: "span",
    props: { children: ["hello"] },
  }).type.toBeAssignableTo<ElementDescriptor>();
  const _descriptorChild: ElementDescriptor = { type: "span", props: { children: ["hello"] } };
  h.div({}, [_descriptorChild]);
  h.div([{ type: "span", props: { children: ["hello"] } }]);
});

// --- Component children: array vs function mismatches ---

// Default `Children` for a gen component with no children typed is `readonly Renderable[]`,
// so passing a function should fail.
const GenArrayOnly = Component.gen(function* (_props: Record<string, never>) {
  return yield* h.div({});
});

test("array-children component invoked with a function", () => {
  // function not assignable to `readonly Renderable[]`
  expect(GenArrayOnly).type.not.toBeCallableWith({}, () => [h.span({})]);
});

// A component that declares function-children should reject array literals.
const GenFnOnly = Component.gen(function* (
  _props: Record<string, never>,
  _kids: (msg: string) => readonly Renderable[],
) {
  return yield* h.div({});
});

test("function-children component invoked with an array", () => {
  // array not assignable to `(msg: string) => readonly Renderable[]`
  expect(GenFnOnly).type.not.toBeCallableWith({}, [h.span({})]);
});

test("function-children: wrong return type (string instead of Renderable[])", () => {
  // `string` is not assignable to `readonly Renderable[]`
  expect(GenFnOnly).type.not.toBeCallableWith({}, (_msg: string) => "not an array");
});

test("function-children: wrong child shape inside returned array", () => {
  // `{}` is not assignable to `Renderable`
  expect(GenFnOnly).type.not.toBeCallableWith({}, (_msg: string) => [{}]);
});

// Mirror Component.make: array-only declaration rejects functions.
const MakeArrayOnly = Component.make((_props: Record<string, never>) => h.div({}));

test("Component.make array-children: function rejected", () => {
  // function not assignable to `readonly Renderable[]`
  expect(MakeArrayOnly).type.not.toBeCallableWith({}, () => [h.span({})]);
});

// Mirror Component.make: function-only declaration rejects arrays.
const MakeFnOnly = Component.make(
  (_props: Record<string, never>, _kids: (msg: string) => readonly Renderable[]) => h.div({}),
);

test("Component.make function-children: array rejected", () => {
  // array not assignable to `(msg: string) => readonly Renderable[]`
  expect(MakeFnOnly).type.not.toBeCallableWith({}, [h.span({})]);
});
