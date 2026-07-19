---
title: Errors and Server Rendering
order: 4
section: tutorial
description: Catch rendering-path failures with Boundary, then render on the server and hydrate. The last step of the tutorial.
---

# Errors and Server Rendering

The final step. [We can now](./03-services-and-async.md) use services and async. Here we handle what happens when async work **fails**, and how the same tree renders on the server.

## Error boundaries

A component's failures accumulate on its `E` channel. Wrap a subtree in a `Boundary.*` variant to intercept them and render a fallback instead of failing the mount:

```typescript
import { Boundary, h } from "@weftui/core";
import { Data, Effect } from "effect";

class ApiError extends Data.TaggedError("ApiError")<{ status: number }> {}

const SafeWidget = () =>
  Boundary.catch({ fallback: (e) => h.div({ class: "error" }, `Request failed: ${e.status}`) }, [
    Effect.fail(new ApiError({ status: 503 })),
  ]);
```

There are six failure-catch variants, mirroring Effect's own error operators: `catch`, `catchCause`, `catchTag`, `catchTags`, `catchFilter`, `catchIf`. A failure that a boundary does not match re-raises to the **nearest enclosing** boundary. If none catches it, the mount fails.

The conceptual model (and why the boundary's type reflects exactly which failures are handled) is [Boundaries and Suspense](../explanation/boundaries-and-suspense.md).

## Render on the server

The same component tree renders to HTML on the server and **hydrates in place** on the client: no re-render, no flash. The server produces markup (plus inline data). `hydrate` adopts that existing DOM and resumes reactivity:

```typescript
// server entry
import { renderToStringHydratable } from "@weftui/dom/server";
import { Effect } from "effect";
import { App } from "./app";

export const render = () => Effect.runPromise(renderToStringHydratable(App()));
```

```typescript
// client entry
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App } from "./app";

const app = WeftApp.make();
void Effect.runPromise(WeftApp.hydrate(app, App(), document.getElementById("root")!));
```

The same side-effect-free `App` is imported by both entries.

For server-resolved data that replays into the client without a second request, `Boundary.rpc` extends this model:

1. Resolve an rpc on the server.
2. Serialize its result into the HTML.
3. Replay it on hydrate.
4. Keep the region live for refetch.

## You're done

You have built up every core idea: components and `h`, reactive state and streams, services and async, boundaries and SSR. Where to go next depends on what you are doing:

- **Understand the model** → [The Rendering Model](../explanation/rendering-model.md), [The Combinator API](../explanation/combinator-api.md), [Reactive Primitives](../explanation/reactive-primitives.md)
- **Get a task done** → [Author Components](../how-to/author-components.md), [Render on the Server](../how-to/render-on-the-server.md), [Load Data with RPC](../how-to/load-data-with-rpc.md), [Add Routing](../how-to/add-routing.md)
- **Look up an API** → [`@weftui/core`](../reference/core.md), [`@weftui/dom`](../reference/dom.md), [`@weftui/router`](../reference/router.md)
- **Read runnable code** → [examples/](../../examples/)
