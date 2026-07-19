import * as assert from "node:assert/strict";
import { describe, test } from "vite-plus/test";
import { Effect } from "effect";
import { makeH, type ElementFn } from "./element";
import { Component } from "./component";
import type { Renderable, ElementDescriptor } from "./types";

const h = makeH();

describe("createElementFn: arg normalization", () => {
  test("empty props, no children", () => {
    const node = Effect.runSync(h.div({}));
    assert.deepEqual(node, { type: "div", props: {} });
  });

  test("single child, no props", () => {
    const node = Effect.runSync(h.div("test"));
    assert.deepEqual(node, { type: "div", props: { children: "test" } });
  });

  test("no children, no props", () => {
    const node = Effect.runSync(h.div());
    assert.deepEqual(node, { type: "div", props: {} });
  });

  test("props only → props passed through, no children key", () => {
    const node = Effect.runSync(h.div({ id: "x" }));
    assert.deepEqual(node, { type: "div", props: { id: "x" } });
  });

  test("array children only → children under props.children, empty props", () => {
    const node = Effect.runSync(h.div(["text"]));
    assert.deepEqual(node, { type: "div", props: { children: ["text"] } });
  });

  test("props + array children → both merged", () => {
    const node = Effect.runSync(h.div({ id: "x" }, ["text"]));
    assert.deepEqual(node, { type: "div", props: { id: "x", children: ["text"] } });
  });

  test("props + single string child → child placed under props.children", () => {
    const node = Effect.runSync(h.div({ id: "x" }, "text"));
    assert.deepEqual(node, { type: "div", props: { id: "x", children: "text" } });
  });
});

describe("h proxy cache (makeH)", () => {
  test("starts empty and populates lazily on first access", () => {
    const cache = new Map<string, ElementFn<any>>();
    const h2 = makeH(cache);
    assert.equal(cache.size, 0);

    const div = h2.div;
    assert.equal(cache.size, 1);
    assert.ok(cache.has("div"));
    assert.equal(typeof div, "function");
  });

  test("returns the same function reference for the same tag", () => {
    const cache = new Map<string, ElementFn<any>>();
    const h2 = makeH(cache);
    const first = h2.div;
    const second = h2.div;
    assert.equal(first, second);
    assert.equal(cache.size, 1);
  });

  test("returns distinct functions for distinct tags", () => {
    const cache = new Map<string, ElementFn<any>>();
    const h2 = makeH(cache);
    assert.notEqual(h2.div, h2.span);
    assert.equal(cache.size, 2);
  });

  test("independent instances do not share cache state", () => {
    const cacheA = new Map<string, ElementFn<any>>();
    const cacheB = new Map<string, ElementFn<any>>();
    const hA = makeH(cacheA);
    const hB = makeH(cacheB);

    void hA.div;
    assert.equal(cacheA.size, 1);
    assert.equal(cacheB.size, 0);
    assert.notEqual(hA.div, hB.div);
  });
});

describe("Component function-children forwarding", () => {
  test("Component.gen forwards the children function and uses its resolved array", () => {
    let received: string | undefined;
    const Comp = Component.gen(function* (
      _props: Record<string, never>,
      kids: (msg: string) => readonly Renderable[],
    ) {
      return yield* h.div({}, kids("hello"));
    });

    const node = Effect.runSync(
      Comp({}, (msg) => {
        received = msg;
        return [`got:${msg}`];
      }) as Effect.Effect<ElementDescriptor>,
    );

    assert.equal(received, "hello");
    assert.deepEqual(node, { type: "div", props: { children: ["got:hello"] } });
  });

  test("Component.make forwards the children function and uses its resolved array", () => {
    let received: string | undefined;
    const Comp = Component.make(
      (_props: Record<string, never>, kids: (msg: string) => readonly Renderable[]) =>
        h.div({}, kids("hello")),
    );

    const node = Effect.runSync(
      Comp({}, (msg) => {
        received = msg;
        return [`got:${msg}`];
      }) as Effect.Effect<ElementDescriptor>,
    );

    assert.equal(received, "hello");
    assert.deepEqual(node, { type: "div", props: { children: ["got:hello"] } });
  });
});
