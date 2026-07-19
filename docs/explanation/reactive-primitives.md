---
title: Reactive Primitives
order: 3
section: explanation
description: The Source<A, E, R> vocabulary; Stream, Effect, and Subscribable as prop values and children; derived streams, reactive styles, and NoPropValue.
---

# Reactive Primitives

The unified `Source` vocabulary is what lets static values, Effects, Streams, and Subscribables be used interchangeably wherever reactivity is supported — props, children, and style values all accept the same type.

Weft accepts a `Source` for prop values and children. Any of these is valid wherever reactivity is supported:

- A plain static value (`string`, `number`, `boolean`, ...)
- An `Effect.Effect<A, E, R>` — runs once and resolves to a value
- A `Stream.Stream<A, E, R>` — each emission replaces the previous value
- A `Subscribable<A, E, R>` — like a hot stream; already has a "current value"

The `Source<A, E, R>` type captures this union:

```typescript
type Source<A, E, R> = A | Effect.Effect<A, E, R> | Stream.Stream<A, E, R> | Subscribable<A, E, R>;
```

## Static values

Static props behave exactly as you'd expect — set once and never updated:

```typescript
h.div({ class: "container", id: "root" }, "Hello");
```

## Effect props

When a prop value is an `Effect`, it runs once and the resulting value is applied:

```typescript
const username = Effect.map(fetchProfile(), (p) => p.name);

// Renders the username once it resolves
h.span([username]);
```

The `E` and `R` channels of the Effect flow into the node's own channels.

## Stream props and children

Streams are the primary reactive primitive. Each emission replaces the previous value in the DOM — no diffing, direct DOM update:

```typescript
import { SubscriptionRef, Stream } from "effect";

const count = yield * SubscriptionRef.make(0);

// SubscriptionRef.changes(count) is a Stream<number> — each new value updates the text node
h.span([SubscriptionRef.changes(count)]);

// Stream as a prop — each emission sets the attribute
const isDisabled = Stream.map(SubscriptionRef.changes(count), (n) => n >= 10);
h.button({ disabled: isDisabled }, "Submit");
```

Streams can also supply entire child arrays. Each emission replaces the previous set of children:

```typescript
const todos = yield * SubscriptionRef.make<string[]>([]);

h.ul([Stream.map(SubscriptionRef.changes(todos), (list) => list.map((item) => h.li(item)))]);
```

## Derived streams

Because `SubscriptionRef.changes(ref)` returns a plain `Stream`, the full Stream API applies:

```typescript
const count = yield * SubscriptionRef.make(0);

const doubled = Stream.map(SubscriptionRef.changes(count), (n) => n * 2);
const formatted = Stream.map(SubscriptionRef.changes(count), (n) => `Count: ${n}`);
const isHigh = Stream.map(SubscriptionRef.changes(count), (n) => n > 10);

h.div([
  h.p([SubscriptionRef.changes(count)]),
  h.p([doubled]),
  h.p([formatted]),
  h.p({ style: { color: Stream.map(isHigh, (b) => (b ? "red" : "black")) } }, "Status"),
]);
```

Multiple refs can be combined with `Stream.zipLatestWith`, `Stream.merge`, or other combinators:

```typescript
const firstName = yield * SubscriptionRef.make("");
const lastName = yield * SubscriptionRef.make("");

const fullName = Stream.zipLatestWith(
  SubscriptionRef.changes(firstName),
  SubscriptionRef.changes(lastName),
  (first, last) => `${first} ${last}`.trim(),
);
```

## Reactive styles

The `style` prop accepts the same `Source` vocabulary at any level:

```typescript
// Individual property as a stream
h.div({
  style: {
    color: colorStream, // Stream<string>
    opacity: opacityStream, // Stream<number>
    fontWeight: "bold", // static
  },
});

// Entire style object as a stream
h.div({ style: styleObjectStream });

// Combine a whole-object stream with a static property.
// A whole-object stream replaces every property on each emit, so fold the
// static value into each emitted object with Stream.map — you cannot spread the
// Stream itself into a style object (that copies the Stream's internals, not
// its emitted style keys).
h.div({
  style: Stream.map(styleObjectStream, (s) => ({
    ...s, // reactive properties
    transition: "all 0.3s", // static, applied on every emit
  })),
});

// For a mix of static and per-property reactive values, use per-property
// streams alongside static siblings instead:
h.div({
  style: {
    transform: transformStream, // reactive, per-property
    transition: "all 0.3s", // static
  },
});
```

## NoPropValue

When a `Stream` prop ends before emitting, the renderer raises a `NoPropValue` tagged error. This carries an optional `key` field identifying which prop triggered it:

```typescript
// Handle at the mount boundary if needed. `Effect.catchTag` matches the error
// by its string tag, so no `NoPropValue` import is required here.
pipe(
  WeftApp.mount(app, App(), root),
  Effect.catchTag("NoPropValue", (e) =>
    Effect.logWarning(`Prop stream ended before emitting: ${e.key}`),
  ),
);
```

In practice you only encounter `NoPropValue` if you use a finite `Stream` as a prop and it ends before emitting — e.g., `Stream.empty` or `Stream.take(0, stream)`. Most usage with `SubscriptionRef.changes` or infinite streams never raises it.

## See also

- [The Rendering Model](./rendering-model.md) — streams as the weft woven through a static tree
- [The Combinator API](./combinator-api.md) — how reactive props and children contribute `E`/`R`
- [Style Reactively](../how-to/style-reactively.md) and [Render Keyed Lists](../how-to/render-keyed-lists.md) — reactive props and collections in practice
- [`Source` reference](../reference/core.md#source-namespace) — the `Source` type and `Source.toSubscribable`
