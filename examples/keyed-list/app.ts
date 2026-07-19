/**
 * Recipe: Keyed List (`List.each`)
 *
 * Demonstrates the keyed list combinator and its reconciliation guarantees:
 *
 * - `by: (item) => item.id` gives each row a stable identity, so reordering the
 *   list **moves** the existing DOM nodes (and their running subscriptions)
 *   instead of rebuilding them.
 * - Each row renders **once per key**. The per-row counter stream is started a
 *   single time and keeps counting across reorders/insertions/removals, because
 *   its per-item scope is never torn down while the key survives.
 * - The uncontrolled `<input>` keeps its typed value and focus across a reorder,
 *   because the element node is moved rather than recreated.
 *
 * Contrast this with `Stream<Array>` + `array.map(...)`, which destroys and
 * rebuilds every row on each emission (resetting counters, focus, and inputs).
 */

import { h, List } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect, Schedule, Stream, SubscriptionRef } from "effect";

interface Row {
  readonly id: number;
  readonly label: string;
}

const program = Effect.gen(function* () {
  // The list source: a SubscriptionRef the controls mutate. `List.each`
  // subscribes to its `.changes` and reconciles each emission by key.
  const rows = yield* SubscriptionRef.make<readonly Row[]>([
    { id: 1, label: "Ada" },
    { id: 2, label: "Babbage" },
    { id: 3, label: "Curie" },
    { id: 4, label: "Dijkstra" },
  ]);

  let nextId = 5;

  // Returns an Effect; the renderer runs Effects returned from event handlers.
  const update = (f: (current: readonly Row[]) => readonly Row[]) =>
    SubscriptionRef.update(rows, f);

  const shuffle = (current: readonly Row[]): readonly Row[] => {
    const copy = [...current];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  };

  // render runs ONCE per key. The counter stream is created here, so it starts
  // a single time and survives every later reorder/insert/remove of this key.
  const renderRow = (row: Row) => {
    const counter = Stream.iterate(0, (n) => n + 1).pipe(
      Stream.schedule(Schedule.spaced("1 second")),
    );

    return h.li({ id: `row-${row.id}` }, [
      h.span({ class: "key" }, `#${row.id}`),
      h.span(row.label),
      h.input({ placeholder: "type here…" }),
      h.span({ class: "count" }, ["ticks: ", counter]),
    ]);
  };

  return h.div([
    h.h1("Keyed List (List.each)"),
    h.p(
      { class: "hint" },
      "Type into a row, start its counter, then shuffle. Focus, the typed value, and the running counter all survive the move.",
    ),

    h.div({ class: "controls" }, [
      h.button({ onclick: () => update(shuffle) }, "Shuffle"),
      h.button({ onclick: () => update((c) => [...c].reverse()) }, "Reverse"),
      h.button(
        {
          onclick: () => update((c) => [...c, { id: nextId, label: `Row ${nextId++}` }]),
        },
        "Add",
      ),
      h.button({ onclick: () => update((c) => c.slice(1)) }, "Remove first"),
    ]),

    h.ul([List.each({ of: SubscriptionRef.changes(rows), by: (row: Row) => row.id }, renderRow)]),
  ]);
});

const app = WeftApp.make();
void Effect.runPromise(
  program.pipe(
    Effect.flatMap((node) => WeftApp.mount(app, node, document.getElementById("root")!)),
  ),
);
