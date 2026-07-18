/**
 * Type tests for the `Node` channel accessors (`Node.Error` / `Node.Context`)
 * and their re-exports on the `List` and `Component` namespaces. A `Node`'s
 * success channel is fixed to `ElementDescriptor`, so only the error and
 * requirement channels are exposed.
 */

import { expect, test } from "tstyche";
import { Effect, Stream } from "effect";
import type { Node } from "../types";
import { Component } from "../component";
import { List } from "../list";
import { h } from "../element";

// =============================================================================
// Mock channels
// =============================================================================

interface RowService {
  readonly _: unique symbol;
}
class RowError {
  readonly _tag = "RowError";
}

type PlainNode = Node<RowError, RowService>;

declare const nameStream: Stream.Stream<string, RowError, RowService>;
declare const handlerWithService: Effect.Effect<void, never, RowService>;
declare const handlerWithError: Effect.Effect<void, RowError, never>;

// =============================================================================
// Node.Error / Node.Context
// =============================================================================

test("Node.Error / Node.Context", () => {
  expect<Node.Error<PlainNode>>().type.toBe<RowError>();
  expect<Node.Context<PlainNode>>().type.toBe<RowService>();
  // A static node contributes `never` on both channels.
  expect<Node.Error<Node<never, never>>>().type.toBe<never>();
  expect<Node.Context<Node<never, never>>>().type.toBe<never>();
});

// =============================================================================
// List.Error / List.Context re-export the Node accessors identically
// =============================================================================

test("List.Error / List.Context re-export the Node accessors identically", () => {
  expect<List.Error<PlainNode>>().type.toBe<Node.Error<PlainNode>>();
  expect<List.Context<PlainNode>>().type.toBe<Node.Context<PlainNode>>();
});

test("applied to a real List.each result", () => {
  const _list = List.each({ of: [{ id: "a" }] }, () => h.li({}, [nameStream]));
  expect<List.Error<typeof _list>>().type.toBe<RowError>();
  expect<List.Context<typeof _list>>().type.toBe<RowService>();
});

// =============================================================================
// Component.Error / Component.Context re-export the Node accessors identically
// =============================================================================

test("Component.Error / Component.Context re-export the Node accessors identically", () => {
  expect<Component.Error<PlainNode>>().type.toBe<Node.Error<PlainNode>>();
  expect<Component.Context<PlainNode>>().type.toBe<Node.Context<PlainNode>>();
});

test("applied to the node a component call produces", () => {
  const Avatar = Component.make((props: { src: Stream.Stream<string, RowError, RowService> }) =>
    h.img({ src: props.src }),
  );
  const _avatarNode = Avatar({ src: nameStream });
  expect<Component.Error<typeof _avatarNode>>().type.toBe<RowError>();
  expect<Component.Context<typeof _avatarNode>>().type.toBe<RowService>();
});

// =============================================================================
// Event handler props surface their Effect E/R channels in the Node type
// =============================================================================

test("handler requiring a service ⇒ R surfaces on the node", () => {
  const _btnService = h.button({ onclick: () => handlerWithService }, ["go"]);
  expect<Node.Error<typeof _btnService>>().type.toBe<never>();
  expect<Node.Context<typeof _btnService>>().type.toBe<RowService>();
});

test("handler that can fail ⇒ E surfaces on the node", () => {
  const _btnError = h.button({ onclick: () => handlerWithError }, ["go"]);
  expect<Node.Error<typeof _btnError>>().type.toBe<RowError>();
  expect<Node.Context<typeof _btnError>>().type.toBe<never>();
});

test("plain void handler contributes nothing", () => {
  const _btnVoid = h.button(
    {
      onclick: () => {
        /* side effect only */
      },
    },
    ["go"],
  );
  expect<Node.Error<typeof _btnVoid>>().type.toBe<never>();
  expect<Node.Context<typeof _btnVoid>>().type.toBe<never>();
});
