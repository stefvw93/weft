import { Cause, Effect, Exit, Stream, pipe } from "effect";
import type { Option, SubscriptionRef } from "effect";
import { NoPropValue, Subscribable, isStream } from "@weftui/core";
import { isEventHandler } from "~/shared";
import type { Source } from "@weftui/core";

/**
 * The prop-bag argument shape accepted by `h.*` element builders.
 * Loosely constrained because {@link merge} dispatches on the key
 * (`class`, `style`, `ref`, `on*`), not on the bag's declared type.
 */
export type DomProps = object;

/** Any reactive prop value: the non-static arms of `Source.Source`. */
type ReactiveValue =
  | Stream.Stream<any, any, any>
  | Effect.Effect<any, any, any>
  | Subscribable.Subscribable<any, any, any>;

/** Any function value, used to detect plain event-handler functions. */
type AnyFunction = (...args: ReadonlyArray<any>) => any;

/** The lowercase third character the renderer's `isEventHandler` check requires. */
type LowercaseLetter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";

/**
 * Type-level form of the renderer's `isEventHandler` check. Mirrors it exactly,
 * including the lowercase third character: Weft's DOM handler props are all
 * lowercase (`onclick`), so a camelCase `onClick` is not a handler key and must
 * type as last-wins, matching what the runtime does with it.
 */
type EventHandlerKey = `on${LowercaseLetter}${string}`;

/**
 * Error channel a handler side contributes. Covers a plain handler returning an
 * Effect and the reactive `Stream`/`Effect`-of-handler forms core's
 * `EventHandler` allows, so a reactive side keeps its channel even though the
 * runtime treats it as last-wins.
 */
type HandlerError<H> = H extends (...args: ReadonlyArray<any>) => infer Ret
  ? Ret extends Effect.Effect<any, infer E, any>
    ? E
    : never
  : H extends Stream.Stream<any, infer E, any>
    ? E
    : H extends Effect.Effect<any, infer E, any>
      ? E
      : never;

/** Context channel a handler side contributes; mirrors {@link HandlerError}. */
type HandlerContext<H> = H extends (...args: ReadonlyArray<any>) => infer Ret
  ? Ret extends Effect.Effect<any, any, infer R>
    ? R
    : never
  : H extends Stream.Stream<any, any, infer R>
    ? R
    : H extends Effect.Effect<any, any, infer R>
      ? R
      : never;

/**
 * A handler side with its "no handler" arms removed. Core declares handler
 * props as `null | false | EventHandler<...>`, and leaving those in place makes
 * the event-parameter match below fail, degrading the merged handler's event to
 * the base `Event` (so `ev.clientX` stops compiling). Kept separate from
 * {@link Present}, which must not strip `false` from ordinary boolean props.
 */
type HandlerSide<T> = Exclude<T, null | false | undefined>;

/** Event parameter of a chained handler: intersection of both sides' events. */
type MergedHandlerEvent<L, R> = [HandlerSide<L>] extends [(event: infer EL) => any]
  ? [HandlerSide<R>] extends [(event: infer ER) => any]
    ? EL & ER
    : EL
  : [HandlerSide<R>] extends [(event: infer ER2) => any]
    ? ER2
    : Event;

/**
 * Handler cell rule. If either side can carry a handler the merged value is a
 * handler function whose channels union both sides'; if neither can, the cell
 * is the nullish "no handler" type.
 *
 * The callable shape is deliberately coarse: core declares handler props as
 * `null | false | EventHandler<...>`, so a rule that only matched two bare
 * functions would miss every realistically-typed bag and drop the left side's
 * `E`/`R` from `PropsE`/`PropsR`. Channel accuracy is the part that must not
 * degrade, so it is computed from whatever shape each side has.
 */
type MergedHandlerValue<L, R> = [HandlerSide<L>, HandlerSide<R>] extends [never, never]
  ? // Neither side can carry a handler, so neither can the result.
      null | false | undefined
  : (
      event: MergedHandlerEvent<L, R>,
    ) => Effect.Effect<
      void,
      HandlerError<HandlerSide<L>> | HandlerError<HandlerSide<R>>,
      HandlerContext<HandlerSide<L>> | HandlerContext<HandlerSide<R>>
    >;

/**
 * Class cell rule. A side that cannot carry a reactive value joins statically,
 * so two such sides stay a plain `string` and the descriptor remains
 * analyzable (AC8). If either side might be reactive the cell is exactly a
 * `Stream`, never a union: `PropsE`/`PropsR` extract channels by matching
 * `P[K] extends Stream<...>`, and a union would fail that match and silently
 * drop the class's `E`/`R`. Erring toward `Stream` is therefore the safe
 * direction, at the cost of over-reporting for a wide `Source<string>` side.
 */
type MergedClassValue<L, R> = true extends IsReactiveCxInput<L> | IsReactiveCxInput<R>
  ? Stream.Stream<
      string,
      CxInputError<L> | CxInputError<R> | NoPropValue,
      CxInputContext<L> | CxInputContext<R>
    >
  : string;

/**
 * True for a per-property style object. Mirrors the runtime
 * `isPlainStyleObject`, including its array exclusion, so the two cannot
 * disagree about which shape takes the object-merge branch.
 */
type IsStyleObject<V> = V extends object
  ? V extends ReactiveValue | AnyFunction | ReadonlyArray<any>
    ? false
    : true
  : false;

/**
 * Style cell rule: object plus object takes the key union with the right side
 * winning per key, each surviving value passed through by reference.
 * Any other shape on either side is last-wins.
 */
type MergedStyleValue<L, R> = [IsStyleObject<L>, IsStyleObject<R>] extends [true, true]
  ? {
      readonly [K in keyof L | keyof R]: K extends keyof R
        ? R[K]
        : K extends keyof L
          ? L[K]
          : never;
    }
  : R;

/**
 * Ref cell rule: both sides concatenate into one readonly fan-out array.
 * Typed against the same permissive element as the core `ref` array arm so the
 * result stays assignable to any element builder. `SubscriptionRef` is
 * invariant, so a union of the two sides' exact ref types would reject the
 * heterogeneous fan-out this rule exists to enable (AC14a).
 */
type MergedRefValue = ReadonlyArray<SubscriptionRef.SubscriptionRef<Option.Option<any>>>;

/**
 * The value a side actually carries when its key is present. An optional prop
 * indexes to `T | undefined`; the cell rules must dispatch on `T`, or every
 * pattern match below silently falls through to last-wins.
 */
type Present<T> = Exclude<T, undefined>;

/** Per-key dispatch for a key present on both sides. */
type MergedValue<K extends PropertyKey, L, R> = K extends "class"
  ? MergedClassValue<Present<L>, Present<R>>
  : K extends "style"
    ? MergedStyleValue<Present<L>, Present<R>>
    : K extends "ref"
      ? MergedRefValue
      : K extends EventHandlerKey
        ? MergedHandlerValue<Present<L>, Present<R>>
        : Present<R>;

/**
 * The cell for a key both bags declare.
 *
 * When one side's key is optional it may be absent at runtime, in which case
 * the other side's value survives unmerged. That outcome is deliberately not
 * unioned in: each cell rule above is already coarse enough to accept it at a
 * prop slot, and unioning the bare side back in would reintroduce the invariant
 * `SubscriptionRef` that makes the AC14a fan-out fail to compile.
 */
type MergedSharedValue<K extends keyof L & keyof R, L, R> = MergedValue<K, L[K], R[K]>;

/** Flattens an intersection into one object type, preserving optional modifiers. */
type Simplify<T> = { [K in keyof T]: T[K] };

/** Keys only the left bag has. Homomorphic over `L`, so `?` modifiers survive. */
type MergedLeftOnly<L, R> = {
  readonly [K in keyof L as K extends keyof R ? never : K]: L[K];
};

/** Keys only the right bag has. Homomorphic over `R`, so `?` modifiers survive. */
type MergedRightOnly<L, R> = {
  readonly [K in keyof R as K extends keyof L ? never : K]: R[K];
};

/**
 * Keys both bags declare. Emitted as required (`-?`) with an undefined-free
 * value, because `PropsE`/`PropsR` extract channels by matching `P[K]` against
 * a function or `Stream` shape, and a `T | undefined` union fails that match
 * and silently drops the key's `E`/`R`. Channel accuracy outranks presence
 * precision here, so a shared key that is optional on both sides and absent at
 * runtime is still typed as present.
 */
type MergedShared<L, R> = {
  readonly [K in keyof L & keyof R]-?: MergedSharedValue<K, L, R>;
};

/**
 * Binary merge of two bags: shared keys via {@link MergedValue}, rest pass
 * through. Built from two homomorphic mapped types so optional keys stay
 * optional. A single `[K in keyof L | keyof R]` map would mark every key
 * required, claiming keys are present that the runtime never copied.
 */
type MergedPair<L, R> = Simplify<MergedLeftOnly<L, R> & MergedRightOnly<L, R> & MergedShared<L, R>>;

/** The empty bag: identity of the merge monoid and result of `merge()`. */
type EmptyBag = Readonly<Record<never, never>>;

/**
 * Result of {@link merge}: a left-to-right fold of {@link MergedPair} over the
 * bag tuple. Value types stay coarse but `E`/`R` channels stay precise, so
 * `PropsE`/`PropsR` accumulate the full union through `h.*`.
 */
export type Merged<Bags extends ReadonlyArray<DomProps>> = Bags extends readonly []
  ? EmptyBag
  : Bags extends readonly [infer Only extends DomProps]
    ? Only
    : Bags extends readonly [
          infer L extends DomProps,
          infer R extends DomProps,
          ...infer Rest extends ReadonlyArray<DomProps>,
        ]
      ? Merged<[MergedPair<L, R>, ...Rest]>
      : // Not a tuple (e.g. `DomProps[]` spread at the call site): the arity is
        // unknown, so fold the element type with itself rather than erasing every
        // prop, which would drop the `E`/`R` channels `h.*` depends on.
        MergedPair<Bags[number], Bags[number]>;

/**
 * Merge DOM prop bags left to right. Pure: the result is a plain prop bag of
 * ordinary Weft prop values, so `h.*` accepts it and `PropsE`/`PropsR` carry
 * the error and context channels through. `{}` is the identity, and the fold is
 * associative except for `style` when a non-object form takes part (see below).
 *
 * Rules for a key present on both sides:
 *
 * - `on*`: chained left to right, both always run, failures isolated and causes aggregated.
 * - `class`: space-concatenated. Static stays a `string`, reactive derives a `Stream<string>`.
 * - `style`: two per-property objects merge per key (right wins). Other forms are
 *   last-wins, which discards a side and so is not associative (v1 limitation).
 * - `ref`: fan-out. Refs concatenate into an array and every ref is set.
 * - anything else: last-wins.
 *
 * Keys on only one side pass through untouched.
 *
 * @param bags - Lowest precedence first.
 */
export function merge<const Bags extends ReadonlyArray<DomProps>>(...bags: Bags): Merged<Bags> {
  return bags.reduce<Record<string, unknown>>(
    (left, right) => mergePair(left, right as Record<string, unknown>),
    {},
  ) as Merged<Bags>;
}

/** Binary runtime fold step: shared keys dispatch to {@link mergeCellValue}. */
function mergePair(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    out[key] = Object.hasOwn(left, key) ? mergeCellValue(key, left[key], value) : value;
  }
  return out;
}

/** True for a `Stream`, `Effect`, or `Subscribable` value. */
function isReactiveValue(value: unknown): boolean {
  return isStream(value) || Effect.isEffect(value) || Subscribable.isSubscribable(value);
}

/**
 * True for a per-property style object: a plain record, not a string, array,
 * reactive value, or class instance. The prototype check matters because a
 * boxed object (an Effect `SubscriptionRef`, say) would otherwise be spread
 * field by field into the merged style, emitting its internals as CSS
 * declarations.
 */
function isPlainStyleObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !isReactiveValue(value) &&
    isPlainRecord(value)
  );
}

/** Per-key runtime dispatch for a key present on both sides. */
function mergeCellValue(key: string, left: unknown, right: unknown): unknown {
  // Ref first: `toRefArray` already drops nullish entries, and the cell must
  // always produce an array so the result matches its declared type.
  if (key === "ref") {
    return [...toRefArray(left), ...toRefArray(right)];
  }
  if (key === "class") {
    // An empty join stays the empty string, exactly as `cx` returns it (and as
    // clsx does). Mapping it to `undefined` was tried and reverted: it could
    // never be applied consistently, because AC5 passes a one-sided `class`
    // through untouched, so `merge(base, {})` and `merge(base, { class: "" })`
    // would render differently. It also made the public `cx` emit `undefined`
    // while typed `Stream<string>`.
    return buildCx([left as CxInput, right as CxInput], "class");
  }
  if (key === "style") {
    return isPlainStyleObject(left) && isPlainStyleObject(right) ? { ...left, ...right } : right;
  }
  if (isEventHandler(key)) {
    if (typeof left === "function" && typeof right === "function") {
      return chainHandlers(left as AnyFunction, right as AnyFunction);
    }
    // `null`/`undefined` mean "not provided", so the left survives whatever
    // shape it has. Gating on `typeof left === "function"` would silently drop
    // a reactive handler (core's `Stream`/`Effect`-of-handler form) whenever a
    // caller forwards an omitted optional `onclick`.
    //
    // `false` is different: the renderer reads it as an explicit "no handler",
    // so it is the caller's way to switch a behavior primitive's handler off.
    // Treating it as "not provided" would make that impossible.
    if (right === null || right === undefined) {
      return left;
    }
    return right;
  }
  return right;
}

/**
 * Normalizes a ref side (single ref or fan-out array) for concatenation.
 * Nullish entries are dropped: an optional ref forwarded as `undefined` must
 * not land in the array, or the renderer's all-or-nothing ref-array check
 * would reject the whole fan-out and leave every ref unset.
 */
function toRefArray(value: unknown): ReadonlyArray<unknown> {
  const items = Array.isArray(value) ? value : [value];
  return items.filter((item) => item !== null && item !== undefined);
}

/**
 * Invokes one handler body immediately and returns whatever Effect it produced
 * (`Effect.void` for a plain void handler, a died Effect for a throw).
 *
 * Eager invocation is the point: two separate DOM listeners both run during
 * dispatch, so a `preventDefault()` written in either body has to land before
 * the browser decides the default action. Deferring the call until the Effect
 * runs would make that depend on whether the other side's Effect suspends.
 */
function invokeHandler(handler: AnyFunction, event: unknown): Effect.Effect<void, unknown> {
  try {
    const result = handler(event);
    return Effect.isEffect(result) ? (result as Effect.Effect<void, unknown>) : Effect.void;
  } catch (error) {
    return Effect.die(error);
  }
}

/**
 * Chains two handlers left to right. A failure in one never prevents the other,
 * and failures from both sides are aggregated into one cause. Interruption is
 * left to the runtime: the chain is one Effect, so interrupting the fiber
 * interrupts it wherever it has reached.
 */
function chainHandlers(left: AnyFunction, right: AnyFunction): AnyFunction {
  return (event: unknown) => {
    // Both bodies run now, left then right; only their Effects are sequenced.
    const leftEffect = invokeHandler(left, event);
    const rightEffect = invokeHandler(right, event);
    return Effect.gen(function* () {
      const leftExit = yield* Effect.exit(leftEffect);
      const rightExit = yield* Effect.exit(rightEffect);
      if (Exit.isFailure(leftExit) && Exit.isFailure(rightExit)) {
        // Concatenate reasons rather than `Cause.combine`, which de-duplicates
        // by value equality: two handlers failing with equal errors are two
        // separate failures and both belong in the report.
        return yield* Effect.failCause(
          Cause.fromReasons([...leftExit.cause.reasons, ...rightExit.cause.reasons]),
        );
      }
      if (Exit.isFailure(leftExit)) {
        return yield* Effect.failCause(leftExit.cause);
      }
      if (Exit.isFailure(rightExit)) {
        return yield* Effect.failCause(rightExit.cause);
      }
    });
  };
}

/** A reactive string value accepted by {@link cx} in value position. */
type CxReactiveValue =
  | Stream.Stream<string, any, any>
  | Effect.Effect<string, any, any>
  | Subscribable.Subscribable<string, any, any>;

/** A condition in a {@link cx} record: a static or reactive boolean. */
type CxCondition =
  | boolean
  | Stream.Stream<boolean, any, any>
  | Effect.Effect<boolean, any, any>
  | Subscribable.Subscribable<boolean, any, any>;

/**
 * Record form of a {@link cx} input: each key is a class name included while
 * its condition is truthy. Reactive conditions are the difference from clsx.
 */
export interface CxRecord {
  readonly [className: string]: CxCondition;
}

/**
 * One input to {@link cx}: a string, a falsy value (skipped), a reactive
 * string, a condition record, or a nested array of inputs.
 */
export type CxInput =
  | string
  | false
  | null
  | undefined
  | CxReactiveValue
  | CxRecord
  | ReadonlyArray<CxInput>;

/** True when a {@link cx} input contains a reactive value at any depth. */
type IsReactiveCxInput<I> = I extends ReactiveValue
  ? true
  : I extends ReadonlyArray<infer Item>
    ? IsReactiveCxInput<Item>
    : I extends CxRecord
      ? I[keyof I] extends boolean
        ? false
        : true
      : false;

/** Union of the error channels contributed by a {@link cx} input. */
type CxInputError<I> = I extends ReactiveValue
  ? Source.Error<I>
  : I extends ReadonlyArray<infer Item>
    ? CxInputError<Item>
    : I extends CxRecord
      ? Source.Error<I[keyof I]>
      : never;

/** Union of the context channels contributed by a {@link cx} input. */
type CxInputContext<I> = I extends ReactiveValue
  ? Source.Context<I>
  : I extends ReadonlyArray<infer Item>
    ? CxInputContext<Item>
    : I extends CxRecord
      ? Source.Context<I[keyof I]>
      : never;

/**
 * Result of {@link cx}: a plain `string` when every input is static, otherwise
 * a `Stream<string>` unioning all reactive inputs' channels plus `NoPropValue`.
 */
export type CxResult<Inputs extends ReadonlyArray<CxInput>> =
  true extends IsReactiveCxInput<Inputs[number]>
    ? Stream.Stream<
        string,
        CxInputError<Inputs[number]> | NoPropValue,
        CxInputContext<Inputs[number]>
      >
    : string;

/**
 * Reactive clsx. Builds a class string from strings, falsy values (skipped),
 * nested arrays, and `{ className: condition }` records, where any value or
 * condition may be a `Stream`, `Effect`, or `Subscribable`.
 *
 * All-static inputs join into a plain string, so the descriptor stays
 * analyzable. Any reactive input derives a pure `Stream<string>` description,
 * the same engine {@link merge} uses for its `class` rule.
 *
 * @param inputs - Joined left to right, no dedupe.
 */
export function cx<const Inputs extends ReadonlyArray<CxInput>>(
  ...inputs: Inputs
): CxResult<Inputs> {
  return buildCx(inputs) as CxResult<Inputs>;
}

/**
 * One flattened segment of a cx computation: literal text, a reactive string
 * in value position, or a class name toggled by a reactive condition.
 */
type CxPart =
  | { readonly kind: "static"; readonly text: string }
  | { readonly kind: "value"; readonly source: unknown }
  | { readonly kind: "toggle"; readonly name: string; readonly source: unknown };

/** True for an object literal or null-prototype record, not a class instance. */
function isPlainRecord(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Flattens cx inputs recursively into an ordered part list. */
function flattenCxInputs(inputs: ReadonlyArray<CxInput>, parts: CxPart[]): void {
  for (const input of inputs) {
    if (input === false || input === null || input === undefined) {
      continue;
    }
    if (typeof input === "string") {
      if (input !== "") {
        parts.push({ kind: "static", text: input });
      }
      continue;
    }
    if (Array.isArray(input)) {
      flattenCxInputs(input, parts);
      continue;
    }
    if (isReactiveValue(input)) {
      parts.push({ kind: "value", source: input });
      continue;
    }
    // Only a plain record is a condition map. Anything else (a class instance,
    // a Date, some foreign box) would otherwise leak its internal field names
    // onto the element as class names.
    if (!isPlainRecord(input)) {
      continue;
    }
    for (const [name, condition] of Object.entries(input)) {
      if (isReactiveValue(condition)) {
        parts.push({ kind: "toggle", name, source: condition });
      } else if (condition) {
        parts.push({ kind: "static", text: name });
      }
    }
  }
}

/**
 * Joins parts into a class string, substituting each reactive part's latest
 * value by position. Empty and falsy segments are dropped.
 */
function renderCxParts(parts: ReadonlyArray<CxPart>, resolved: ReadonlyArray<unknown>): string {
  const segments: string[] = [];
  let reactiveIndex = 0;
  for (const part of parts) {
    if (part.kind === "static") {
      segments.push(part.text);
      continue;
    }
    const latest = resolved[reactiveIndex];
    reactiveIndex += 1;
    if (part.kind === "value") {
      if (typeof latest === "string" && latest !== "") {
        segments.push(latest);
      }
    } else if (latest) {
      segments.push(part.name);
    }
  }
  return segments.join(" ");
}

/**
 * Fails with `NoPropValue` when a stream completes without ever emitting,
 * mirroring `Source.toSubscribable`'s contract. State is per subscription
 * (`Stream.suspend`), so the description stays pure and reusable.
 */
function requireEmission<A, E, R>(
  stream: Stream.Stream<A, E, R>,
  key: string | undefined,
): Stream.Stream<A, E | NoPropValue, R> {
  return Stream.suspend(() => {
    let hasEmitted = false;
    return pipe(
      stream,
      Stream.tap(() =>
        Effect.sync(() => {
          hasEmitted = true;
        }),
      ),
      Stream.concat(
        Stream.suspend(() => (hasEmitted ? Stream.empty : Stream.fail(new NoPropValue({ key })))),
      ),
    ) as Stream.Stream<A, E | NoPropValue, R>;
  });
}

/**
 * Normalizes one reactive cx source into a Stream of its emissions. A `Stream`
 * or a `Subscribable`'s `changes` can end without ever emitting, which would
 * otherwise stall the combine forever, so both carry the `NoPropValue` guard.
 * An `Effect` always produces exactly one value.
 *
 * @param key - Prop name carried on `NoPropValue` for diagnostics. Absent for a
 * standalone `cx` call, whose result the caller may bind to any prop.
 */
function reactiveToStream(
  source: unknown,
  key: string | undefined,
): Stream.Stream<unknown, unknown> {
  if (isStream(source)) {
    return requireEmission(source as Stream.Stream<unknown, unknown>, key);
  }
  if (Effect.isEffect(source)) {
    return Stream.fromEffect(source as Effect.Effect<unknown, unknown>);
  }
  // A Subscribable's `changes` can stay open forever without emitting (a
  // SubscriptionRef broadcast never completes), so `requireEmission`'s
  // completion guard would never fire and the whole combine would stall,
  // swallowing the other side's class too. `get` is await-first and fails
  // `NoPropValue` when the source was empty, so seeding from it makes the
  // absent case observable. Concat, not merge: the order is guaranteed, so the
  // seeded value cannot arrive after a newer emission.
  const subscribable = source as Subscribable.Subscribable<unknown, unknown>;
  return Stream.concat(
    Stream.fromEffect(Subscribable.get(subscribable)),
    Subscribable.changes(subscribable),
  );
}

/**
 * The engine behind both `cx` and merge's `class` rule. All-static parts join
 * immediately; any reactive part derives a combine-latest `Stream<string>`.
 * Nothing is subscribed here, so the caller owns the subscription scope.
 */
function buildCx(
  inputs: ReadonlyArray<CxInput>,
  key?: string,
): string | Stream.Stream<string, unknown> {
  const parts: CxPart[] = [];
  flattenCxInputs(inputs, parts);
  const reactiveParts = parts.filter((part) => part.kind !== "static");
  if (reactiveParts.length === 0) {
    return renderCxParts(parts, []);
  }
  const changes = reactiveParts.map((part) => reactiveToStream(part.source, key));
  return pipe(
    Stream.zipLatestAll(...changes),
    Stream.map((latest) => renderCxParts(parts, latest)),
  );
}
