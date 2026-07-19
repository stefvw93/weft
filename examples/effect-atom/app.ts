/**
 * Recipe: effect-atom
 *
 * This recipe demonstrates driving Weft UI from Effect 4's built-in atom
 * state management module, `effect/unstable/reactivity`, the upstreamed
 * successor of effect-atom (https://github.com/tim-smart/effect-atom).
 * `AsyncResult` is the former effect-atom `Result`.
 *
 * The integration is adapter-free because both sides speak Effect:
 * - Read path: `Atom.toStream(atom)` yields a `Stream<A, never, AtomRegistry>`
 *   that emits the current value immediately and on every change. Weft
 *   consumes Streams natively as children and props.
 * - Write path: `Atom.update` / `Atom.refresh` return Effects requiring
 *   `AtomRegistry`; Weft event handlers that return Effects are run on the
 *   mount runtime, which carries the registry provided around `mount`.
 */

import { h } from "@weftui/core";
import { Effect, Stream } from "effect";
import { Atom, AsyncResult } from "effect/unstable/reactivity";

// ============================================================================
// Atoms (module scope: state lives in the Registry, not the component)
// ============================================================================

/** Writable counter atom. */
const countAtom = Atom.make(0);

/** Derived atom: recomputes whenever `countAtom` changes. */
const doubleAtom = Atom.map(countAtom, (n) => n * 2);

/** Async atom: an Effect run by the registry, exposed as a `Result`. */
const greetingAtom = Atom.make(
  Effect.gen(function* () {
    yield* Effect.sleep("300 millis");
    return "Hello from effect-atom";
  }),
);

// ============================================================================
// Example 1: Counter with derived state
// ============================================================================

const Counter = () =>
  h.div([
    h.p(["Count: ", h.strong({ "data-testid": "count" }, [Atom.toStream(countAtom)])]),
    h.p([
      "Doubled: ",
      h.span({ "data-testid": "double", class: "derived" }, [Atom.toStream(doubleAtom)]),
    ]),
    h.button(
      {
        type: "button",
        "data-testid": "decrement",
        onclick: () => Atom.update(countAtom, (n) => n - 1),
      },
      "-",
    ),
    h.button(
      {
        type: "button",
        "data-testid": "increment",
        onclick: () => Atom.update(countAtom, (n) => n + 1),
      },
      "+",
    ),
  ]);

// ============================================================================
// Example 2: Async atom rendering Result states
// ============================================================================

const Greeting = () => {
  const display = Stream.map(
    Atom.toStream(greetingAtom),
    AsyncResult.match({
      onInitial: () => "Loading…",
      onFailure: () => "Failed to load",
      onSuccess: (success) => (success.waiting ? "Reloading…" : success.value),
    }),
  );

  return h.div([
    h.p({ "data-testid": "greeting", class: "preview" }, [display]),
    h.button(
      { type: "button", "data-testid": "reload", onclick: () => Atom.refresh(greetingAtom) },
      "Reload",
    ),
  ]);
};

// ============================================================================
// App
// ============================================================================

/** Root component. Mount with an `AtomRegistry` provided (see `main.ts`). */
export const App = () =>
  h.div([
    h.h1("weft + effect-atom"),

    h.section([
      h.h2("1. Counter + Derived Atom"),
      h.p("A writable atom and an Atom.map derivation, read via Atom.toStream."),
      Counter(),
    ]),

    h.section([
      h.h2("2. Async Atom (Result)"),
      h.p("An Effect-backed atom rendered through its Result states."),
      Greeting(),
    ]),
  ]);
