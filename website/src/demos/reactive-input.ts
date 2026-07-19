/**
 * `reactive-input` demo.
 *
 * A controlled input whose `SubscriptionRef` value drives a derived validation
 * stream: the message and its color are pure functions of the current value,
 * recomputed on every keystroke via `Stream.map` over `SubscriptionRef.changes(value)`. Shows that
 * derived UI state is just a stream transformation, with no separate state library.
 */

import { h } from "@weftui/core";
import type { Node } from "@weftui/core";
import { Effect, Stream, SubscriptionRef } from "effect";

/** Minimum length considered "valid" for the demo's feedback. */
const MIN_LENGTH = 3;

/** A controlled text input with live, derived validation feedback. */
export const ReactiveInput = (): Node =>
  Effect.gen(function* () {
    const value = yield* SubscriptionRef.make("");
    const onInput = (event: Event) =>
      SubscriptionRef.set(value, (event.target as HTMLInputElement).value);

    const message = Stream.map(SubscriptionRef.changes(value), (text) =>
      text.length === 0
        ? "Type something…"
        : text.length < MIN_LENGTH
          ? `Keep going… (${MIN_LENGTH - text.length} more)`
          : `Looks good: ${text.length} characters`,
    );
    const isValid = Stream.map(SubscriptionRef.changes(value), (text) => text.length >= MIN_LENGTH);

    return yield* h.div(
      { class: "flex flex-col gap-2 rounded-lg border border-slate-7 bg-slate-2 p-4" },
      [
        h.input({
          type: "text",
          // `demo-input-field` is a semantic test hook.
          class: "demo-input-field rounded-md border border-slate-6 px-2.5 py-2 text-[0.95rem]",
          placeholder: "Type here…",
          value: SubscriptionRef.changes(value),
          oninput: onInput,
        }),
        h.p(
          {
            class: "m-0 text-[0.85rem]",
            style: { color: Stream.map(isValid, (ok) => (ok ? "#3fb950" : "#8b949e")) },
          },
          [message],
        ),
      ],
    );
  });
