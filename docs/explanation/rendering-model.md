---
title: The Rendering Model
order: 1
section: explanation
description: Why Weft has no virtual DOM — nodes are Effects, streams are the live thread woven through a static tree, and hydration adopts server DOM in place.
---

# The Rendering Model

Weft renders UI by **weaving streams through a static tree**. There is no virtual DOM, no diff, no reconciler comparing two trees each frame. This page explains the model that makes that work — and why it falls out of one definition.

## Nodes are Effects

The whole library rests on a single equation:

```typescript
type Node<E = never, R = never> = Effect.Effect<ElementDescriptor, E, R>;
```

Every element in a Weft tree **is an Effect**. `h.div(...)`, a component's return value, a boundary — each is an `Effect` that, when run, produces an element descriptor. Two consequences follow immediately, and they shape everything else:

1. **The error (`E`) and requirement (`R`) channels accumulate through the tree.** A child that reads a service, or a prop backed by a failible stream, contributes its `R` and `E` to its parent, which contributes to _its_ parent, up to the mount boundary. The type of your app node is the exact union of everything it needs and everything it can fail with — visible to the type checker, satisfiable exactly once, at `mount`/`hydrate`. See [The Combinator API](./combinator-api.md) for how the accumulation works mechanically.
2. **Every Effect combinator applies to a node directly.** `Effect.provide`, `Effect.flatMap`, `Effect.gen`, `Effect.catch` — none of them are special-cased for UI. A node is an ordinary Effect, so the entire Effect ecosystem composes with your view for free.

JSX collapses every component to an opaque `JSX.Element`, erasing both channels. Weft keeps them, and that is the point of the whole design. (There is [no JSX](./combinator-api.md) here — components are plain functions you _call_.)

## Warp and weft

The name is the metaphor. On a loom, the **warp** is the set of fixed threads held under tension; the **weft** is the live thread drawn back and forth across them to form the cloth.

- Your **component tree is the warp** — the structure, fixed for the lifetime of a mounted region.
- **Streams are the weft** — the live values drawn across that structure. A `Stream`, `Effect`, or `Subscribable` used as a prop value or child is a thread woven through a specific point in the tree.

When a stream emits, only the DOM at _that_ point updates. Nothing above it re-runs; no sibling is touched; there is no tree to diff because the structure never changed — only a value threaded through one hole in it did. This is why Weft needs no virtual DOM: **the reactivity is local by construction.** The vocabulary of stream-shaped values (and how their channels flow) is [Reactive Primitives](./reactive-primitives.md).

> **Note.** "Only that point updates" is the default, not a manual optimization. You do not memoize regions or declare dependencies — a value is reactive exactly where you thread a stream, and static everywhere else.

## Streams drive all updates

There is no `setState`, no render-triggering scheduler, no "re-render this component." A region of the DOM is live **if and only if** a stream is woven into it. To make something update, you thread a stream through it; to keep something static, you pass a plain value. The renderer subscribes to each woven stream and patches its target in place on every emission — reusing the existing DOM node, patching text and attributes rather than recreating elements (identity, focus, and typed input survive an update).

This also fixes the update _shape_. Because the structure is fixed, an update is always "new value into a known hole," never "reconcile these two trees." Even list rendering — where the number of children genuinely varies — is expressed as a keyed region ([`List.each`](../how-to/render-keyed-lists.md)) that reconciles by key rather than by structural diff.

## One tree, two sides, hydrate in place

The same component tree renders on the server and the client:

- On the **server**, the tree renders to an HTML string (or a streaming response) via `@weftui/dom/server`. The _hydratable_ renderers additionally emit the inline data each reactive region needs to resume.
- On the **client**, `WeftApp.hydrate` walks that server-rendered DOM and **adopts it in place** — it wires up reactivity and event handlers on the existing nodes rather than re-rendering. The first client production matches the adopted DOM exactly, so nothing is mutated and there is no flash.

Because the same `Node<E, R>` describes both passes, there is nothing to keep in sync: the server output and the client's first render are the _same tree_ run in two environments. Services flow from the app layer (or the router's render-time context) through the tree to wherever a component reads them, on both sides. The mechanics of the two-sided render live in [Render on the Server](../how-to/render-on-the-server.md); the service flow is [Services and Context](./services-and-context.md).

## Why this matters

- **No diff cost.** Updates are O(changed value), not O(tree). There is no reconciliation pass to pay for.
- **Local reasoning.** A stream woven at one point cannot affect another. What is reactive is exactly what you made reactive.
- **Type-honest edges.** The app node's `E`/`R` is the whole app's error and dependency surface, checked at compile time and discharged once at the edge.
- **Flash-free SSR by construction.** Hydration adopts rather than replaces, because the tree is identical on both sides.

## See also

- [The Combinator API](./combinator-api.md) — how `E`/`R` accumulate; why `Node` is an `Effect`; `h` and components
- [Reactive Primitives](./reactive-primitives.md) — the stream-shaped values you weave through the tree
- [Boundaries and Suspense](./boundaries-and-suspense.md) — how failure and async are modeled as nodes in the same tree
- [Render on the Server](../how-to/render-on-the-server.md) — the server/client split and `hydrate`
