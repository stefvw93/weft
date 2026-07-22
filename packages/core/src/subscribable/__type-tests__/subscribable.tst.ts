/**
 * Type tests for the data-first `Subscribable` surface: brand-only interface,
 * module accessor return types, covariance on all three channels, and the
 * rejection of member-style reads (`x.get` / `x.changes`).
 */

import { expect, test } from "tstyche";
import type { Effect, Stream, Types } from "effect";
import * as Subscribable from "../index";

// =============================================================================
// Fixtures
// =============================================================================

interface DataService {
  readonly _: unique symbol;
}
class LoadError {
  readonly _tag = "LoadError";
}

interface Animal {
  readonly kind: string;
}
interface Dog extends Animal {
  readonly bark: true;
}

declare const sub: Subscribable.Subscribable<number, LoadError, DataService>;
declare const plain: Subscribable.Subscribable<number>;
declare const narrow: Subscribable.Subscribable<Dog>;
declare const wide: Subscribable.Subscribable<Animal, LoadError, DataService>;
declare const getEffect: Effect.Effect<number, LoadError, DataService>;
declare const changesStream: Stream.Stream<number, LoadError, DataService>;

type ExtractA<S> = S extends Subscribable.Subscribable<infer A, infer _E, infer _R> ? A : never;
type ExtractE<S> = S extends Subscribable.Subscribable<infer _A, infer E, infer _R> ? E : never;
type ExtractR<S> = S extends Subscribable.Subscribable<infer _A, infer _E, infer R> ? R : never;

// =============================================================================
// TypeId: literal on the type side
// =============================================================================

test("TypeId: type is the literal brand string, not widened", () => {
  expect<Subscribable.TypeId>().type.toBe<"~@weftui/core/Subscribable">();
});

// =============================================================================
// Variance: each phantom field is pinned to its own type parameter
// =============================================================================

test("Variance: phantom fields are Covariant of their own parameter", () => {
  expect<Subscribable.Variance<number, LoadError, DataService>["_A"]>().type.toBe<
    Types.Covariant<number>
  >();
  expect<Subscribable.Variance<number, LoadError, DataService>["_E"]>().type.toBe<
    Types.Covariant<LoadError>
  >();
  expect<Subscribable.Variance<number, LoadError, DataService>["_R"]>().type.toBe<
    Types.Covariant<DataService>
  >();
});

test("brand wiring: all three channels are inferable through the Subscribable brand", () => {
  expect<ExtractA<typeof sub>>().type.toBe<number>();
  expect<ExtractE<typeof sub>>().type.toBe<LoadError>();
  expect<ExtractR<typeof sub>>().type.toBe<DataService>();
});

// =============================================================================
// make: return type and channel inference
// =============================================================================

test("make: infers all three channels from the options object", () => {
  expect(Subscribable.make({ get: getEffect, changes: changesStream })).type.toBe<
    Subscribable.Subscribable<number, LoadError, DataService>
  >();
});

test("make: defaults E and R to never", () => {
  expect(
    Subscribable.make({
      get: null as unknown as Effect.Effect<string>,
      changes: null as unknown as Stream.Stream<string>,
    }),
  ).type.toBe<Subscribable.Subscribable<string, never, never>>();
});

// =============================================================================
// Module accessors: return types
// =============================================================================

test("get: returns the underlying Effect with all channels", () => {
  expect(Subscribable.get(sub)).type.toBe<Effect.Effect<number, LoadError, DataService>>();
  expect(Subscribable.get(plain)).type.toBe<Effect.Effect<number, never, never>>();
});

test("changes: returns the underlying Stream with all channels", () => {
  expect(Subscribable.changes(sub)).type.toBe<Stream.Stream<number, LoadError, DataService>>();
  expect(Subscribable.changes(plain)).type.toBe<Stream.Stream<number, never, never>>();
});

// =============================================================================
// Brand-only interface: member reads are rejected
// =============================================================================

test("member access: get and changes do not exist on the public interface", () => {
  expect(sub).type.not.toHaveProperty("get");
  expect(sub).type.not.toHaveProperty("changes");
});

// =============================================================================
// Covariance: narrow-to-wide accepted, wide-to-narrow rejected
// =============================================================================

test("covariance: narrower A/E/R assignable to wider", () => {
  expect(narrow).type.toBeAssignableTo<Subscribable.Subscribable<Animal>>();
  expect(plain).type.toBeAssignableTo<Subscribable.Subscribable<number, LoadError, DataService>>();
  expect(sub).type.toBeAssignableTo<Subscribable.Subscribable<unknown, unknown, unknown>>();
});

test("covariance: wider A not assignable to narrower", () => {
  expect(wide).type.not.toBeAssignableTo<Subscribable.Subscribable<Dog, LoadError, DataService>>();
});

test("covariance: wider E/R not assignable to narrower", () => {
  expect(sub).type.not.toBeAssignableTo<Subscribable.Subscribable<number, never, DataService>>();
  expect(sub).type.not.toBeAssignableTo<Subscribable.Subscribable<number, LoadError, never>>();
});

// =============================================================================
// Guard: isSubscribable narrows to the top Subscribable type
// =============================================================================

test("isSubscribable: narrows unknown to Subscribable<unknown, unknown, unknown>", () => {
  const u: unknown = null;
  if (Subscribable.isSubscribable(u)) {
    expect(u).type.toBe<Subscribable.Subscribable<unknown, unknown, unknown>>();
  }
});
