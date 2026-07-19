import { Effect, Stream } from "effect";

/** The tag type for an element descriptor: an HTML tag, a boundary symbol, or a component function. */
export type ElementType = symbol | string | ((props: Record<string, unknown>) => unknown);

/**
 * Virtual element descriptor produced by `h`, `h.fragment`, `Suspense`, and
 * components, and consumed by the renderers. This is the resolved value of a
 * {@link Node}: a plain object, not a browser DOM `Node`.
 */
export interface ElementDescriptor {
  readonly type: ElementType;
  readonly props: Record<string, unknown>;
}

/**
 * Every value the renderer can process: primitives, element descriptors,
 * iterables, and reactive streams/effects. A `Node` (`Effect<ElementDescriptor>`)
 * and a bare `ElementDescriptor` are both `Renderable`.
 *
 * The reactive members keep an `unknown` value channel: the renderer runs the
 * `Effect`/`Stream` and renders whatever it yields, so any effect or stream is a
 * valid child (its emitted value is rendered as a nested `Renderable`).
 */
export type Renderable =
  | void
  | null
  | undefined
  | string
  | number
  | bigint
  | boolean
  | ElementDescriptor
  | Iterable<Renderable>
  | Stream.Stream<unknown, any, any>
  | Effect.Effect<unknown, any, any>;

export * from "./html/aria";
export * from "./html/attributes";
export * from "./html/dom";
export * from "./html/html";
export * from "./html/svg";
