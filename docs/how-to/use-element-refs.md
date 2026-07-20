---
title: Use Element Refs
order: 11
section: how-to
description: Capture a DOM element with the ref prop into a SubscriptionRef<Option<HTMLElement>>, then react to its mount with a scoped observer or read it imperatively.
---

# Use Element Refs

**Goal:** get a handle to a real DOM element, to focus it, measure it, or call an imperative browser API on it.

Declare a `SubscriptionRef<Option<HTMLElement>>` and attach it with the `ref` prop. Then either **react** to the element appearing (a scoped observer on `SubscriptionRef.changes(ref)`) or **read** it later inside a handler.

```typescript
import { h } from "@weftui/core";
import { Effect, Option, pipe, Stream, SubscriptionRef } from "effect";

const AutoFocusInput = () =>
  Effect.gen(function* () {
    const inputRef = yield* SubscriptionRef.make<Option.Option<HTMLInputElement>>(Option.none());

    // Observe the element becoming available, once, and focus it.
    yield* pipe(
      SubscriptionRef.changes(inputRef),
      Stream.filter(Option.isSome),
      Stream.take(1),
      Stream.runForEach((el) => Effect.sync(() => el.value.focus())),
      Effect.forkScoped, // ← ties the observer to the component's instance scope
    );

    return yield* h.input({ ref: inputRef, type: "text", placeholder: "I'm focused!" });
  });
```

## How it works

- **The `ref` prop** takes a `SubscriptionRef<Option<T>>`. The renderer sets it to `Option.some(element)` **once**, when the element is created. The ref is therefore an `Option`: `None` until mount, `Some(el)` after.
- **React to mount** by observing `SubscriptionRef.changes(ref)`. `Stream.filter(Option.isSome)` waits for the element, `Stream.take(1)` takes just the first appearance, and `Stream.runForEach` does the imperative work. This is the equivalent of a mount effect.
- **Use `Effect.forkScoped`, not `Effect.forkChild`.** `forkScoped` ties the observer fiber to the component's **instance scope** (the ambient `Scope` the renderer provides). It lives as long as the component is mounted. A bare `Effect.forkChild` binds to the transient component-body fiber and is interrupted the instant the generator returns, so the observer would never fire.

## Read a ref imperatively

When you only need the element later (e.g. in a click handler), skip the observer and read the ref on demand:

```typescript
const scroll = () =>
  Effect.gen(function* () {
    const el = yield* SubscriptionRef.get(targetRef);
    if (Option.isSome(el)) el.value.scrollIntoView({ behavior: "smooth" });
  });
```

## Notes

- A plain `Ref` suffices if you **only** read the element imperatively; use `SubscriptionRef` when you need to **react** to it becoming available.
- Refs are set once at element creation and are not cleared on unmount.
- **Several refs can share one element.** `ref` also accepts an array, and every entry receives the element: `h.div({ ref: [measure, focus] })`. `Props.merge` produces such an array when both bags carry a `ref`, so a shared behavior's ref and your own can coexist. See [Compose Behavior and Markup](./compose-behavior-and-markup.md).
- Coming from React: `SubscriptionRef.make<Option<T>>(Option.none())` ↔ `useRef<T>(null)`; the `Stream.filter(Option.isSome)` observer ↔ a `useEffect` mount guard.

## See also

- [Reactive Primitives](../explanation/reactive-primitives.md): `SubscriptionRef` and `SubscriptionRef.changes`
- [Author Components](./author-components.md): instance scope and `Effect.forkScoped`
- [Compose Behavior and Markup](./compose-behavior-and-markup.md): merging a shared behavior's `ref` with your own
- [examples/element-ref](../../examples/element-ref): auto-focus, element measurement, and imperative scroll via refs
