---
title: Reactivity
order: 2
section: tutorial
description: Add component-local state with SubscriptionRef and weave its stream of changes into the tree so the DOM updates in place.
---

# Reactivity

[Previously](./01-your-first-app.md) we mounted a static component. Now we make it change over time — the defining move in Weft: **weave a stream through the tree, and only that point updates.**

## Local state with `SubscriptionRef`

Use Effect's `SubscriptionRef` for component-local state. `SubscriptionRef.changes(ref)` returns a `Stream` that emits the current value and then every update. Pass that stream as a child or prop and the DOM at that spot becomes live:

```typescript
import { h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect, SubscriptionRef } from "effect";

const Counter = () =>
  Effect.gen(function* () {
    const count = yield* SubscriptionRef.make(0);

    return yield* h.div([
      h.span([SubscriptionRef.changes(count)]),
      h.button({ onclick: () => SubscriptionRef.update(count, (n) => n + 1) }, "+"),
      h.button({ onclick: () => SubscriptionRef.update(count, (n) => n - 1) }, "-"),
    ]);
  });

const app = WeftApp.make();
void Effect.runPromise(WeftApp.mount(app, Counter(), document.getElementById("root")!));
```

`Effect.gen` lets you `yield*` the `SubscriptionRef` to set up state **before** building the tree. Because a `Node` is an `Effect`, the component body is an ordinary generator — no hooks, no dependency arrays.

## The key idea: the body runs once

The `Counter` function runs **exactly once**. It creates the ref, builds the tree, and returns. After that, nothing re-invokes it — the only thing that changes the DOM is the `SubscriptionRef.changes(count)` stream woven into the `h.span`. When you click `+`, `SubscriptionRef.update` pushes a new value, the stream emits, and the renderer patches _just that span's text_ in place. No diff, no re-render, no sibling touched.

This is what "streams are the weft" means in practice: reactivity is local to exactly where you thread a stream. Everything else is static. The full model is [The Rendering Model](../explanation/rendering-model.md); the vocabulary of stream-shaped values is [Reactive Primitives](../explanation/reactive-primitives.md).

> **Note.** `[SubscriptionRef.changes(count)]` — the stream is passed as a child array. Static values (`"Hello"`, `5`) work in the same position and simply never change. The rule is uniform: a plain value is static, a stream-shaped value is reactive.

## Deriving values

Because `SubscriptionRef.changes(count)` returns a `Stream`, you shape reactive text with ordinary stream operators:

```typescript
h.span([Stream.map(SubscriptionRef.changes(count), (n) => `Count: ${n}`)]);
```

Anywhere you would compute a derived value, map the stream instead — the derivation stays reactive.

## Next

- [Services and Async →](./03-services-and-async.md) — pull dependencies from the environment and render async loading states
