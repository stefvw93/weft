/**
 * Type tests for `List.each` — item-type inference, E/R propagation across the
 * source and the render node, and `by` key typing.
 */

import { expect, test } from "tstyche";
import { Effect, Stream } from "effect";
import { Subscribable } from "@weftui/core";
import { List } from "../list";
import { h } from "../element";
import type { Node } from "../types";

// =============================================================================
// Mock services, errors, and item types
// =============================================================================

interface PersonService {
  readonly _: unique symbol;
}
interface RowService {
  readonly _: unique symbol;
}
class LoadError {
  readonly _tag = "LoadError";
}
class RowError {
  readonly _tag = "RowError";
}

interface Person {
  readonly id: string;
  readonly name: string;
}

declare const people: readonly Person[];
declare const peopleSet: ReadonlySet<Person>;
declare const peopleMap: ReadonlyMap<string, Person>;
declare const peopleStream: Stream.Stream<readonly Person[], LoadError, PersonService>;
declare const peopleEffect: Effect.Effect<readonly Person[], LoadError, PersonService>;
declare const peopleSub: Subscribable.Subscribable<readonly Person[], LoadError, PersonService>;

declare const nameStream: Stream.Stream<string, RowError, RowService>;

// =============================================================================
// Item-type inference — render's `item` parameter
// =============================================================================

test("static array ⇒ item is Person", () => {
  List.each({ of: people }, (person) => {
    expect(person).type.toBe<Person>();
    return h.li({}, person.name);
  });
});

test("Stream<Person[]> ⇒ item is Person", () => {
  List.each({ of: peopleStream }, (person) => {
    expect(person).type.toBe<Person>();
    return h.li({}, person.name);
  });
});

test("Effect<Person[]> ⇒ item is Person", () => {
  List.each({ of: peopleEffect }, (person) => {
    expect(person).type.toBe<Person>();
    return h.li({}, person.name);
  });
});

test("Subscribable<Person[]> ⇒ item is Person", () => {
  List.each({ of: peopleSub }, (person) => {
    expect(person).type.toBe<Person>();
    return h.li({}, person.name);
  });
});

test("Set<Person> (any Iterable) ⇒ item is Person", () => {
  List.each({ of: peopleSet }, (person) => {
    expect(person).type.toBe<Person>();
    return h.li({}, person.name);
  });
});

test("Map<string, Person> ⇒ item is the [key, value] entry tuple", () => {
  List.each({ of: peopleMap }, (entry) => {
    expect(entry).type.toBe<[string, Person]>();
    return h.li({}, entry[1].name);
  });
});

test("`index` is always number", () => {
  List.each({ of: people }, (_person, index) => {
    expect(index).type.toBe<number>();
    return h.li({}, String(index));
  });
});

// =============================================================================
// E/R propagation
// =============================================================================

test("static of + static render ⇒ Node<never, never>", () => {
  expect(List.each({ of: people }, (person) => h.li({}, person.name))).type.toBe<
    Node<never, never>
  >();
});

test("Stream source contributes E/R", () => {
  expect(List.each({ of: peopleStream }, (person) => h.li({}, person.name))).type.toBe<
    Node<LoadError, PersonService>
  >();
});

test("Effect source contributes E/R", () => {
  expect(List.each({ of: peopleEffect }, (person) => h.li({}, person.name))).type.toBe<
    Node<LoadError, PersonService>
  >();
});

test("Subscribable source contributes E/R", () => {
  expect(List.each({ of: peopleSub }, (person) => h.li({}, person.name))).type.toBe<
    Node<LoadError, PersonService>
  >();
});

test("reactive child inside render contributes CE/CR", () => {
  expect(List.each({ of: people }, (_person) => h.li({}, [nameStream]))).type.toBe<
    Node<RowError, RowService>
  >();
});

test("source channels and render channels are unioned", () => {
  expect(List.each({ of: peopleStream }, (_person) => h.li({}, [nameStream]))).type.toBe<
    Node<LoadError | RowError, PersonService | RowService>
  >();
});

// =============================================================================
// `by` key typing
// =============================================================================

test("by omitted is valid, channels unchanged", () => {
  expect(List.each({ of: peopleStream }, (person) => h.li({}, person.name))).type.toBe<
    Node<LoadError, PersonService>
  >();
});

test("by projects item ⇒ types item as Person, index as number", () => {
  const _t15 = List.each(
    {
      of: peopleStream,
      by: (person, index) => {
        expect(person).type.toBe<Person>();
        expect(index).type.toBe<number>();
        return person.id;
      },
    },
    (person) => h.li({}, person.name),
  );
  // by does not alter E/R
  expect(_t15).type.toBe<Node<LoadError, PersonService>>();
});

test("positional/index key compiles (the footgun is a runtime concern)", () => {
  expect(
    List.each({ of: people, by: (_person, index) => index }, (person) => h.li({}, person.name)),
  ).type.toBe<Node<never, never>>();
});

// =============================================================================
// Invalid uses
// =============================================================================

test("render receiving the wrong item type", () => {
  List.each({ of: people }, (person) => {
    // Person has no `age` field
    expect(person).type.not.toHaveProperty("age");
    return h.li({}, person.name);
  });
});

test("`of` must be an Iterable source — a bare non-iterable object is rejected", () => {
  // `{ count: number }` is not a `Source<Iterable<...>>`
  expect(List.each).type.not.toBeCallableWith({ of: { count: 1 } }, (item: unknown) =>
    h.li({}, String(item)),
  );
});
