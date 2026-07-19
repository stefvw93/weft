import * as assert from "node:assert/strict";
import { describe, test } from "vite-plus/test";
import { List, LIST } from "./list";
import { getElementDescriptor } from "./descriptor";
import { h } from "./element";

interface Person {
  readonly id: string;
  readonly name: string;
}

const people: readonly Person[] = [
  { id: "a", name: "Ann" },
  { id: "b", name: "Bo" },
];

describe("List.each: detection & descriptor shape", () => {
  test("descriptor type is the LIST symbol, readable without running the effect", () => {
    const render = (person: Person) => h.li({}, person.name);
    const node = List.each({ of: people }, render);

    const descriptor = getElementDescriptor(node);
    assert.ok(descriptor, "expected a static-markup descriptor");
    assert.equal(descriptor.type, LIST);
  });

  test("props carry of/by/render", () => {
    const by = (person: Person) => person.id;
    const render = (person: Person) => h.li({}, person.name);
    const node = List.each({ of: people, by }, render);

    const descriptor = getElementDescriptor(node)!;
    assert.equal(descriptor.props.of, people);
    assert.equal(descriptor.props.by, by);
    assert.equal(descriptor.props.render, render);
  });

  test("by is optional: props.by is undefined when omitted", () => {
    const node = List.each({ of: people }, (person) => h.li({}, person.name));
    const descriptor = getElementDescriptor(node)!;
    assert.equal(descriptor.props.by, undefined);
    assert.ok("by" in descriptor.props, "by key is present (explicitly undefined)");
  });
});
