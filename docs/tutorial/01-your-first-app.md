---
title: Your First App
order: 1
section: tutorial
description: Install Weft, build a component with the h namespace, and mount it — the smallest possible Weft app.
---

# Your First App

This is the first step of a four-part tutorial that builds up a Weft app from a static component to a server-rendered, error-handled one. By the end you will have touched every core idea; each step adds exactly one.

We assume you know [Effect](https://effect.website/docs/getting-started/introduction) fundamentals — Weft is Effect for the UI, and we will not re-explain `Effect.gen`, services, or streams from scratch.

## Install

```bash
npm install @weftui/core @weftui/dom effect@beta
```

Weft tracks Effect 4's beta line. This release is built and tested against `effect@4.0.0-beta.98`; the peer range accepts newer 4.0 betas, which may contain upstream breaking changes.

`@weftui/core` gives you the element builders and combinators; `@weftui/dom` renders them (its `./client` entry mounts in the browser). `effect` is the peer everything is built on.

## Build a component

A **component is a plain function you call** — there is no JSX and no `<Component/>` deferral. It returns a `Node`, which is just an `Effect` that produces a DOM node:

```typescript
import { h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";

function App() {
  return h.div({ class: "app" }, [h.h1("Hello, Weft"), h.p("A minimal app.")]);
}

const app = WeftApp.make();
void Effect.runPromise(WeftApp.mount(app, App(), document.getElementById("root")!));
```

The `h` namespace is the entry point: every property (`h.div`, `h.h1`, `h.button`, …) is a builder for that HTML tag. A builder takes optional props and children, and returns a `Node`.

## What just happened

- `App()` returns a **`Node<never, never>`** — the two type parameters are the error channel (`E`) and the requirement channel (`R`), both `never` here because this component neither fails nor needs a service. As your app grows, those channels accumulate what it can fail with and what it depends on. That is the whole point of Weft's types — see [The Rendering Model](../explanation/rendering-model.md).
- `WeftApp.make()` creates a Weft app — synchronously, with no layer to build yet. `WeftApp.mount(app, node, target)` renders the node into `target`, building real DOM and starting any reactive streams. It returns `Effect<RootHandle, …>` with `R = never`, so a bare `Effect.runPromise` runs it — no `Effect.provide` needed. You will give `WeftApp.make` a `Layer` once components need services — see [Services and Async](./03-services-and-async.md).
- The component function runs **once**. Nothing here re-runs on a timer or a state change — because there is no state yet. That comes next.

## Next

- [Reactivity →](./02-reactivity.md) — make the UI change over time with `SubscriptionRef` and streams
