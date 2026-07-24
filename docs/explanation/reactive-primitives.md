---
title: Reactive Primitives
order: 3
section: explanation
description: The Source<A, E, R> vocabulary; Stream, Effect, and Subscribable as prop values and children; derived streams, reactive styles, and NoPropValue.
---

# Reactive Primitives

Weft accepts a `Source` for any prop value, any child, and any style value: one vocabulary, four kinds, used interchangeably wherever reactivity is supported.

| Kind                                                      | Behavior                                  |
| --------------------------------------------------------- | ----------------------------------------- |
| a plain static value (`string`, `number`, `boolean`, ...) | set once, never updates                   |
| `Effect.Effect<A, E, R>`                                  | runs once, resolves to a value            |
| `Stream.Stream<A, E, R>`                                  | each emission replaces the previous value |
| `Subscribable<A, E, R>`                                   | a hot stream: already has a current value |

```typescript
type Source<A, E, R> = A | Effect.Effect<A, E, R> | Stream.Stream<A, E, R> | Subscribable<A, E, R>;
```

## Static values

Static props are set once and never updated:

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

Streams are the primary reactive primitive. Each emission replaces the previous value in the DOM (no diffing, direct DOM update):

```typescript
import { SubscriptionRef, Stream } from "effect";

const count = yield * SubscriptionRef.make(0);

// SubscriptionRef.changes(count) is a Stream<number>: each new value updates the text node
h.span([SubscriptionRef.changes(count)]);

// Stream as a prop: each emission sets the attribute
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
// static value into each emitted object with Stream.map. You cannot spread the
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

## Latest-value-wins conflation

Every reactive region and prop is drained by one shared commit scheduler, the
Loom (see [The Rendering Model](./rendering-model.md#the-loom-one-scheduler-per-app-committing-asynchronously)).
When a source emits faster than the DOM commits, the Loom conflates the burst:
it keeps only the newest value per region and skips the intermediate ones.

```typescript
const ticks = Stream.range(0, 999); // publishes far faster than the DOM commits

h.span([ticks]); // the span settles on 999; 0 through 998 may never render
```

The final DOM state always reflects the newest value; nothing is lost
permanently. What is skipped are the values in between, by design: this is
what keeps a fast-publishing source from piling up unbounded DOM work.

Code that must observe every emission, not just the settled one (an audit
log, a counter that sums each tick), should consume the stream directly
instead of relying on what lands in the DOM:

```typescript
yield * Stream.runForEach(ticks, (n) => Effect.sync(() => total.push(n)));
```

## NoPropValue

A finite `Stream` prop can end without ever emitting, e.g. `Stream.empty` or `Stream.take(0, stream)`. When it does, the renderer raises a `NoPropValue` tagged error carrying an optional `key` that identifies the prop:

```typescript
h.span([Stream.empty]); // completes without emitting: raises NoPropValue
```

`Effect.catchTag` matches by the string tag, so handling it at the mount boundary needs no `NoPropValue` import:

```typescript
pipe(
  WeftApp.mount(app, App(), root),
  Effect.catchTag("NoPropValue", (e) =>
    Effect.logWarning(`Prop stream ended before emitting: ${e.key}`),
  ),
);
```

`SubscriptionRef.changes` and other infinite streams always emit before completing, so most usage never raises it.

## See also

- [The Rendering Model](./rendering-model.md): streams as the weft woven through a static tree
- [The Combinator API](./combinator-api.md): how reactive props and children contribute `E`/`R`
- [Style Reactively](../how-to/style-reactively.md) and [Render Keyed Lists](../how-to/render-keyed-lists.md): reactive props and collections in practice
- [`Source` reference](../reference/core.md#source-namespace): the `Source` type and `Source.toSubscribable`
