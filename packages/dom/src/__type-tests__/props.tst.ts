// Pins the Props.merge / Props.cx type surface (props.specs.md AC19–AC21):
// Merged<Bags> per-key result types, E/R channel unions through merged
// handlers and reactive class values, static-in/static-out for class and cx,
// ref fan-out arrays, and PropsE/PropsR propagation through h.*. Assertions
// are evaluated by `vp run test:types` (TSTyche), not `vp run check`.
import { expect, test } from "tstyche";
import { Data, Effect, Option, Stream, SubscriptionRef } from "effect";
import { h, type Node, type NoPropValue } from "@weftui/core";
import * as Props from "../props";

// ── Fixtures ──────────────────────────────────────────────────────────────────

class HoverError extends Data.TaggedError("HoverError")<{ readonly reason: string }> {}
class BgError extends Data.TaggedError("BgError")<{ readonly reason: string }> {}
class ActiveError extends Data.TaggedError("ActiveError")<{ readonly reason: string }> {}
class LogError extends Data.TaggedError("LogError")<{ readonly reason: string }> {}
class SubmitError extends Data.TaggedError("SubmitError")<{ readonly reason: string }> {}

interface HoverService {
  readonly _tag: "HoverService";
}
interface BgService {
  readonly _tag: "BgService";
}
interface ActiveService {
  readonly _tag: "ActiveService";
}
interface LogService {
  readonly _tag: "LogService";
}
interface SubmitService {
  readonly _tag: "SubmitService";
}

declare const hoverStream: Stream.Stream<string, HoverError, HoverService>;
declare const bgStream: Stream.Stream<string, BgError, BgService>;
declare const activeStream: Stream.Stream<boolean, ActiveError, ActiveService>;
declare const styleStream: Stream.Stream<{ readonly color: string }, BgError, BgService>;

declare const logClick: (ev: MouseEvent) => Effect.Effect<void, LogError, LogService>;
declare const submit: (ev: MouseEvent) => Effect.Effect<void, SubmitError, SubmitService>;
declare const voidClick: (ev: MouseEvent) => void;
declare const reactiveHandler: Stream.Stream<(ev: MouseEvent) => void, SubmitError, SubmitService>;
declare const mouseEvent: MouseEvent;

/** A bag with optional keys, for checking that modifiers survive the fold. */
interface Bag {
  readonly title?: string;
  readonly id?: string;
}

declare const inputRef: SubscriptionRef.SubscriptionRef<Option.Option<HTMLInputElement>>;
declare const refA: SubscriptionRef.SubscriptionRef<Option.Option<HTMLElement>>;
declare const refB: SubscriptionRef.SubscriptionRef<Option.Option<HTMLElement>>;
declare const refC: SubscriptionRef.SubscriptionRef<Option.Option<HTMLElement>>;

// ── Props.merge: identity & fold (AC1, AC19) ────────────────────────────────

test("merge(): zero bags is the empty bag, one bag is itself", () => {
  expect(Props.merge()).type.toBe<Readonly<Record<never, never>>>();
  expect(Props.merge({ class: "btn" })).type.toBe<{ readonly class: "btn" }>();
});

test("merge: single-side keys pass through untouched (AC5)", () => {
  expect(Props.merge({ id: "a", title: "t" }, { id: "b" })).type.toBe<{
    readonly id: "b";
    readonly title: "t";
  }>();
});

// ── Props.merge: class cell (AC8, AC9, AC19) ────────────────────────────────

test("merge: static + static class stays a plain string", () => {
  expect(Props.merge({ class: "btn" }, { class: "btn-lg" })).type.toBe<{
    readonly class: string;
  }>();
});

test("merge: reactive class derives Stream with E/R union + NoPropValue", () => {
  expect(Props.merge({ class: "btn" }, { class: hoverStream })).type.toBe<{
    readonly class: Stream.Stream<string, HoverError | NoPropValue, HoverService>;
  }>();
  expect(Props.merge({ class: hoverStream }, { class: "btn" })).type.toBe<{
    readonly class: Stream.Stream<string, HoverError | NoPropValue, HoverService>;
  }>();
  expect(Props.merge({ class: hoverStream }, { class: bgStream })).type.toBe<{
    readonly class: Stream.Stream<
      string,
      HoverError | BgError | NoPropValue,
      HoverService | BgService
    >;
  }>();
});

test("merge: three-bag fold groups per key regardless of arity (AC4/AC19)", () => {
  expect(Props.merge({ class: "a" }, { class: "b" }, { class: hoverStream })).type.toBe<{
    readonly class: Stream.Stream<string, HoverError | NoPropValue, HoverService>;
  }>();
  expect(Props.merge({ class: "a" }, { class: "b" }, { class: "c" })).type.toBe<{
    readonly class: string;
  }>();
});

// ── Props.merge: handler cell (AC6, AC19) ───────────────────────────────────

test("merge: chained handlers union E/R of both sides", () => {
  const chained = Props.merge({ onclick: logClick }, { onclick: submit });
  expect<ReturnType<(typeof chained)["onclick"]>>().type.toBe<
    Effect.Effect<void, LogError | SubmitError, LogService | SubmitService>
  >();
  expect(chained.onclick).type.toBeCallableWith(mouseEvent);
});

test("merge: void handlers lift to never channels in the chain", () => {
  const lifted = Props.merge({ onclick: voidClick }, { onclick: submit });
  expect<ReturnType<(typeof lifted)["onclick"]>>().type.toBe<
    Effect.Effect<void, SubmitError, SubmitService>
  >();
});

test("merge: nullish right handler passes the left through unchanged", () => {
  expect(Props.merge({ onclick: logClick }, { onclick: null })).type.toBe<{
    readonly onclick: (ev: MouseEvent) => Effect.Effect<void, LogError, LogService>;
  }>();
});

// ── Props.merge: style cell (AC10, AC11, AC19) ──────────────────────────────

test("merge: object + object style merges per key, right wins, Sources untouched", () => {
  expect(
    Props.merge(
      { style: { color: "red", padding: "4px" } },
      { style: { color: "blue", background: bgStream } },
    ),
  ).type.toBe<{
    readonly style: {
      readonly color: "blue";
      readonly padding: "4px";
      readonly background: Stream.Stream<string, BgError, BgService>;
    };
  }>();
});

test("merge: whole-object-stream style is last-wins on either side (AC11)", () => {
  expect(Props.merge({ style: { color: "red" } }, { style: styleStream })).type.toBe<{
    readonly style: Stream.Stream<{ readonly color: string }, BgError, BgService>;
  }>();
  expect(Props.merge({ style: styleStream }, { style: { color: "red" } })).type.toBe<{
    readonly style: { readonly color: "red" };
  }>();
});

// ── Props.merge: ref cell (AC12, AC19) ──────────────────────────────────────

test("merge: heterogeneous element refs fan out onto a specific builder", () => {
  // SubscriptionRef is invariant, so the ref-array prop arm accepts refs of any
  // element type. Composing a generic behavior ref with a caller's specific ref
  // is the headline fan-out case and must compile.
  expect(h.input(Props.merge({ ref: refA }, { ref: inputRef }))).type.toBe<Node<never, never>>();
});

test("merge: optional keys stay optional through the fold", () => {
  // A non-homomorphic mapped type would mark every key required, claiming keys
  // are present that the runtime never copied.
  expect<
    {} extends Pick<Props.Merged<[Bag, { readonly id: "x" }]>, "title"> ? true : false
  >().type.toBe<true>();
});

// Optional props are the normal shape for a behavior primitive's bag, and an
// optional key indexes to `T | undefined`. Every cell rule must still dispatch
// on the present value, or it silently degrades to last-wins.

interface OptionalHandlerBag {
  readonly onclick?: (ev: MouseEvent) => Effect.Effect<void, LogError, LogService>;
}
interface OptionalHandlerBag2 {
  readonly onclick?: (ev: MouseEvent) => Effect.Effect<void, SubmitError, SubmitService>;
}
interface OptionalRefBag {
  readonly ref?: SubscriptionRef.SubscriptionRef<Option.Option<HTMLElement>>;
}
interface OptionalStyleBag {
  readonly style?: { readonly color: string };
}
interface OptionalStyleBag2 {
  readonly style?: { readonly background: string };
}

test("merge: optional handlers still chain, keeping both E/R channels", () => {
  type Cell = Props.Merged<[OptionalHandlerBag, OptionalHandlerBag2]>["onclick"];
  // The chained arm must survive; if the rule degraded to last-wins the union
  // would lose the left handler and PropsE/PropsR would collapse to never.
  expect<
    Extract<Cell, (ev: never) => Effect.Effect<void, LogError | SubmitError, any>> extends never
      ? false
      : true
  >().type.toBe<true>();
});

test("h.* keeps E/R when the merged handler key is optional (AC20)", () => {
  // The required-key case is covered below. This is the shape a behavior
  // primitive actually has, and an optional key indexes to `T | undefined`,
  // which core's PropsE/PropsR conditionals must still see through.
  const merged = Props.merge<[OptionalHandlerBag, OptionalHandlerBag2]>(
    {} as OptionalHandlerBag,
    {} as OptionalHandlerBag2,
  );
  expect(h.button(merged)).type.toBe<Node<LogError | SubmitError, LogService | SubmitService>>();
});

test("merge: a reactive handler side keeps its E/R channels", () => {
  // A Stream-of-handler is last-wins at runtime, but its channels must still
  // reach PropsE/PropsR or the app compiles without providing the service.
  const merged = Props.merge({ onclick: logClick }, { onclick: reactiveHandler });
  expect<ReturnType<(typeof merged)["onclick"]>>().type.toBe<
    Effect.Effect<void, LogError | SubmitError, LogService | SubmitService>
  >();
});

test("merge: an optional ref does not leak undefined into the fan-out array", () => {
  type Cell = Props.Merged<[OptionalRefBag, OptionalRefBag]>["ref"];
  // The property stays optional, so the cell includes `undefined`. What must
  // not happen is `undefined` leaking into the array's element type, which
  // would make the fan-out unassignable to the core `ref` array arm.
  type ArrayArm = Extract<Cell, ReadonlyArray<unknown>>;
  expect<Extract<ArrayArm[number], undefined>>().type.toBe<never>();
  expect<ArrayArm>().type.toBeAssignableTo<
    ReadonlyArray<SubscriptionRef.SubscriptionRef<Option.Option<HTMLElement>>>
  >();
});

test("merge: optional style objects still merge per key", () => {
  type Cell = Props.Merged<[OptionalStyleBag, OptionalStyleBag2]>["style"];
  type Merged = Extract<Cell, { readonly color: string; readonly background: string }>;
  expect<[Merged] extends [never] ? false : true>().type.toBe<true>();
});

test("cx-shaped static class sides stay a plain string", () => {
  // A record of static conditions carries no reactive input, so the cell is a
  // string and the descriptor stays statically analyzable.
  expect(Props.merge({ class: { active: true } }, { class: "btn" })).type.toBe<{
    readonly class: string;
  }>();
  expect(Props.merge({ class: false }, { class: undefined })).type.toBe<{
    readonly class: string;
  }>();
});

test("merge: refs fan out into a readonly array, flattening array sides", () => {
  // The array is typed against the same permissive element as the core `ref`
  // array arm, so it stays assignable to any element builder (AC14a).
  expect(Props.merge({ ref: refA }, { ref: refB }).ref).type.toBeAssignableTo<
    ReadonlyArray<SubscriptionRef.SubscriptionRef<Option.Option<HTMLElement>>>
  >();
  expect(Props.merge({ ref: [refA, refB] }, { ref: refC }).ref).type.toBeAssignableTo<
    ReadonlyArray<SubscriptionRef.SubscriptionRef<Option.Option<HTMLElement>>>
  >();
  expect(h.div(Props.merge({ ref: refA }, { ref: refB }))).type.toBe<Node<never, never>>();
});

// ── Props.merge: rejections ─────────────────────────────────────────────────

test("merge rejects non-bag arguments", () => {
  expect(Props.merge).type.not.toBeCallableWith("btn");
  expect(Props.merge).type.not.toBeCallableWith(42);
});

// ── h.* integration (AC14, AC20) ─────────────────────────────────────────────

test("h.* accepts merged output; PropsE/PropsR propagate the unions (AC20)", () => {
  const merged = Props.merge(
    { class: "btn", onclick: logClick },
    { class: hoverStream, onclick: submit },
  );
  expect(h.button(merged)).type.toBe<
    Node<
      HoverError | NoPropValue | LogError | SubmitError,
      HoverService | LogService | SubmitService
    >
  >();
});

test("h.* accepts a ref array without merge (AC14)", () => {
  expect(h.div({ ref: [refA, refB] })).type.toBe<Node<never, never>>();
  expect(h.div({ ref: refA })).type.toBe<Node<never, never>>();
});

// ── Props.cx (AC15–AC17, AC21) ───────────────────────────────────────────────

test("cx: fully static inputs produce a plain string (AC16/AC21)", () => {
  expect(Props.cx()).type.toBe<string>();
  expect(Props.cx("btn", "btn-lg")).type.toBe<string>();
  expect(
    Props.cx("btn", false, null, undefined, ["a", ["b"]], { active: true }),
  ).type.toBe<string>();
});

test("cx: reactive value position derives Stream with E/R + NoPropValue (AC17/AC21)", () => {
  expect(Props.cx(hoverStream)).type.toBe<
    Stream.Stream<string, HoverError | NoPropValue, HoverService>
  >();
  expect(Props.cx("btn", hoverStream)).type.toBe<
    Stream.Stream<string, HoverError | NoPropValue, HoverService>
  >();
});

test("cx: reactive record condition derives Stream with E/R + NoPropValue (AC17/AC21)", () => {
  expect(Props.cx("btn", { active: activeStream })).type.toBe<
    Stream.Stream<string, ActiveError | NoPropValue, ActiveService>
  >();
  expect(Props.cx({ static: true, active: activeStream })).type.toBe<
    Stream.Stream<string, ActiveError | NoPropValue, ActiveService>
  >();
});

test("cx: reactive input nested in arrays still derives a Stream (AC15/AC17)", () => {
  expect(Props.cx(["nested", [hoverStream]])).type.toBe<
    Stream.Stream<string, HoverError | NoPropValue, HoverService>
  >();
});

test("cx: mixed reactive inputs union all channels (AC17)", () => {
  expect(Props.cx(hoverStream, { active: activeStream })).type.toBe<
    Stream.Stream<string, HoverError | ActiveError | NoPropValue, HoverService | ActiveService>
  >();
});

test("cx rejects inputs outside the grammar", () => {
  expect(Props.cx).type.not.toBeCallableWith(42);
  expect(Props.cx).type.not.toBeCallableWith({ active: "yes" });
});
