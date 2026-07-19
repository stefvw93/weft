import { Effect } from "effect";
import type { ElementDescriptor } from "~/types";
import type { Node } from "./types";

/**
 * Non-enumerable property key under which a static-markup {@link Node} carries
 * its resolved {@link ElementDescriptor}. Lets renderers read the descriptor
 * without executing the Effect. See {@link elementNode} / {@link getElementDescriptor}.
 */
const ELEMENT_DESCRIPTOR = Symbol.for("@weftui/core/ElementDescriptor");

/**
 * Builds a static-markup {@link Node} for a known {@link ElementDescriptor}.
 *
 * The result is a normal `Effect.succeed(descriptor)` (fully `yield*`-able
 * inside `Component.gen` and indistinguishable to Effect), but additionally
 * carries the descriptor on a non-enumerable property. Renderers detect this via
 * {@link getElementDescriptor} and render the descriptor directly, with no
 * `runSync` probe (the reason `h.*`, `h.fragment`, and `Boundary.*` never need to
 * be executed to be identified).
 */
export function elementNode<E = never, R = never>(descriptor: ElementDescriptor): Node<E, R> {
  const node = Effect.succeed(descriptor);
  Object.defineProperty(node, ELEMENT_DESCRIPTOR, { value: descriptor, enumerable: false });
  return node as Node<E, R>;
}

/**
 * Reads the {@link ElementDescriptor} carried by a static-markup {@link Node}
 * built with {@link elementNode}, or `undefined` if `node` is anything else
 * (a primitive, an iterable, a `Stream`, or a reactive `Effect`).
 *
 * Renderers call this to take the static fast path (rendering the descriptor
 * directly) before falling back to running genuinely reactive Effects.
 */
export function getElementDescriptor(node: unknown): ElementDescriptor | undefined {
  return Effect.isEffect(node) && ELEMENT_DESCRIPTOR in node
    ? (node as { readonly [ELEMENT_DESCRIPTOR]: ElementDescriptor })[ELEMENT_DESCRIPTOR]
    : undefined;
}
