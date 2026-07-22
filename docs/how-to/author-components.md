---
title: Component Authoring
order: 1
section: how-to
description: Plain functions vs. Component.gen / Component.make, instance scope, fragments, render-prop children, and service requirements.
---

# Component Authoring

Weft components are plain TypeScript functions that return a `Node<E, R>`. This guide covers the two ways to define them and when to choose each.

## Plain functions

The simplest component is just a function:

```typescript
import { h } from "@weftui/core";

function Greeting({ name }: { name: string }) {
  return h.p(`Hello, ${name}!`);
}

// Call it like a function
Greeting({ name: "World" });
```

Use a plain function when:

- Props are all static (strings, numbers, plain functions)
- The component has no internal state
- You don't need the caller's reactive prop types to propagate

## Components with internal state

When a component needs reactive state, use `Effect.gen` to set it up before building the tree. The component function still runs once. The setup happens at mount time:

```typescript
import { h } from "@weftui/core";
import { Effect, SubscriptionRef } from "effect";

const Counter = () =>
  Effect.gen(function* () {
    const count = yield* SubscriptionRef.make(0);

    return yield* h.div([
      h.span([SubscriptionRef.changes(count)]),
      h.button({ onclick: () => SubscriptionRef.update(count, (n) => n + 1) }, "+"),
    ]);
  });
```

The return type here is `Effect.Effect<Node, never, never>`, itself a valid `Node`, so it composes naturally with other tree-building calls.

As soon as such a component is reused or takes props, wrap the same generator in [`Component.gen`](#componentgen--componentmake-for-reusable-components) (below). That way the caller's reactive prop and children channels flow into its node type.

## Component scope and background effects

Every component instance is rendered under its own **instance scope**, a child of the
mount scope created fresh for that instance. Anything bound to the instance scope lives
exactly as long as the component is mounted. It is torn down automatically when the
component unmounts (or when its root unmounts via `RootHandle.unmount()`).

The renderer provides this scope as the ambient `Scope.Scope` while it evaluates the
component body, so it is already in context when you need it.

This matters the moment a component starts **background work**: a subscription, an
observer of a `ref`, a polling timer, anything you `fork`. The rule:

> Fork background work with **`Effect.forkScoped`**, never a bare `Effect.forkChild`.

`Effect.forkScoped` attaches the fiber to the instance scope, so it keeps running for
the component's lifetime and is interrupted on unmount. A bare `Effect.forkChild` instead
attaches the fiber to the component-body fiber, the one that runs your `Effect.gen` to
produce the tree. That fiber completes the instant the gen returns its node, so the
forked work is cancelled almost immediately.

Concretely, an observer that runs an effect when a `ref`'s element mounts:

```typescript
import { h } from "@weftui/core";
import { Effect, Option, pipe, Stream, SubscriptionRef } from "effect";

const AutoFocusInput = () =>
  Effect.gen(function* () {
    const inputRef = yield* SubscriptionRef.make<Option.Option<HTMLInputElement>>(Option.none());

    yield* pipe(
      SubscriptionRef.changes(inputRef),
      Stream.filter(Option.isSome),
      Stream.take(1),
      Stream.runForEach((el) => Effect.sync(() => el.value.focus())),
      Effect.forkScoped, // ✅ tied to the instance scope: survives until unmount
      // Effect.forkChild, // ❌ tied to the body fiber: interrupted when the gen returns
    );

    return yield* h.input({ ref: inputRef, type: "text" });
  });
```

You do not manage the scope yourself: you do not create it, close it, or pass it
around. `forkScoped` reads it from context, and unmount closes it for you. If you ever
fork outside a component body (rare), you must supply a `Scope.Scope` yourself. The
type system will tell you, because `forkScoped` carries a `Scope.Scope` requirement.

See `examples/element-ref` for the auto-focus, measure, and canvas recipes built on
this pattern.

## `Component.gen` / `Component.make` for reusable components

When you want the caller's reactive prop types to flow into the returned node's type, use one of the `Component` factories. Both have the same call semantics; pick the body style that fits:

- **`Component.make`**: body is a plain function returning any `Effect` (typically a `Node`). Use for one-liners and pipe compositions.
- **`Component.gen`**: body is a generator. Use when you need `yield*` to set up local state or pull from services.

```typescript
import { Component, h, Source } from "@weftui/core";

interface CardProps {
  title: Source.Source<string>;
  body?: Source.Source<string>;
}

const Card = Component.make((props: CardProps) =>
  h.div({ class: "card" }, [
    h.h3({ class: "card-title" }, [props.title]),
    props.body ? h.p({ class: "card-body" }, [props.body]) : null,
  ]),
);
```

`Source.Source<string>` is Weft's caller-facing prop vocabulary: a single type covering a static `string`, a `Stream<string>`, an `Effect<string>`, or a `Subscribable<string>`. You don't hand-write `string | Stream.Stream<string> | …` on every prop.

Passing a `Source` straight to `h` (as above) is all you need when the value is just spliced into the tree. The renderer normalizes it.

Now the caller's stream types are visible in the returned node:

```typescript
declare const titleStream: Stream.Stream<string, never, I18nService>;

// Node<never, I18nService>: I18nService requirement flows out
const card = Card({ title: titleStream });
```

Without a `Component` factory, a plain function's return type is fixed at definition time and won't reflect the caller's reactive prop types.

### Body `E`/`R` inference

You don't declare the body's `E`/`R` channels explicitly. They're inferred from the returned (or yielded) effect:

- The body's `E`/`R` come from whatever effects appear inside.
- The caller's reactive prop channels and reactive children channels are unioned on top at the call site.
- Static prop values (`string`, `number`, plain functions) contribute `never`.

### Children: array or function

Both factories accept an optional second `children` argument, typed as:

```typescript
type Component.Children<Input = never> =
  | readonly Renderable[]
  | ((input: Input) => readonly Renderable[]);
```

The function form is the render-prop / slot pattern. The component invokes the function with whatever input it chooses, and the returned array's `E`/`R` propagate out:

```typescript
const ItemList = Component.make(
  (props: { items: readonly string[] }, renderItem: (item: string) => readonly Renderable[]) =>
    h.ul(props.items.flatMap(renderItem)),
);

ItemList({ items: ["a", "b"] }, (item) => [h.li(item)]);
```

## Props typing

For a prop that accepts both static and reactive values, type it as [`Source.Source<T>`](../reference/core.md#source-namespace) rather than hand-writing the union. `Source.Source<T>` **is** that union: `T | Stream<T> | Effect<T> | Subscribable<T>`. The caller can pass a plain value or any reactive shape interchangeably, and you write it once:

```typescript
import { Source } from "@weftui/core";

interface ButtonProps {
  label: Source.Source<string>; // static or reactive text
  disabled?: Source.Source<boolean>; // static or reactive boolean
  onclick?: () => void | Effect.Effect<void>; // plain or Effect-returning handler
}
```

When a caller passes a plain string, the component's node type has `never` for that prop's channels. When they pass a `Stream.Stream<string, never, SomeService>`, `SomeService` appears in the `R` channel. The extraction is exactly `Source.Success` / `Source.Error` / `Source.Context`.

### Reading a `Source` in the body

Splicing a `Source` straight into `h` (`[props.label]`) is enough when you only place it in the tree. When the body needs to **read or derive** from the value (combine two props, feed a stream operator, drive logic), normalize it first with [`Source.toSubscribable`](../reference/core.md#sourcetosubscribablesource-key). It turns any `Source<A>` into an await-first, hot `Subscribable<A>`:

```typescript
import { Component, h, Source, Subscribable } from "@weftui/core";
import { Stream } from "effect";

const LoudLabel = Component.gen(function* (props: { label: Source.Source<string> }) {
  const label = yield* Source.toSubscribable(props.label); // Subscribable<string>
  // Now derive from it like any Subscribable: static, Effect, and Stream inputs all work.
  return yield* h.strong([Stream.map(Subscribable.changes(label), (text) => text.toUpperCase())]);
});
```

`toSubscribable` is scoped:

- A `Stream` prop is pumped by a fiber that terminates with the component's instance scope.
- An `Effect` prop is memoized.
- An existing `Subscribable` is threaded through by reference.
- A static value emits once.

It is the same normalization the renderer applies to props internally. Reach for it whenever you need the value as a `Subscribable` instead of leaving it opaque.

## Composing components

Call component functions directly inside a children array:

```typescript
import { h } from "@weftui/core";

function App() {
  return h.div({ class: "app" }, [
    Header({ title: "My App" }),
    h.main([Sidebar(), h.article([Content({ id: 1 })])]),
    Footer(),
  ]);
}
```

Children arrays accumulate `E`/`R` from all their members. The parent node's type reflects the union of all children's channels.

## Components that require services

If a component's render function uses a service via `yield*`, that service appears in the component's `CompR` parameter:

```typescript
import { Component, h } from "@weftui/core";

const UserAvatar = Component.gen(function* (props: { userId: string }) {
  const userService = yield* UserService;
  const user = yield* userService.getUser(props.userId);
  return yield* h.img({ src: user.avatarUrl, alt: user.name });
});

// Node<never, UserService>: regardless of what the caller passes
const avatar = UserAvatar({ userId: "123" });
```

Give the service to the app layer:

```typescript
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";

const app = WeftApp.make(UserServiceLive);
void Effect.runPromise(WeftApp.mount(app, App(), document.getElementById("root")!));
```

## Returning fragments

When a component needs to return multiple sibling elements without a wrapper, use `h.fragment`:

```typescript
import { h } from "@weftui/core";

const TableCells = ({ row }: { row: Row }) =>
  h.fragment([h.td(row.name), h.td(row.value), h.td(row.status)]);
```

`h.fragment` returns a `Node<E, R>` that accumulates channels from all its children.

## See also

- [The Combinator API](../explanation/combinator-api.md): `h`, `h.fragment`, and how `E`/`R` accumulate
- [Reactive Primitives](../explanation/reactive-primitives.md): the `Source` vocabulary props accept
- [Add Routing](./add-routing.md): route components are `Component` slots
- [`@weftui/core` reference](../reference/core.md): `Component`, `Source`, and the full surface
