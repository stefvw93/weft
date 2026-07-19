# suspense

A live demo of `Suspense` boundaries in `@weftui/dom`, covering both streaming SSR and client-side boundary coordination.

## Overview

`Suspense` shows a shared fallback while async children (components returning `Effect<Node>` or `Stream<Node>`) are pending, then atomically swaps to the resolved content once **every** registered child has emitted its first value.

This demo shows two complementary patterns:

- **Shared fallback** (`Dashboard`): three sibling cards resolve at different times (300 ms, 600 ms, 900 ms) but the fallback waits for all of them.
- **Nested boundaries** (`NestedExample`): an inner boundary resolves at 200 ms, independently of an outer boundary that resolves at 800 ms.

## How to run

```bash
vp run -F suspense dev
```

Then open <http://localhost:3101>.

## How it works

### Server (streaming patch model)

`renderToStreamHydratable` processes `Suspense` boundaries with a two-phase model:

1. **Inline phase**: emits the fallback HTML between `<!-- suspense-start-N -->` and `<!-- suspense-end-N -->` comment markers immediately, as part of the main document stream.
2. **Patch phase**: forks a fiber that renders the children HTML. When that resolves, a `<template id="ef-s-N">` + self-removing `<script>` pair is appended after the main document.

The browser receives the fallback first (good TTFB) and then the script runs automatically, swapping the fallback for the resolved content via a `TreeWalker` that locates the comment markers.

### Client (mount path, no SSR)

When mounted directly (without SSR), each `Suspense` boundary:

1. Renders all children into a detached `DocumentFragment` immediately
2. Shows the fallback in the live DOM between comment markers
3. Tracks registered-but-not-settled children via a `Ref<number>` sentinel
4. Fires a single atomic DOM swap (`DocumentFragment` → live DOM) once all children have emitted their first value

### Hydration path

After the SSR patch scripts execute (before `WeftApp.hydrate()` loads), the DOM is fully resolved. `WeftApp.hydrate` sees `Suspense` as transparent, so it hydrates the children directly from the current cursor position, adopting the resolved DOM nodes in place.

## What to observe

- **`curl -N --no-buffer http://localhost:3101`** shows the streaming SSR output: fallback HTML + comment markers in the body, then `<template>` + `<script>` patches.
- **Slow network**: open DevTools Network → CPU throttling + disable cache. The page loads with the fallback visible first, then the patches arrive and scripts execute, resolving the UI progressively.
- **View source**: the initial HTML is static and readable, with no JavaScript needed to see the fallback content.
- **Status indicator**: flips from `[SSR: not yet interactive]` to `[hydrated: interactive]` once `WeftApp.hydrate()` completes.

## Usage

```typescript
import { h, Suspense } from "@weftui/core";
import { Effect, pipe } from "effect";

function AsyncCard({ id }: { id: number }) {
  return pipe(
    fetchCard(id),
    Effect.flatMap((data) => h.div({ class: "card" }, data.title)),
  );
}

function App() {
  return h.div([
    Suspense({ fallback: h.div({ class: "fallback" }, "Loading...") }, [
      h.div([AsyncCard({ id: 1 }), AsyncCard({ id: 2 }), AsyncCard({ id: 3 })]),
    ]),
  ]);
}
```
