# Async Data Loading

## Overview

This example demonstrates how to build components that fetch data asynchronously using Effect, with built-in loading states and error handling.

## Problem

Async data loading typically requires managing loading states, error states, and the actual data. Traditional approaches use state hooks with complex conditional rendering.

## Solution

Weft components can return `Effect` or `Stream` directly, making async patterns first-class:

```typescript
import { h } from "@weftui/core";
import { Effect, Stream } from "effect";

// Loading → Data pattern with Stream.concat
const AsyncComponent = () =>
  Stream.concat(
    Stream.make(h.span("Loading...")),
    Stream.fromEffect(
      fetchData().pipe(
        Effect.flatMap((data) => h.div(data.value)),
        Effect.catch((err) => h.div({ class: "error" }, err.message)),
      ),
    ),
  );

// Direct Effect-returning component
const DelayedComponent = () =>
  Effect.gen(function* () {
    const data = yield* fetchData();
    return yield* h.div(data.value);
  });
```

## How It Works

1. Components return `Effect<Node>` or `Stream<Node>`; both are rendered reactively
2. `Stream.concat` sequences multiple outputs (loading → data)
3. `Stream.fromEffect` converts an Effect to a single-element Stream
4. `Effect.catch` converts errors to fallback nodes
5. Multiple async components render in parallel by default

## Benefits

- **Declarative loading states**: No manual state management
- **Built-in error handling**: Effect's error channel for failures
- **Parallel by default**: Multiple components load concurrently
- **Type-safe errors**: Errors are tracked in the type system
- **Composable**: Combine loading patterns with other stream operations

## Usage Patterns

### Basic Loading Pattern

```typescript
const LoadingData = () =>
  Stream.concat(
    Stream.make(h.span("Loading...")),
    Stream.fromEffect(fetchData().pipe(Effect.flatMap((data) => h.div(data.value)))),
  );
```

### With Error Handling

```typescript
const SafeData = () =>
  Stream.concat(
    Stream.make(h.span("Loading...")),
    Stream.fromEffect(
      fetchData().pipe(
        Effect.flatMap((data) => h.div({ class: "success" }, data.value)),
        Effect.catch((error) => h.div({ class: "error" }, error.message)),
      ),
    ),
  );
```

### Direct Effect Component

```typescript
const UserProfile = ({ id }: { id: number }) =>
  Effect.gen(function* () {
    const user = yield* fetchUser(id);
    return yield* h.div(user.name);
  });
```

### Sequential Loading Steps

```typescript
const MultiStep = () =>
  Stream.make(h.span("Step 1...")).pipe(
    Stream.concat(Stream.fromEffect(step1().pipe(Effect.flatMap(() => h.span("Step 2..."))))),
    Stream.concat(Stream.fromEffect(step2().pipe(Effect.flatMap(() => h.span("Done!"))))),
  );
```

## When to Use

- API data fetching with loading indicators
- Multi-step processes with progress display
- Components that need initialization time
- Any async operation that should show intermediate states
- Error boundaries for async failures
