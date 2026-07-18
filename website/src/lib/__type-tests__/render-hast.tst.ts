/**
 * Type tests for `renderHast`: it accepts a `HastNode` and returns `Renderable[]`.
 */

import { expect, test } from "tstyche";
import type { Renderable } from "@weftui/core";
import type { HastNode } from "../markdown-loader";
import { renderHast } from "../render-hast";

declare const node: HastNode;

test("accepts a HastNode, returns Renderable[]", () => {
  expect(renderHast(node)).type.toBe<Renderable[]>();
});

test("the argument must be a HastNode, not a bare string", () => {
  expect(renderHast).type.not.toBeCallableWith("not a node");
});
