/**
 * Recipe: Shared State Islands
 *
 * One `WeftApp` can mount several independent DOM roots ("islands") that all
 * share the same app layer. Because layers are memoized per runtime, a
 * `SubscriptionRef`-backed service built once in the layer is threaded by
 * reference into every island. An update made in one island is observed
 * reactively in all the others, with no event bus, no globals, and no
 * prop-drilling across roots.
 *
 * This module is side-effect-free: it exports the shared `Counter` service,
 * its `CounterLive` layer, and the two island components. `main.ts` creates
 * the app and mounts each island into its own DOM container.
 */

import { h } from "@weftui/core";
import { Context, Effect, Layer, Stream, SubscriptionRef } from "effect";

/** The shared counter state, provided app-wide by {@link CounterLive}. */
export class Counter extends Context.Service<
  Counter,
  { readonly count: SubscriptionRef.SubscriptionRef<number> }
>()("shared-state-islands/Counter") {}

/**
 * Builds the shared counter once per app. Every island that reads `Counter`
 * gets the same `SubscriptionRef` instance (layer memoization).
 */
export const CounterLive = Layer.effect(
  Counter,
  Effect.map(SubscriptionRef.make(0), (count) => ({ count })),
);

/**
 * The "controls" island: buttons that mutate the shared counter from real
 * event handlers. Handlers read the `Counter` service from the app layer.
 */
export const ControlsIsland = () =>
  h.section({ class: "island island-controls" }, [
    h.h2({}, "Controls island"),
    h.button(
      {
        type: "button",
        "data-testid": "decrement",
        onclick: () =>
          Effect.gen(function* () {
            const { count } = yield* Counter;
            yield* SubscriptionRef.update(count, (n) => n - 1);
          }),
      },
      "-",
    ),
    h.button(
      {
        type: "button",
        "data-testid": "increment",
        onclick: () =>
          Effect.gen(function* () {
            const { count } = yield* Counter;
            yield* SubscriptionRef.update(count, (n) => n + 1);
          }),
      },
      "+",
    ),
  ]);

/**
 * The "display" island: renders the shared count and a derived double. It
 * never mutates anything; updates arrive purely through the shared
 * `SubscriptionRef.changes` stream.
 */
export const DisplayIsland = () =>
  h.section({ class: "island island-display" }, [
    h.h2({}, "Display island"),
    h.div({ class: "counter", "data-testid": "count" }, [
      Stream.unwrap(
        Effect.gen(function* () {
          const { count } = yield* Counter;
          return Stream.map(SubscriptionRef.changes(count), String);
        }),
      ),
    ]),
    h.div({ class: "derived", "data-testid": "double" }, [
      "double: ",
      Stream.unwrap(
        Effect.gen(function* () {
          const { count } = yield* Counter;
          return Stream.map(SubscriptionRef.changes(count), (n) => String(n * 2));
        }),
      ),
    ]),
  ]);
