---
title: Style Reactively
order: 10
section: how-to
description: Drive inline styles from streams (a single property, or a whole style object) so the DOM updates in place with CSS transitions.
---

# Style Reactively

**Goal:** animate or react to state in an element's inline style without re-rendering. Drive a single CSS property, or a whole style object, from a stream.

The `style` prop accepts the [`Source`](../explanation/reactive-primitives.md) vocabulary at any level. A property value can be a stream, and you can spread a stream of style objects. CSS `transition` composes naturally, because the renderer mutates the existing node in place.

```typescript
import { h } from "@weftui/core";
import { Schedule, Stream } from "effect";

const AnimatedHue = () => {
  const hue = Stream.iterate(0, (h) => (h + 2) % 360).pipe(
    Stream.schedule(Schedule.spaced("50 millis")),
  );

  return h.div(
    {
      class: "demo-box",
      style: {
        // one property is reactive; the rest are static
        backgroundColor: Stream.map(hue, (h) => `hsl(${h}, 70%, 60%)`),
        transition: "background-color 0.05s",
      },
    },
    "Hue",
  );
};
```

## Three modes

1. **A single property as a stream.** As above: one key's value is a `Stream`, the others are static strings. Each stream property is subscribed independently.
2. **A static object.** An ordinary `style: { backgroundColor: "#667eea" }` with no streams; nothing updates.
3. **A whole style object as a stream.** Spread a stream that emits complete style objects, merged with static props:

```typescript
const pulse = Stream.make(1, 0.5).pipe(
  Stream.schedule(Schedule.spaced("800 millis")),
  Stream.forever,
);

h.div({ style: { ...pulse, transition: "opacity 0.4s ease-in-out" } }, "Pulse");
```

## Notes

- **Property names are camelCase** (`backgroundColor`, `boxShadow`), the same keys as the DOM `style` object.
- **CSS transitions just work.** A stream emission patches the DOM node directly (no re-render), so the browser applies the `transition` as it would for any style mutation.
- **Pace with `Schedule`.** The idiom for time-based style animation: `Stream.iterate`/`Stream.make` paced by `Stream.schedule(Schedule.spaced(…))` and looped with `Stream.forever`. Combine with any Effect timing you like.
- **Classes have a reactive builder too.** `Props.cx` builds a class string from strings, falsy values, nested arrays, and `{ className: condition }` records, where a condition may be a stream. Merging two bags that both carry `class` concatenates them. See [Compose Behavior and Markup](./compose-behavior-and-markup.md).

## See also

- [Reactive Primitives](../explanation/reactive-primitives.md): reactive style props and the `Source` vocabulary
- [Compose Behavior and Markup](./compose-behavior-and-markup.md): `Props.cx` and merging `class` across two prop bags
- [examples/reactive-styles](../../examples/reactive-styles): per-property and whole-object stream styles with CSS transitions
