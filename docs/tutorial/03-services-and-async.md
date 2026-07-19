---
title: Services and Async
order: 3
section: tutorial
description: Give handlers access to services from the environment, and render async loading states by returning a Stream of nodes.
---

# Services and Async

[So far](./02-reactivity.md) our state has been self-contained. Real apps talk to services and wait on async work. Both fall out of the same fact (a `Node` is an `Effect`), so both use plain Effect.

## Handlers that use services

An event handler can **return an Effect**. That Effect runs in the app's environment, so it can read any service the app's layer provides:

```typescript
import { h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Context, Effect, Layer } from "effect";

class Logger extends Context.Service<Logger, { log: (message: string) => Effect.Effect<void> }>()(
  "Logger",
) {}

const LoggerLive = Layer.succeed(Logger, {
  log: (message) => Effect.sync(() => console.log(message)),
});

const LogButton = () =>
  h.button(
    {
      onclick: () =>
        Effect.gen(function* () {
          const logger = yield* Logger;
          yield* logger.log("Button clicked");
        }),
    },
    "Log",
  );

// Give the app the layer: every handler in every root can now read Logger.
const app = WeftApp.make(LoggerLive);
void Effect.runPromise(WeftApp.mount(app, LogButton(), document.getElementById("root")!));
```

`Logger` entered the tree's requirement channel the moment `LogButton` read it. You discharged it **once**, by passing `LoggerLive` to `WeftApp.make`. Provide too little and it is a compile error. The type of `app` (and so of `WeftApp.mount(app, LogButton(), …)`) names exactly which service is missing.

Services come exclusively from the app's layer: an `Effect.provide` wrapped around the `mount` call does **not** reach components or handlers. This is Weft's entire dependency-injection story; it is just Effect's. The deeper treatment is [Services and Context](../explanation/services-and-context.md).

## Async loading states

A component can return a **`Stream<Node>`** to show different content over time. Sequence a loading placeholder before the resolved content with `Stream.concat`:

```typescript
import { h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect, Stream } from "effect";

const AsyncGreeting = ({ name }: { name: string }) =>
  Stream.concat(
    Stream.make(h.span("Loading…")),
    Stream.fromEffect(
      Effect.gen(function* () {
        yield* Effect.sleep("1 second");
        return yield* h.span(`Hello, ${name}!`);
      }),
    ),
  );

const app = WeftApp.make();
void Effect.runPromise(
  WeftApp.mount(app, AsyncGreeting({ name: "World" }), document.getElementById("root")!),
);
```

The stream emits the loading node first, then the resolved node. The renderer swaps the DOM in place on the second emission.

This is the raw mechanism. To coordinate _several_ async regions with a single fallback, reach for [`Boundary.suspend`](../explanation/boundaries-and-suspense.md), which you will meet in the next step.

## Next

- [Errors and Server Rendering →](./04-errors-and-server.md): catch failures with boundaries and render on the server
