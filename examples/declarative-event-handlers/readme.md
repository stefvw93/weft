# Declarative DOM Event Handlers

## Overview

This example demonstrates how to use event handlers in Weft. Handlers follow the same reactive pattern as other props: they can be static callbacks, Effect-returning, or Stream-based.

## Problem

Traditional event handlers are limited to plain callbacks. When building Effect-based applications, you often want handlers to:

- Run Effects (async operations, logging, etc.)
- Access services provided at mount time
- Change dynamically based on application state

## Solution

Weft event handlers support three patterns:

```typescript
import { h } from "@weftui/core";
import { Effect, Stream } from "effect";

// 1. Plain callback (sync)
h.button({ onclick: () => console.log("clicked") }, "Click");

// 2. Effect-returning callback (async, with services)
h.button(
  {
    onclick: () =>
      Effect.gen(function* () {
        const analytics = yield* Analytics;
        yield* analytics.track("click");
      }),
  },
  "Tracked Click",
);

// 3. Reactive handler (changes over time)
const handlerStream = Stream.make(handlerA, handlerB);
h.button({ onclick: handlerStream }, "Reactive Handler");
```

## How It Works

1. Event props (starting with `on` + lowercase letter) are detected during rendering
2. Static handlers are attached directly via `addEventListener`
3. Effect-returning handlers are detected at runtime and run via `runFork`
4. Stream/Effect-wrapped handlers are subscribed to, updating the listener on each emission
5. Services provided to `WeftApp.make(layer)` are accessible in handlers

## Benefits

- **Unified patterns**: Handlers follow the same `Source` pattern as other props
- **Service access**: Use dependency injection in event handlers
- **Error resilience**: Effect errors are logged, UI stays responsive
- **Reactive**: Handlers can change dynamically via Streams
- **Type-safe**: Full TypeScript support for event types

## Usage Patterns

### Plain Callback

```typescript
h.button(
  {
    onclick: () => {
      count++;
    },
  },
  "Click",
);
```

### Effect Handler

```typescript
h.button({ onclick: () => Effect.log("clicked") }, "Log");
```

### Handler with Services

```typescript
h.button(
  {
    onclick: () =>
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.save({ action: "click" });
      }),
  },
  "Save",
);

// At app creation:
const app = WeftApp.make(DatabaseLive);
Effect.runPromise(WeftApp.mount(app, App(), root));
```

### Conditional Handler

```typescript
h.button({ onclick: isEnabled ? handler : null }, isEnabled ? "Click" : "Disabled");
```

### Reactive Handler

```typescript
const handlerStream = Stream.make(handlerA, handlerB);
h.button({ onclick: handlerStream }, "Click (handler changes)");
```

## When to Use

- When handlers need to perform async operations
- When handlers need access to app-wide services
- When handler behavior should change based on state
- When you want consistent Effect patterns throughout your app
