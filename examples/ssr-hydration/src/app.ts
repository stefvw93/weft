/**
 * The shared isomorphic App.
 *
 * Rendered to hydratable HTML on the server (`entry-server.ts`) and hydrated in
 * the browser (`entry-client.ts`) from that same markup. The `SubscriptionRef.changes(count)`
 * region is the flash-free region: the server's first emission (`3`) matches the
 * client's first emission (`3`), so `hydrate` adopts the existing node in place
 * without re-rendering: node identity is preserved, no flicker.
 */

import { h } from "@weftui/core";
import { Effect, SubscriptionRef } from "effect";

/**
 * Root component. Owns a `SubscriptionRef` counter seeded from `initialValue`
 * and renders a heading, a static blurb, the reactive count region, and the
 * increment/decrement controls. Requires no services.
 */
export const App = (props: { initialValue: number }) =>
  Effect.gen(function* () {
    const count = yield* SubscriptionRef.make(props.initialValue);
    const increment = () => SubscriptionRef.update(count, (n) => n + 1);
    const decrement = () => SubscriptionRef.update(count, (n) => n - 1);

    return yield* h.div([
      h.h1("SSR + Hydration"),
      h.p([
        "This page was rendered to HTML on the server and hydrated in the browser. The counter below shows ",
        h.code("3"),
        " before any JavaScript runs; once hydrated, the buttons work and the count node resumes in place, with no flash.",
      ]),
      h.div({ class: "count" }, [SubscriptionRef.changes(count)]),
      h.button({ type: "button", onclick: () => decrement() }, "-"),
      h.button({ type: "button", onclick: () => increment() }, "+"),

      h.div([h.span({ class: "status", id: "status" }, "[SSR: not yet interactive]")]),
    ]);
  });
