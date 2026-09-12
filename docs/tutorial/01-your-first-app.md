---
title: Your First App
order: 1
section: tutorial
description: "Install Weft, build a component with the h namespace, and mount it: the smallest possible Weft app."
---

# Your First App

We assume you know [Effect](https://effect.website/docs/getting-started/introduction) fundamentals. Weft is Effect for the UI, so we will not re-explain `Effect.gen`, services, or streams from scratch.

Across this tutorial you build one app: a counter. This step renders its static shell.

## Install

```bash
npm install @weftui/core @weftui/dom effect@rc
```

Weft tracks Effect 4's prerelease line (beta, then rc). This release is built and tested against `effect@4.0.0-rc.115`; the peer range accepts newer 4.0 prereleases, which may contain upstream breaking changes.

## Build and mount it

A **component is a plain function you call**. There is no JSX and no `<Component/>` deferral. `App()` returns a `Node`, and the `h` namespace builds one: every property (`h.div`, `h.h1`, `h.button`, …) is a builder for that HTML tag, taking optional props and children.

```typescript
// src/app.ts
import { h } from "@weftui/core";

export function App() {
  return h.div({ class: "app" }, [
    h.h1("Weft Counter"),
    h.p({ class: "count" }, "Count: 0"),
    h.div({ class: "controls" }, [
      h.button({ type: "button" }, "−"),
      h.button({ type: "button" }, "+"),
    ]),
  ]);
}
```

```typescript
// src/main.ts
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App } from "./app";

const root = document.getElementById("root")!;

const app = WeftApp.make();
void Effect.runPromise(WeftApp.mount(app, App(), root));
```

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Weft counter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Run it with `vite` (or any dev server that serves ES modules) and you get a heading, a static count, and two inert buttons. The buttons don't do anything yet: that's next.

## What just happened

- `App()` returns a **`Node<never, never>`**, an `Effect` that resolves to an element descriptor, not a DOM node yet. `E` and `R` are `never` because this component neither fails nor needs a service. As your app grows, those channels accumulate what it can fail with and what it depends on: see [The Rendering Model](../explanation/rendering-model.md).
- `WeftApp.make()` creates a Weft app synchronously, with no layer to build yet. `WeftApp.mount(app, node, root)` renders `node` into `root`, building real DOM. It returns `Effect<RootHandle, …>` with `R = never`, so a bare `Effect.runPromise` runs it. You'll give `WeftApp.make` a `Layer` once components need services: see [Services and Async](./03-services-and-async.md).
- `App` runs **once**. Nothing re-invokes it, because there's no state yet.

## Next

- [Reactivity →](./02-reactivity.md): wire up the counter with `SubscriptionRef` and streams
