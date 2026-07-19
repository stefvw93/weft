import { elementNode } from "./descriptor";
import type { Node } from "./types";
import type { Source } from "~/source/source";

/**
 * Unique symbol identifying keyed-list nodes built by {@link List.each}. The
 * renderer special-cases descriptors carrying this `type`, mirroring how
 * `FRAGMENT` and the `Boundary` symbols are detected.
 */
export const LIST = Symbol("@weftui/core/list");

/** Element type carried by a list source: the element type of the emitted `Iterable`. */
type ItemOf<S> = Source.Success<S> extends Iterable<infer T> ? T : never;

/**
 * Keyed-list combinator namespace. The opt-in alternative to wholesale child
 * rebuilds: items are rendered once per key and reconciled across emissions.
 */
export namespace List {
  /**
   * Options for {@link each}.
   *
   * @typeParam S - The `of` source type (drives item/`E`/`R` inference).
   * @typeParam K - The key type produced by `by` (defaults to the item type).
   */
  export interface Options<S, K> {
    /**
     * The list source: a static `Iterable<T>`, or an `Effect`/`Stream`/
     * `Subscribable` of one. Each emission is materialized to an array to fix
     * order, then reconciled by key.
     */
    readonly of: S;
    /**
     * Projects an item to its reconciliation key, compared via Effect `Equal`
     * and hashed via `Hash`. Omitted ⇒ identity is the item itself. Use a
     * stable `t => t.id`; `(_, i) => i` is the index-key footgun (see specs).
     */
    readonly by?: (item: ItemOf<S>, index: number) => K;
  }

  /**
   * Declares a keyed reactive list region. `render` runs **once per key**; a
   * persisted key keeps its DOM nodes and its running subscription fibers across
   * re-emits (it is never re-invoked). The returned node's `E`/`R` are the union
   * of the source channels and the channels of the node `render` returns.
   */
  export function each<
    S extends Source.Source<Iterable<any>, any, any>,
    CE = never,
    CR = never,
    K = ItemOf<S>,
  >(
    options: Options<S, K>,
    render: (item: ItemOf<S>, index: number) => Node<CE, CR>,
  ): Node<Source.Error<S> | CE, Source.Context<S> | CR> {
    return elementNode({
      type: LIST,
      props: { of: options.of, by: options.by, render } as Record<string, unknown>,
    });
  }

  /**
   * Extract the error channel `E` from a list {@link Node}, re-exported from
   * {@link Node.Error}, the canonical accessor (a `Node`'s success channel is
   * fixed to `ElementDescriptor`, so only `Error`/`Context` are exposed here).
   */
  export type Error<N> = Node.Error<N>;
  /**
   * Extract the requirement channel `R` from a list {@link Node}, re-exported
   * from {@link Node.Context}, the canonical accessor.
   */
  export type Context<N> = Node.Context<N>;
}
