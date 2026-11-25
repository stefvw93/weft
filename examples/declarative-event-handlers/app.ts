/**
 * Recipe: Declarative DOM Event Handlers
 *
 * This recipe demonstrates how to use event handlers in Weft.
 * Handlers can be plain callbacks OR return Effects, with service access
 * through the existing Effect.provide() pattern.
 */

import { h } from "@weftui/core";
import { Context, Effect, Layer, Stream } from "effect";

// ============================================================================
// Example 1: Stream Composition Counter
// ============================================================================

/**
 * A counter built entirely from stream composition, demonstrating:
 * - Effect.andThen to wait for DOM readiness
 * - Stream.fromEventListener for click events
 * - Stream.merge to combine increment/decrement streams
 * - Stream.scan to accumulate state
 * - Stream.concat for initial value
 */
const StreamCounter = () =>
  Effect.sync(() => {
    const incId = `inc-${Math.random().toString(36).slice(2, 8)}`;
    const decId = `dec-${Math.random().toString(36).slice(2, 8)}`;

    const clickStream = Stream.fromEffect(
      Effect.andThen(
        Effect.promise(() => Promise.resolve(true)),
        () =>
          Effect.sync(() => ({
            incBtn: document.getElementById(incId)!,
            decBtn: document.getElementById(decId)!,
          })),
      ),
    ).pipe(
      Stream.flatMap(({ incBtn, decBtn }) =>
        Stream.merge(
          Stream.fromEventListener(incBtn, "click").pipe(Stream.map(() => 1)),
          Stream.fromEventListener(decBtn, "click").pipe(Stream.map(() => -1)),
        ),
      ),
      Stream.scan(
        () => 0,
        (acc, delta) => acc + delta,
      ),
    );

    const count = Stream.concat(Stream.make(0), clickStream);

    return h.div([
      h.span({ class: "counter" }, [count]),
      h.button({ type: "button", id: decId }, "-"),
      h.button({ type: "button", id: incId }, "+"),
    ]);
  });

// ============================================================================
// Example 2: Effect-Returning Handlers
// ============================================================================

const LoggingButton = () =>
  h.button(
    {
      type: "button",
      onclick: () =>
        Effect.gen(function* () {
          yield* Effect.log("Button clicked!");
          yield* Effect.sleep("100 millis");
          yield* Effect.log("Action completed");
        }),
    },
    "Click to Log",
  );

// ============================================================================
// Example 3: Handlers with Service Access
// ============================================================================

class Analytics extends Context.Service<
  Analytics,
  {
    track: (event: string) => Effect.Effect<void>;
  }
>()("Analytics") {}

export const AnalyticsLive = Layer.succeed(Analytics, {
  track: (event) =>
    Effect.sync(() => {
      console.log(`[Analytics] Tracked: ${event}`);
    }),
});

const TrackedButton = () =>
  h.button(
    {
      type: "button",
      onclick: () =>
        Effect.gen(function* () {
          const analytics = yield* Analytics;
          yield* analytics.track("button_clicked");
        }),
    },
    "Tracked Click",
  );

// ============================================================================
// Example 4: Reactive Handlers (Stream-based)
// ============================================================================

const ToggleHandler = () => {
  const handlers = Stream.make(
    () => console.log("Mode A: Hello!"),
    () => console.log("Mode B: Goodbye!"),
  );

  return h.button({ type: "button", onclick: handlers }, "Click (handler changes)");
};

// ============================================================================
// Example 5: Conditional Handlers
// ============================================================================

const ConditionalButton = ({ enabled }: { enabled: boolean }) =>
  h.button(
    {
      type: "button",
      onclick: enabled
        ? () => {
            console.log("Action performed!");
          }
        : null,
    },
    enabled ? "Click Me" : "Disabled",
  );

// ============================================================================
// App
// ============================================================================

export const App = () =>
  h.div([
    h.h1("Event Handler Examples"),

    h.section([
      h.h2("1. Stream Composition Counter"),
      h.p("Built from Stream.fromEventListener, merge, and scan."),
      StreamCounter(),
    ]),

    h.section([h.h2("2. Effect-Returning Handler"), LoggingButton()]),

    h.section([h.h2("3. Service Access in Handler"), TrackedButton()]),

    h.section([h.h2("4. Reactive Handler"), ToggleHandler()]),

    h.section([
      h.h2("5. Conditional Handler"),
      ConditionalButton({ enabled: true }),
      ConditionalButton({ enabled: false }),
    ]),
  ]);
