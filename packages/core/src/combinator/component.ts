import { Effect } from "effect";
import type {
  Renderable,
  ChildrenE,
  ChildrenR,
  ElementDescriptor,
  Node,
  PropsE,
  PropsR,
} from "./types";

/**
 * Factories for building custom components whose returned `Node`s carry the
 * caller's prop `E`/`R` channels and the component's own internal `E`/`R`.
 * `Component.gen` takes a generator body (use `yield*` like `Effect.gen`);
 * `Component.make` takes a plain function returning any `Effect`. Both accept an
 * optional second `children` argument: an array of {@link Renderable}, or a
 * function `(input) => readonly Renderable[]` (the render-prop pattern).
 */
export namespace Component {
  /**
   * Shape of the optional `children` argument to a {@link Component}.
   *
   * - `readonly Renderable[]`: a flat list of children, the common case.
   * - `(input: Input) => readonly Renderable[]`: function-children. The component
   *   supplies `input` (some scoped value) and the caller returns the children
   *   array. Useful for render-prop / slot patterns.
   */
  export type Children<Input = never> =
    | readonly Renderable[]
    | ((input: Input) => readonly Renderable[]);

  /**
   * Extract the error channel `E` from the {@link Node} a component produces,
   * re-exported from {@link Node.Error}, the canonical accessor. Apply to a
   * component's return type, e.g. `Component.Error<ReturnType<typeof MyComponent>>`.
   */
  export type Error<N> = Node.Error<N>;
  /**
   * Extract the requirement channel `R` from the {@link Node} a component
   * produces, re-exported from {@link Node.Context}, the canonical accessor.
   */
  export type Context<N> = Node.Context<N>;

  /**
   * The callable shape returned by {@link gen} and {@link make}. Generic over
   * the caller's specific `GenP`/`GenC` so reactive prop values and reactive
   * children contribute their `E`/`R` to the resulting `Node` at the call site.
   * For function-children, `ChildrenE`/`ChildrenR` are extracted from the
   * function's `ReturnType` (the array the caller would produce), not from the
   * function itself.
   */
  export type Component<P, C extends Children, E, R> = <GenP extends P, GenC extends C>(
    props: GenP,
    children?: GenC,
  ) => Node<
    PropsE<GenP> | ChildrenE<GenC extends (...args: any[]) => any ? ReturnType<GenC> : GenC> | E,
    PropsR<GenP> | ChildrenR<GenC extends (...args: any[]) => any ? ReturnType<GenC> : GenC> | R
  >;

  /**
   * Defines a component whose body is an `Effect.gen`-style generator.
   *
   * The internal `E`/`R` are inferred from any `yield*`ed effects. Caller prop
   * `E`/`R` and children `E`/`R` are unioned in at the call site.
   *
   * @example
   * ```ts
   * const TextField = Component.gen(function* (props: { name: string; value?: Stream.Stream<string, any, any> }) {
   *   return yield* h.input({ name: props.name, value: props.value });
   * });
   *
   * TextField({ name: "email", value: userStream });
   * //   ^? Node<never, UserService>
   * ```
   *
   * @example Function-children (render-prop pattern)
   * ```ts
   * const Tooltip = Component.gen(function* (
   *   _props: { label: string },
   *   children: (anchorId: string) => readonly Renderable[],
   * ) {
   *   return yield* h.div({ class: "tooltip" }, children("anchor-42"));
   * });
   *
   * Tooltip({ label: "Help" }, (id) => [h.span({ id }, "?")]);
   * ```
   */
  export function gen<
    Eff extends Effect.Effect<any, any, any>,
    BaseProps = Record<string, never>,
    C extends Children = readonly Renderable[],
  >(
    f: (props: BaseProps, children: C) => Generator<Eff, ElementDescriptor, never>,
  ): Component.Component<
    BaseProps,
    C,
    Eff extends Effect.Effect<any, infer E, any> ? E : never,
    Eff extends Effect.Effect<any, any, infer R> ? R : never
  > {
    return (props: any, children: any = []) =>
      Effect.gen(function* () {
        return yield* f(props, children) as any;
      }) as any;
  }

  /**
   * Defines a component whose body is a plain function returning any `Effect`
   * (typically a {@link Node}). Use when the implementation is a one-liner or a
   * pipe composition, with no generator overhead. Same `E`/`R` propagation
   * semantics as {@link gen}: internal `E`/`R` come from the returned effect,
   * caller props and children contribute at the call site, and function-children
   * are supported via the optional second argument.
   */
  export function make<
    Eff extends Effect.Effect<any, any, any>,
    BaseProps = Record<string, never>,
    C extends Children = readonly Renderable[],
  >(
    f: (props: BaseProps, children: C) => Eff,
  ): Component<
    BaseProps,
    C,
    Eff extends Effect.Effect<any, infer E, any> ? E : never,
    Eff extends Effect.Effect<any, any, infer R> ? R : never
  > {
    return f as any;
  }
}
