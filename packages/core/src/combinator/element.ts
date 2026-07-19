import { elementNode } from "./descriptor";
import { FRAGMENT } from "./fragment";
import type { HTMLElements, SVGElements } from "~/types";
import type {
  Renderable,
  ChildrenE,
  ChildrenR,
  CombinatorialProps,
  Node,
  PropsE,
  PropsR,
} from "./types";
import type { Source } from "~/source/source";

/** Augmentable interface for user-defined custom element tags and props. */
export interface CustomElements {}

/**
 * Callable type for an element builder (one per tag: `h.div`, `h.span`, …).
 * Every call shape preserves the caller's prop and child `E`/`R` channels on the
 * returned {@link Node}:
 *
 * - `el(props, children)`: props plus an array of children.
 * - `el(props, child)`: props plus a single `string | number` child.
 * - `el(props)`: props only, no children.
 * - `el(children)`: children only, no props.
 * - `el()`: no arguments, yielding a `Node<never, never>`.
 */
export interface ElementFn<Props> {
  <P extends Props, const C extends readonly Renderable[]>(
    props: P,
    children: C,
  ): Node<PropsE<P> | ChildrenE<C>, PropsR<P> | ChildrenR<C>>;
  <P extends Props>(props: P, child: string | number): Node<PropsE<P>, PropsR<P>>;
  <P extends Props>(props: P): Node<PropsE<P>, PropsR<P>>;
  <const C extends readonly Renderable[]>(children: C): Node<ChildrenE<C>, ChildrenR<C>>;
  (child: string | number): Node<never, never>;
  (): Node<never, never>;
}

type DataAttributes = {
  [attr: `data-${string}`]: Source.Source<string | number | undefined>;
};

type H = {
  /**
   * Builds a fragment node whose children render inline, with no wrapping
   * element. Equivalent to `<>…</>` in JSX. `E`/`R` from the children accumulate
   * on the returned {@link Node}.
   */
  fragment<const C extends readonly Renderable[]>(children: C): Node<ChildrenE<C>, ChildrenR<C>>;
} & {
  [K in keyof HTMLElements]: ElementFn<CombinatorialProps<HTMLElements[K] & DataAttributes>>;
} & {
  [K in keyof SVGElements]: ElementFn<CombinatorialProps<SVGElements[K] & DataAttributes>>;
} & {
  [K in keyof CustomElements]: ElementFn<CustomElements[K] & DataAttributes>;
};

function createElementFn(tag: string): ElementFn<any> {
  return ((propsOrChildren?: unknown, children?: unknown): Node<any, any> => {
    let props: Record<string, unknown> = {};
    let kids: unknown = undefined;

    if (Array.isArray(propsOrChildren)) {
      kids = propsOrChildren;
    } else if (typeof propsOrChildren === "string" || typeof propsOrChildren === "number") {
      kids = propsOrChildren;
    } else if (propsOrChildren !== undefined) {
      props = propsOrChildren as Record<string, unknown>;
      if (children !== undefined) kids = children;
    }

    const finalProps = kids !== undefined ? { ...props, children: kids } : props;
    return elementNode({ type: tag, props: finalProps }) as Node<any, any>;
  }) as ElementFn<any>;
}

/**
 * Builds an `h` proxy backed by the given cache. Each tag access lazily creates
 * an `ElementFn` and memoizes it, so repeat accesses return the same function
 * reference. Exposed for tests to observe an isolated cache; production code
 * should use the module-level `h`.
 */
export function makeH(cache: Map<string, ElementFn<any>> = new Map()): H {
  return new Proxy<H>(
    {
      fragment<C extends readonly Renderable[]>(children: C): Node<ChildrenE<C>, ChildrenR<C>> {
        return elementNode({ type: FRAGMENT, props: { children } }) as Node<any, any>;
      },
    } as H,
    {
      get(self, tag: string) {
        if (tag in self) return self[tag as keyof H];
        return cache.get(tag) ?? cache.set(tag, createElementFn(tag)).get(tag)!;
      },
    },
  );
}

export const h = makeH(new Map());
