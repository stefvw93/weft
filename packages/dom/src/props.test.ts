// Unit tests for Props.merge / Props.cx (props.specs.md AC1–AC18). Written
// against the mocked surface. The red phase requires every test here to fail
// before /implement lands the runtime.
import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Cause, Data, Effect, Exit, Option, Stream, SubscriptionRef, pipe } from "effect";
import { NoPropValue, Subscribable, h } from "@weftui/core";
import { JSDOM } from "jsdom";
import * as Props from "./props";
import * as WeftApp from "./client/weft-app";

// ============================================================================
// Test setup (jsdom scaffolding mirrors client/weft-app.test.ts)
// ============================================================================

function createTestDOM(): JSDOM {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Comment = dom.window.Comment;
  global.Text = dom.window.Text;
  return dom;
}

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

class LeftError extends Data.TaggedError("LeftError")<{ readonly msg: string }> {}
class RightError extends Data.TaggedError("RightError")<{ readonly msg: string }> {}

/** Minimal Event stub for handler tests (preventDefault flips the flag). */
function makeEventStub(): Event {
  const stub = {
    defaultPrevented: false,
    preventDefault(): void {
      stub.defaultPrevented = true;
    },
  };
  return stub as unknown as Event;
}

/** Collects the first `n` emissions of a (possibly scoped) stream. */
function collect<A, E>(stream: Stream.Stream<A, E, never>, n: number): Effect.Effect<A[], E> {
  return pipe(
    Stream.take(stream, n),
    Stream.runCollect,
    Effect.scoped,
    Effect.map((chunk) => Array.from(chunk)),
  );
}

/** Runs a merged/chained handler result (an Effect) to its Exit. */
function runHandler(result: unknown): Promise<Exit.Exit<unknown, unknown>> {
  assert.ok(Effect.isEffect(result), "chained handler must return an Effect");
  return Effect.runPromiseExit(result as Effect.Effect<unknown, unknown>);
}

// ============================================================================
// AC1–AC5: merge shape, purity, monoid laws
// ============================================================================

describe("Props.merge: general (AC1–AC5)", () => {
  it("AC1: merge() returns an empty bag; merge(a) is observationally a", () => {
    assert.deepEqual(Props.merge(), {});
    const onclick = () => undefined;
    const single = Props.merge({ class: "btn", onclick });
    assert.equal(single.class, "btn");
    assert.equal(single.onclick, onclick);
  });

  it("AC2: merge is pure: no input mutation, no subscription at call time", () => {
    let pulls = 0;
    const reactive = Stream.fromEffect(
      Effect.sync(() => {
        pulls += 1;
        return "on";
      }),
    );
    const left = Object.freeze({ class: "btn", id: "x" });
    const right = Object.freeze({ class: reactive, id: "y" });
    const merged = Props.merge(left, right);
    assert.equal(pulls, 0, "reactive side must not be subscribed by merge itself");
    assert.deepEqual(left, { class: "btn", id: "x" });
    assert.equal(right.class, reactive);
    assert.equal(merged.id, "y");
  });

  it("AC3: {} is the merge identity on both sides (per-key reference equality)", () => {
    const onclick = () => undefined;
    const style = { color: "red" };
    const stream = Stream.make("on");
    const bag = { class: stream, onclick, style, id: "a" };
    for (const merged of [Props.merge(bag, {}), Props.merge({}, bag)]) {
      assert.equal(merged.class, stream);
      assert.equal(merged.onclick, onclick);
      assert.equal(merged.style, style);
      assert.equal(merged.id, "a");
    }
  });

  it("AC4: associativity: static keys, style, refs and handler order agree", async () => {
    const calls: string[] = [];
    const refs = await Effect.runPromise(
      Effect.all([
        SubscriptionRef.make(Option.none<HTMLElement>()),
        SubscriptionRef.make(Option.none<HTMLElement>()),
        SubscriptionRef.make(Option.none<HTMLElement>()),
      ]),
    );
    const [refA, refB, refC] = refs;
    const a = {
      class: "a",
      id: "a",
      style: { color: "red", padding: "1px" },
      ref: refA,
      onclick: () => {
        calls.push("a");
      },
    };
    const b = {
      class: "b",
      id: "b",
      style: { color: "blue" },
      ref: refB,
      onclick: () => {
        calls.push("b");
      },
    };
    const c = {
      class: "c",
      id: "c",
      style: { background: "green" },
      ref: refC,
      onclick: () => {
        calls.push("c");
      },
    };

    const leftGrouped = Props.merge(Props.merge(a, b), c);
    const rightGrouped = Props.merge(a, Props.merge(b, c));

    assert.equal(leftGrouped.class, rightGrouped.class);
    assert.equal(leftGrouped.class, "a b c");
    assert.equal(leftGrouped.id, "c");
    assert.equal(rightGrouped.id, "c");
    assert.deepEqual(leftGrouped.style, rightGrouped.style);
    assert.deepEqual(leftGrouped.style, { color: "blue", padding: "1px", background: "green" });
    assert.deepEqual(leftGrouped.ref, [refA, refB, refC]);
    assert.deepEqual(rightGrouped.ref, [refA, refB, refC]);

    await runHandler(leftGrouped.onclick(makeEventStub()));
    assert.deepEqual(calls, ["a", "b", "c"]);
    calls.length = 0;
    await runHandler(rightGrouped.onclick(makeEventStub()));
    assert.deepEqual(calls, ["a", "b", "c"]);
  });

  it("AC4: associativity: reactive class emissions agree across groupings", async () => {
    const mk = () => ({ class: Stream.make("x") });
    const leftGrouped = Props.merge(Props.merge({ class: "s" }, mk()), { class: "y" });
    const rightGrouped = Props.merge({ class: "s" }, Props.merge(mk(), { class: "y" }));
    const [leftFirst] = await Effect.runPromise(
      collect(leftGrouped.class as Stream.Stream<string, NoPropValue>, 1),
    );
    const [rightFirst] = await Effect.runPromise(
      collect(rightGrouped.class as Stream.Stream<string, NoPropValue>, 1),
    );
    assert.equal(leftFirst, "s x y");
    assert.equal(rightFirst, "s x y");
  });

  it("AC4a: style associativity breaks when a non-object form takes part", () => {
    const objA = { color: "red" };
    const objB = { margin: "0" };
    // Last-wins discards a side instead of combining it, so grouping becomes
    // observable. This is the documented v1 exception to AC4, pinned here so a
    // future upgrade of the style cell has to update it deliberately.
    const rightGrouped = Props.merge(
      { style: objA },
      Props.merge({ style: "display:none" }, { style: objB }),
    );
    const leftGrouped = Props.merge(Props.merge({ style: objA }, { style: "display:none" }), {
      style: objB,
    });
    assert.deepEqual(rightGrouped.style, { color: "red", margin: "0" });
    assert.deepEqual(leftGrouped.style, { margin: "0" });
    assert.notDeepEqual(leftGrouped.style, rightGrouped.style);
  });

  it("AC5: keys present on one side pass through by reference", () => {
    const stream = Stream.make("on");
    const onclick = () => undefined;
    const style = { color: "red" };
    const merged = Props.merge({ class: stream, onclick }, { style, id: "b" });
    assert.equal(merged.class, stream);
    assert.equal(merged.onclick, onclick);
    assert.equal(merged.style, style);
    assert.equal(merged.id, "b");
  });
});

// ============================================================================
// AC6–AC7: handler chaining
// ============================================================================

describe("Props.merge: handlers (AC6–AC7)", () => {
  it("AC6: both handlers run sequentially left→right", async () => {
    const calls: string[] = [];
    const merged = Props.merge(
      {
        onclick: () => {
          calls.push("left");
        },
      },
      {
        onclick: () => {
          calls.push("right");
        },
      },
    );
    const exit = await runHandler(merged.onclick(makeEventStub()));
    assert.ok(Exit.isSuccess(exit));
    assert.deepEqual(calls, ["left", "right"]);
  });

  it("AC6: Effect-returning handlers run and their success is awaited in order", async () => {
    const calls: string[] = [];
    const merged = Props.merge(
      { onclick: () => Effect.sync(() => void calls.push("left")) },
      { onclick: () => Effect.sync(() => void calls.push("right")) },
    );
    const exit = await runHandler(merged.onclick(makeEventStub()));
    assert.ok(Exit.isSuccess(exit));
    assert.deepEqual(calls, ["left", "right"]);
  });

  it("AC6: a throwing left handler does not prevent the right; merged Effect fails", async () => {
    const calls: string[] = [];
    const merged = Props.merge(
      {
        onclick: () => {
          throw new Error("left boom");
        },
      },
      {
        onclick: () => {
          calls.push("right");
        },
      },
    );
    const exit = await runHandler(merged.onclick(makeEventStub()));
    assert.deepEqual(calls, ["right"], "right handler must still run");
    assert.ok(Exit.isFailure(exit), "merged handler must surface the failure");
  });

  it("AC6: a failing left Effect does not prevent the right; error surfaces", async () => {
    const calls: string[] = [];
    const merged = Props.merge(
      { onclick: () => Effect.fail(new LeftError({ msg: "nope" })) },
      { onclick: () => Effect.sync(() => void calls.push("right")) },
    );
    const exit = await runHandler(merged.onclick(makeEventStub()));
    assert.deepEqual(calls, ["right"]);
    assert.ok(Exit.isFailure(exit));
    assert.match(Cause.pretty(exit.cause), /LeftError/);
  });

  it("AC6: both sides failing aggregates both causes", async () => {
    const merged = Props.merge(
      { onclick: () => Effect.fail(new LeftError({ msg: "l" })) },
      { onclick: () => Effect.fail(new RightError({ msg: "r" })) },
    );
    const exit = await runHandler(merged.onclick(makeEventStub()));
    assert.ok(Exit.isFailure(exit));
    const rendered = Cause.pretty(exit.cause);
    assert.match(rendered, /LeftError/);
    assert.match(rendered, /RightError/);
  });

  it("AC7: both handlers receive the same event object (preventDefault visible)", async () => {
    let observed: boolean | undefined;
    const merged = Props.merge(
      {
        onclick: (ev: Event) => {
          ev.preventDefault();
        },
      },
      {
        onclick: (ev: Event) => {
          observed = ev.defaultPrevented;
        },
      },
    );
    await runHandler(merged.onclick(makeEventStub()));
    assert.equal(observed, true);
  });

  it("edge: nullish handler side passes the other through unchanged", () => {
    const onclick = () => undefined;
    assert.equal(Props.merge({ onclick }, { onclick: null }).onclick, onclick);
    assert.equal(Props.merge({ onclick: null }, { onclick }).onclick, onclick);
  });

  it("edge: an explicit `false` on the right disables the handler", () => {
    const onclick = () => undefined;
    // The renderer reads `false` as "no handler", so it must be the way a
    // caller switches a behavior primitive's handler off.
    assert.equal(Props.merge({ onclick }, { onclick: false }).onclick, false);
  });
});

// ============================================================================
// AC8–AC9: class cell
// ============================================================================

describe("Props.merge: class (AC8–AC9)", () => {
  it("AC8: static + static concatenates with a single space, no dedupe", () => {
    assert.equal(Props.merge({ class: "btn" }, { class: "btn-lg" }).class, "btn btn-lg");
    assert.equal(Props.merge({ class: "btn" }, { class: "btn" }).class, "btn btn");
  });

  it("edge: empty static side introduces no extra space", () => {
    assert.equal(Props.merge({ class: "" }, { class: "b" }).class, "b");
    assert.equal(Props.merge({ class: "a" }, { class: "" }).class, "a");
  });

  it("AC9: static + reactive derives a combined Stream<string>", async () => {
    const merged = Props.merge({ class: "btn" }, { class: Stream.make("on", "off") });
    const emissions = await Effect.runPromise(
      collect(merged.class as Stream.Stream<string, NoPropValue>, 2),
    );
    assert.deepEqual(emissions, ["btn on", "btn off"]);
  });

  it("AC9: reactive + reactive combines latest from both sides", async () => {
    const merged = Props.merge({ class: Stream.make("a") }, { class: Stream.make("x", "y") });
    const emissions = await Effect.runPromise(
      collect(merged.class as Stream.Stream<string, NoPropValue>, 2),
    );
    assert.deepEqual(emissions, ["a x", "a y"]);
  });

  it("AC9: an empty reactive side fails the derived stream with NoPropValue", async () => {
    const merged = Props.merge({ class: "btn" }, { class: Stream.empty });
    const exit = await Effect.runPromiseExit(
      collect(merged.class as Stream.Stream<string, NoPropValue>, 1),
    );
    assert.ok(Exit.isFailure(exit));
    assert.match(Cause.pretty(exit.cause), /NoPropValue/);
  });
});

// ============================================================================
// AC10–AC11: style cell
// ============================================================================

describe("Props.merge: style (AC10–AC11)", () => {
  it("AC10: object + object merges per key, right wins, Sources pass by reference", () => {
    const bgStream = Stream.make("green");
    const merged = Props.merge(
      { style: { color: "red", padding: "4px" } },
      { style: { color: "blue", background: bgStream } },
    );
    const style = merged.style as Record<string, unknown>;
    assert.equal(style.color, "blue");
    assert.equal(style.padding, "4px");
    assert.equal(style.background, bgStream);
  });

  it("AC11: whole-object stream on the right wins as-is", () => {
    const styleStream = Stream.make({ color: "red" });
    const merged = Props.merge({ style: { padding: "1px" } }, { style: styleStream });
    assert.equal(merged.style, styleStream);
  });

  it("AC11: object right wins over whole-object stream left", () => {
    const styleStream = Stream.make({ color: "red" });
    const right = { padding: "1px" };
    const merged = Props.merge({ style: styleStream }, { style: right });
    assert.equal(merged.style, right);
  });

  it("AC11: string style form is last-wins", () => {
    const merged = Props.merge({ style: { color: "red" } }, { style: "color: blue" });
    assert.equal(merged.style, "color: blue");
  });
});

// ============================================================================
// AC12: ref cell
// ============================================================================

describe("Props.merge: ref (AC12)", () => {
  it("AC12: two refs concatenate into a readonly array preserving order", async () => {
    const [refA, refB] = await Effect.runPromise(
      Effect.all([
        SubscriptionRef.make(Option.none<HTMLElement>()),
        SubscriptionRef.make(Option.none<HTMLElement>()),
      ]),
    );
    const merged = Props.merge({ ref: refA }, { ref: refB });
    assert.deepEqual(merged.ref, [refA, refB]);
    assert.equal((merged.ref as ReadonlyArray<unknown>)[0], refA);
  });

  it("AC12: array sides flatten (associative concat)", async () => {
    const [refA, refB, refC] = await Effect.runPromise(
      Effect.all([
        SubscriptionRef.make(Option.none<HTMLElement>()),
        SubscriptionRef.make(Option.none<HTMLElement>()),
        SubscriptionRef.make(Option.none<HTMLElement>()),
      ]),
    );
    const merged = Props.merge({ ref: [refA, refB] }, { ref: refC });
    assert.deepEqual(merged.ref, [refA, refB, refC]);
  });
});

// ============================================================================
// AC13: everything else
// ============================================================================

describe("Props.merge: other keys (AC13)", () => {
  it("AC13: unknown keys are last-wins, right value passed by reference", () => {
    const rightStream = Stream.make(1);
    const merged = Props.merge(
      { id: "a", "data-x": "1", value: Stream.make(0) },
      { id: "b", value: rightStream },
    );
    assert.equal(merged.id, "b");
    assert.equal(merged["data-x"], "1");
    assert.equal(merged.value, rightStream);
  });
});

// ============================================================================
// Review regressions: defects found by the /review-step pass
// ============================================================================

describe("Props.merge: review regressions", () => {
  it("drops a nullish ref side instead of poisoning the fan-out array", async () => {
    const ref = await Effect.runPromise(SubscriptionRef.make(Option.none<HTMLElement>()));
    assert.deepEqual(Props.merge({ ref: undefined }, { ref }).ref, [ref]);
    assert.deepEqual(Props.merge({ ref }, { ref: undefined }).ref, [ref]);
    assert.deepEqual(Props.merge({ ref: undefined }, { ref: undefined }).ref, []);
  });

  it("joins to the empty string when both sides contribute nothing", () => {
    // Matches `cx` and clsx: an empty join is "", not `undefined`. Mapping it
    // to `undefined` cannot be applied consistently, because AC5 passes a
    // one-sided `class` through untouched.
    assert.equal(Props.merge({ class: undefined }, { class: undefined }).class, "");
    assert.equal(Props.merge({ class: "" }, { class: false }).class, "");
    assert.equal(Props.merge({ class: undefined }, { class: "btn" }).class, "btn");
  });

  it("keeps a camelCase handler key last-wins, matching the renderer", () => {
    const left = () => undefined;
    const right = () => undefined;
    // `onClick` is not a DOM handler prop in Weft; the renderer would treat it
    // as an attribute, so merge must not silently chain it.
    assert.equal(Props.merge({ onClick: left }, { onClick: right }).onClick, right);
  });

  it("does not enumerate a non-plain object as a cx condition record", async () => {
    const ref = await Effect.runPromise(SubscriptionRef.make(Option.none<HTMLElement>()));
    // A SubscriptionRef is an object but not a condition map; its internal
    // fields must never leak into the class string.
    assert.equal(Props.cx("btn", ref as never), "btn");
    assert.equal(Props.cx("btn", new Date() as never), "btn");
  });

  it("reports both failures even when the two errors are value-equal", async () => {
    const merged = Props.merge(
      { onclick: () => Effect.fail(new LeftError({ msg: "same" })) },
      { onclick: () => Effect.fail(new LeftError({ msg: "same" })) },
    );
    const exit = await runHandler(merged.onclick(makeEventStub()));
    assert.ok(Exit.isFailure(exit));
    assert.equal(exit.cause.reasons.length, 2, "both failures must be reported");
  });

  it("does not spread a non-plain object into the merged style", async () => {
    const ref = await Effect.runPromise(SubscriptionRef.make(0));
    // A SubscriptionRef is a plain-prototype-free box, not a style record. Its
    // internals must not become CSS declarations.
    const merged = Props.merge({ style: ref as never }, { style: { color: "blue" } });
    assert.deepEqual(merged.style, { color: "blue" });
  });

  it("normalizes a cx-shaped class even when the other side is nullish", () => {
    // The generic nullish short-circuit must not bypass the class cell, or a
    // condition record reaches the renderer raw and stringifies to
    // "[object Object]".
    assert.equal(
      Props.merge({ class: { active: true, lg: false } }, { class: undefined }).class,
      "active",
    );
    assert.equal(Props.merge({ class: undefined }, { class: { active: true } }).class, "active");
    assert.equal(Props.merge({ class: ["a", "b"] }, { class: undefined }).class, "a b");
  });

  it("runs both handler bodies synchronously so preventDefault lands in dispatch", () => {
    // The left handler returns a suspending Effect. A DOM listener pair would
    // both run during dispatch, so the right handler's preventDefault must not
    // wait on the left Effect.
    const merged = Props.merge(
      { onclick: () => Effect.sleep("10 millis") },
      {
        onclick: (ev: Event) => {
          ev.preventDefault();
        },
      },
    );
    const event = makeEventStub();
    const result = merged.onclick(event);
    assert.equal(event.defaultPrevented, true, "preventDefault must be synchronous");
    // The returned Effect is still there to be run by the renderer.
    assert.ok(Effect.isEffect(result));
  });

  it("is plain last-wins for a generic key, matching object spread", () => {
    // No nullish special case: an explicit `undefined` on the right wins, the
    // same as `{ ...left, ...right }`. Keeping the type and the runtime in
    // agreement here matters more than rescuing a forwarded optional prop.
    assert.equal(Props.merge({ id: "a" }, { id: "b" }).id, "b");
    assert.equal(Props.merge({ id: "default" }, { id: undefined }).id, undefined);
  });

  it("keeps a reactive left handler when the right side is nullish", () => {
    const reactive = Stream.make(() => undefined);
    // The guard must not require the left side to be a plain function, or a
    // forwarded optional `onclick` silently drops a reactive handler.
    assert.equal(Props.merge({ onclick: reactive }, { onclick: undefined }).onclick, reactive);
    // `false` is an explicit opt-out, so it wins and disables the handler.
    assert.equal(Props.merge({ onclick: reactive }, { onclick: false }).onclick, false);
  });

  it("keeps every intermediate emission when two reactive parts combine", async () => {
    // Pins combine-latest behaviour against Effect's chunking: both sources
    // emit multi-element chunks, and no intermediate combination may be lost.
    const result = Props.cx({ a: Stream.make(true, false) }, { b: Stream.make(true, false) });
    const emissions = await Effect.runPromise(
      collect(result as Stream.Stream<string, NoPropValue>, 3),
    );
    assert.deepEqual(emissions, ["a b", "b", ""]);
  });

  it("fails with NoPropValue when a Subscribable class source never emits", async () => {
    // A genuinely empty source: `Source.toSubscribable` fails `get` with
    // NoPropValue and leaves `changes` open forever, so the merged stream must
    // surface the failure from `get` rather than stalling.
    const empty = Subscribable.make({
      get: Effect.fail(new NoPropValue({ key: "class" })) as Effect.Effect<string, NoPropValue>,
      changes: Stream.never as Stream.Stream<string>,
    });
    const merged = Props.merge({ class: "btn" }, { class: empty });
    const exit = await Effect.runPromiseExit(
      collect(merged.class as Stream.Stream<string, NoPropValue>, 1),
    );
    assert.ok(Exit.isFailure(exit));
    assert.match(Cause.pretty(exit.cause), /NoPropValue/);
  });
});

// ============================================================================
// AC14: renderer ref fan-out (jsdom)
// ============================================================================

describe("setElementProps: ref fan-out (AC14)", () => {
  it("AC14: mounts set every ref in an array (single ref unchanged)", async () => {
    createTestDOM();
    const root = createRoot();
    const [refA, refB, single] = await Effect.runPromise(
      Effect.all([
        SubscriptionRef.make(Option.none<HTMLElement>()),
        SubscriptionRef.make(Option.none<HTMLElement>()),
        SubscriptionRef.make(Option.none<HTMLElement>()),
      ]),
    );
    const app = WeftApp.make();
    await Effect.runPromise(
      WeftApp.mount(
        app,
        h.div({}, [h.span({ ref: [refA, refB], id: "fan" }), h.span({ ref: single, id: "one" })]),
        root,
      ),
    );
    const fan = root.querySelector("#fan");
    const one = root.querySelector("#one");
    const [a, b, s] = await Effect.runPromise(
      Effect.all([
        SubscriptionRef.get(refA),
        SubscriptionRef.get(refB),
        SubscriptionRef.get(single),
      ]),
    );
    assert.ok(Option.isSome(a), "refA set");
    assert.ok(Option.isSome(b), "refB set");
    assert.ok(Option.isSome(s), "single ref set");
    assert.equal(Option.getOrThrow(a), fan);
    assert.equal(Option.getOrThrow(b), fan);
    assert.equal(Option.getOrThrow(s), one);
    await Effect.runPromise(WeftApp.dispose(app));
  });
});

// ============================================================================
// AC15–AC17: Props.cx
// ============================================================================

describe("Props.cx (AC15–AC17)", () => {
  it("AC16: fully static inputs join with single spaces; cx() is ''", () => {
    assert.equal(Props.cx(), "");
    assert.equal(Props.cx("btn", "btn-lg"), "btn btn-lg");
  });

  it("AC15: falsy inputs and empty strings are skipped", () => {
    assert.equal(Props.cx("a", false, null, undefined, "", "b"), "a b");
  });

  it("AC15: nested arrays flatten recursively", () => {
    assert.equal(Props.cx(["a", ["b", false, ["c"]]], "d"), "a b c d");
  });

  it("AC15: record keys included when the static condition is truthy", () => {
    assert.equal(Props.cx({ active: true, disabled: false }), "active");
    assert.equal(Props.cx("base", { on: true }), "base on");
  });

  it("AC17: reactive string in value position derives a Stream", async () => {
    const result = Props.cx("btn", Stream.make("on", "off"));
    const emissions = await Effect.runPromise(
      collect(result as Stream.Stream<string, NoPropValue>, 2),
    );
    assert.deepEqual(emissions, ["btn on", "btn off"]);
  });

  it("AC17: reactive record condition toggles the class name", async () => {
    const result = Props.cx("btn", { active: Stream.make(true, false) });
    const emissions = await Effect.runPromise(
      collect(result as Stream.Stream<string, NoPropValue>, 2),
    );
    assert.deepEqual(emissions, ["btn active", "btn"]);
  });

  it("AC17: an empty reactive input fails the stream with NoPropValue", async () => {
    const result = Props.cx("btn", Stream.empty);
    const exit = await Effect.runPromiseExit(
      collect(result as Stream.Stream<string, NoPropValue>, 1),
    );
    assert.ok(Exit.isFailure(exit));
    assert.match(Cause.pretty(exit.cause), /NoPropValue/);
  });

  it("AC17: a failing reactive input propagates its error through the stream", async () => {
    const failing = Stream.fail(new LeftError({ msg: "boom" }));
    const result = Props.cx("btn", failing);
    const exit = await Effect.runPromiseExit(
      collect(result as Stream.Stream<string, LeftError | NoPropValue>, 1),
    );
    assert.ok(Exit.isFailure(exit));
    assert.match(Cause.pretty(exit.cause), /LeftError/);
  });
});

// ============================================================================
// AC18: one engine, two doors
// ============================================================================

describe("merge class ≡ cx (AC18)", () => {
  it("AC18: static merge class equals cx(left, right)", () => {
    assert.equal(Props.merge({ class: "a" }, { class: "b" }).class, Props.cx("a", "b"));
  });

  it("AC18: reactive merge class emissions equal cx(left, right) emissions", async () => {
    const viaMerge = Props.merge({ class: "s" }, { class: Stream.make("x", "y") }).class;
    const viaCx = Props.cx("s", Stream.make("x", "y"));
    const mergeEmissions = await Effect.runPromise(
      collect(viaMerge as Stream.Stream<string, NoPropValue>, 2),
    );
    const cxEmissions = await Effect.runPromise(
      collect(viaCx as Stream.Stream<string, NoPropValue>, 2),
    );
    assert.deepEqual(mergeEmissions, cxEmissions);
    assert.deepEqual(mergeEmissions, ["s x", "s y"]);
  });
});
