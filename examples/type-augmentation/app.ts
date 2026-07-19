/**
 * Example: Type Augmentation, typed custom elements on `h`.
 *
 * `h` exposes a builder for every HTML and SVG tag, typed from the `HTMLElements` /
 * `SVGElements` interfaces. For **custom elements** (Web Components) it reads an
 * *augmentable* `CustomElements` interface, exported from `@weftui/core`. Declaring a
 * tag there makes `h["<tag>"]` a first-class, typed builder. Its props are checked
 * exactly like a native element's, and unknown props are a compile error.
 *
 * This example augments `CustomElements` with a `<greeting-badge name>` element, then
 * renders it two ways: with a static `name`, and with a reactive `name` driven by a
 * `SubscriptionRef` stream (props accept the `Source` vocabulary, so a custom element
 * takes static *or* reactive values just like a native one).
 *
 * `app.ts` is side-effect-free (no top-level `mount`); the custom element is registered
 * lazily and idempotently from `App()`.
 */

import { h } from "@weftui/core";
import type { Source } from "@weftui/core";
import { Effect, SubscriptionRef } from "effect";

// --- The augmentation: teach `h` about our custom element and its props. ---
declare module "@weftui/core" {
  interface CustomElements {
    "greeting-badge": {
      /** Name to greet; reflected into the badge's text. Static or reactive. */
      name?: Source.Source<string>;
    };
  }
}

/** An autonomous custom element that greets its `name` attribute. */
class GreetingBadge extends HTMLElement {
  static readonly observedAttributes = ["name"];

  connectedCallback(): void {
    this.#render();
  }

  attributeChangedCallback(): void {
    this.#render();
  }

  #render(): void {
    this.textContent = `Hello, ${this.getAttribute("name") ?? "stranger"}!`;
  }
}

/** Registers the element once; safe to call on every `App()` (mounts are idempotent). */
function ensureDefined(): void {
  if (customElements.get("greeting-badge") === undefined) {
    customElements.define("greeting-badge", GreetingBadge);
  }
}

export const App = () =>
  Effect.gen(function* () {
    ensureDefined();
    const name = yield* SubscriptionRef.make("World");

    return yield* h.div({ class: "app" }, [
      // Static prop: fully typed by the CustomElements augmentation.
      h.section({ class: "static" }, [h["greeting-badge"]({ name: "Weft" })]),

      // Reactive prop: a stream flows into the custom element's attribute in place.
      h.section({ class: "reactive" }, [
        h["greeting-badge"]({ name: SubscriptionRef.changes(name) }),
        h.input({
          class: "name-input",
          value: SubscriptionRef.changes(name),
          oninput: (e) => SubscriptionRef.set(name, (e.target as HTMLInputElement).value),
        }),
      ]),
    ]);
  });
