# Type Augmentation: typed custom elements on `h`

## Overview

`h` gives you a typed builder for every HTML and SVG tag. This example shows how to add
your own **custom elements** (Web Components) to that surface so `h["my-tag"]` is
first-class and fully type-checked, via the augmentable `CustomElements` interface
exported from `@weftui/core`.

## Problem

`h` types native tags from the built-in `HTMLElements` / `SVGElements` interfaces, but it
cannot know about a custom element you register at runtime (`<greeting-badge>`,
`<my-chart>`, …). Without help, there is no per-tag prop contract for it.

## Solution

`@weftui/core` exports an empty, **augmentable** `CustomElements` interface. `h` maps it
alongside the native tags:

```ts
import type { Source } from "@weftui/core";

declare module "@weftui/core" {
  interface CustomElements {
    "greeting-badge": { name?: Source.Source<string> };
  }
}
```

(The `import` matters: it brings `Source` into scope **and** makes the file a module,
so the `declare module` block _augments_ `@weftui/core`. In an import-free file it
would instead redeclare, and thus shadow, the whole package.)

That single declaration makes `h["greeting-badge"]({ name: "Weft" })` a typed builder:
`name` is checked and an unknown prop is a compile error. Because the prop is typed as
`Source.Source<string>`, it accepts a **static value or a reactive stream**, exactly like
a native element's prop.

## How It Works

1. **Augment** `CustomElements` in `app.ts` with the tag and its props.
2. **Register** the element with `customElements.define` (done lazily and idempotently
   from `App()`, so `app.ts` stays side-effect-free).
3. **Render** it through `h`: a static badge (`name: "Weft"`) and a reactive badge whose
   `name` is a `SubscriptionRef` stream. Typing into the input pushes a new value; the
   renderer patches the custom element's `name` attribute in place, and the element's
   `attributeChangedCallback` updates its greeting.

## When to Use

Augment `CustomElements` whenever you render Web Components through `h` and want the same
type safety and reactive-prop ergonomics you get for native tags: design-system elements,
third-party components, or your own autonomous custom elements.

## Run

```bash
vp dev                # from this directory
vp run test:browser   # from the repo root; runs app.browser.test.ts
```
