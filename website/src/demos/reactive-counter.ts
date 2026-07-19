/**
 * `reactive-counter` demo.
 *
 * The headline reactivity pattern: a `SubscriptionRef` signal whose `.changes`
 * stream drives a text node directly: no virtual DOM, no diffing. Clicking a
 * button updates the ref; the rendered value updates in place. SSR-rendered and
 * hydrated as an ordinary subtree of the page (no separate mount).
 */

import { h } from "@weftui/core";
import type { Node } from "@weftui/core";
import { Effect, Stream, SubscriptionRef } from "effect";

/** An increment/decrement counter driven by a `SubscriptionRef` signal. */
export const ReactiveCounter = (): Node =>
  Effect.gen(function* () {
    const count = yield* SubscriptionRef.make(0);
    const increment = () => SubscriptionRef.update(count, (n) => n + 1);
    const decrement = () => SubscriptionRef.update(count, (n) => n - 1);

    const btn =
      "h-8 w-8 rounded-md border border-slate-6 bg-slate-3 text-lg leading-none hover:bg-slate-4";

    return yield* h.div(
      { class: "flex items-center gap-3 rounded-lg border border-slate-7 bg-slate-2 p-4" },
      [
        h.button(
          { type: "button", class: btn, "aria-label": "Decrement", onclick: () => decrement() },
          "−",
        ),
        // `counter-value` is a semantic test hook; layout comes from utilities.
        h.span(
          { class: "counter-value min-w-10 text-center text-[1.4rem] font-semibold tabular-nums" },
          [Stream.map(SubscriptionRef.changes(count), (n) => String(n))],
        ),
        h.button(
          { type: "button", class: btn, "aria-label": "Increment", onclick: () => increment() },
          "+",
        ),
      ],
    );
  });
