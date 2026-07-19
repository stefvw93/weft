import type { Effect, Stream } from "effect";
import type * as Subscribable from "~/subscribable";
import type { ElementDescriptor, Renderable } from "~/types";

export type { ElementDescriptor, Renderable };

/**
 * Widens a single prop value type so that Stream/Effect/Subscribable variants
 * accept any E and R, not just `never`. Static values (string, number, etc.)
 * are left unchanged. TypeScript distributes this over union types.
 */
export type OpenPropSource<T> =
  T extends Stream.Stream<infer A, any, any>
    ? Stream.Stream<A, any, any>
    : T extends Effect.Effect<infer A, any, any>
      ? Effect.Effect<A, any, any>
      : T extends Subscribable.Subscribable<infer A, any, any>
        ? Subscribable.Subscribable<A, any, any>
        : T;

/**
 * A node in the combinator tree.
 * IS an Effect: `yield*`, `Effect.gen`, and `pipe` all work natively. Resolves
 * to an {@link ElementDescriptor}.
 *
 * Declared as an interface (rather than a bare alias) so it can merge with the
 * {@link Node} namespace below, exposing Effect-style channel accessors
 * (`Node.Error` / `Node.Context`). An empty interface extending
 * `Effect.Effect<ElementDescriptor, E, R>` is structurally identical to the alias
 * it replaces, so `yield*`, `pipe`, and `Effect.gen` interop are unaffected.
 */
export interface Node<E = never, R = never> extends Effect.Effect<ElementDescriptor, E, R> {}

/**
 * Channel accessors for {@link Node}, mirroring Effect's
 * `Effect.Effect.Success`/`Error`/`Context`. A `Node`'s success channel is fixed
 * to {@link ElementDescriptor}, so only the error and requirement channels carry
 * information worth extracting.
 */
export namespace Node {
  /** Extract the error channel `E` from a {@link Node} (a static node ⇒ `never`). */
  export type Error<N> = [N] extends [Effect.Effect<any, infer E, any>] ? E : never;
  /** Extract the requirement channel `R` from a {@link Node} (a static node ⇒ `never`). */
  export type Context<N> = [N] extends [Effect.Effect<any, any, infer R>] ? R : never;
}

/** Extract E from a props object: Stream/Effect/Subscribable prop values and Effect-returning event handlers contribute their E channel. */
export type PropsE<P> = {
  [K in keyof P]: P[K] extends Stream.Stream<any, infer E, any>
    ? E
    : P[K] extends Effect.Effect<any, infer E, any>
      ? E
      : P[K] extends Subscribable.Subscribable<any, infer E, any>
        ? E
        : P[K] extends (...args: any[]) => infer Ret
          ? Ret extends Effect.Effect<any, infer E, any>
            ? E
            : never
          : never;
}[keyof P];

/** Extract R from a props object: Stream/Effect/Subscribable prop values and Effect-returning event handlers contribute their R channel. */
export type PropsR<P> = {
  [K in keyof P]: P[K] extends Stream.Stream<any, any, infer R>
    ? R
    : P[K] extends Effect.Effect<any, any, infer R>
      ? R
      : P[K] extends Subscribable.Subscribable<any, any, infer R>
        ? R
        : P[K] extends (...args: any[]) => infer Ret
          ? Ret extends Effect.Effect<any, any, infer R>
            ? R
            : never
          : never;
}[keyof P];

/** Extract E from a children array: Node (Effect) and Stream children contribute their E. */
export type ChildrenE<T extends readonly Renderable[]> = [T[number]] extends [never]
  ? never
  : {
      [K in keyof T]: T[K] extends Effect.Effect<any, infer E, any>
        ? E
        : T[K] extends Stream.Stream<any, infer E, any>
          ? E
          : never;
    }[number];

/** Extract R from a children array: Node (Effect) and Stream children contribute their R. */
export type ChildrenR<T extends readonly Renderable[]> = [T[number]] extends [never]
  ? never
  : {
      [K in keyof T]: T[K] extends Effect.Effect<any, any, infer R>
        ? R
        : T[K] extends Stream.Stream<any, any, infer R>
          ? R
          : never;
    }[number];

/**
 * Strip `children` from HTML prop types and widen all Source prop types to
 * allow any E/R, so callers can pass `Stream<T, E, R>` with real requirements.
 */
export type CombinatorialProps<P> = {
  [K in keyof Omit<P, "children">]: OpenPropSource<Omit<P, "children">[K]>;
};
