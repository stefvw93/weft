# error-boundary

A live demo of all six `Boundary.*` variants in `@weftui/dom`: catching, routing, and re-raising rendering-path errors.

## Overview

`Boundary.*` wraps a subtree and intercepts errors that occur during rendering:

- **Construction-time failures**: an Effect child that fails before producing a node
- **Post-mount stream failures**: a `Stream` child that fails after it has already emitted content

Event handler errors are explicitly **not** caught. They run in detached fibers outside the render path.

## How to run

```bash
vp run -F error-boundary dev
```

Then open <http://localhost:5173> (or the port shown in the terminal).

## What each section shows

| Section | Variant           | What triggers it                                             |
| ------- | ----------------- | ------------------------------------------------------------ |
| 1       | `catch`           | `NetworkError` after 800 ms                                  |
| 2       | `catchTag`        | `AuthError`, only this tag is caught                         |
| 3       | `catchTags`       | Two children, two tags, two handlers                         |
| 4       | `catchFilter`     | 503 caught; non-503 would re-raise to outer                  |
| 5       | `catchIf`         | 5xx predicate; 4xx would re-raise                            |
| 6       | Nested            | Inner catches `AuthError`; `NetworkError` re-raises to outer |
| 7       | Post-mount stream | Stream shows live data for 2 s, then fails → DOM swap        |
| 8       | `catchCause`      | Component throws synchronously → defect caught               |
| 9       | Remount           | Toggle off/on to see boundary reset each mount               |

## Usage

### catch (simplest form)

```typescript
import { Boundary, h } from "@weftui/core";
import { Data, Effect } from "effect";

class ApiError extends Data.TaggedError("ApiError")<{ status: number }> {}

const SafeWidget = () =>
  Boundary.catch({ fallback: (e) => h.div({ class: "error" }, `Error ${e.status}`) }, [
    Effect.fail(new ApiError({ status: 503 })),
  ]);
```

### catchTag (handle one specific error type)

```typescript
Boundary.catchTag(
  {
    tag: "AuthError",
    fallback: (e) => h.div(`Please log in: ${e.reason}`),
  },
  [ProtectedComponent()],
);
```

### catchTags (multiple handlers)

```typescript
Boundary.catchTags(
  {
    NetworkError: (e) => h.div(`${e.status} ${e.url}`),
    AuthError: (e) => h.div(`Auth: ${e.reason}`),
  },
  [ChildComponent()],
);
```

### catchFilter (conditional catch)

`catchFilter` takes a `Filter` and a `fallback` as **positional** arguments (no wrapping props object). A `Result.succeed` recovers via `fallback`, a `Result.fail` re-raises:

```typescript
import { Filter, Result } from "effect";

Boundary.catchFilter(
  Filter.make((e: NetworkError) => (e.status === 503 ? Result.succeed(e) : Result.fail(e))),
  (e) => h.div("Service unavailable"), // only reached for a 503
  [ChildComponent()],
);
```

### catchIf (predicate-gated)

```typescript
Boundary.catchIf(
  {
    predicate: (e) => e.status >= 500, // only server errors
    fallback: (e) => h.div("Server error"),
  },
  [ChildComponent()],
);
```

### catchCause (defects and interruptions)

```typescript
Boundary.catchCause(
  {
    fallback: (cause) => h.div(`Unexpected: ${String(cause)}`),
  },
  [ComponentThatMayThrow()],
);
```

### Nested boundaries

```typescript
// Inner catches AuthError; NetworkError re-raises to outer
Boundary.catch({ fallback: (e) => h.div({ class: "outer-error" }, `Outer: ${e._tag}`) }, [
  Boundary.catchTag({ tag: "AuthError", fallback: (e) => h.div(`Auth: ${e.reason}`) }, [
    ComponentWithMixedErrors(),
  ]),
]);
```

## How it works

Every `Boundary.*` variant returns a plain descriptor `{ type: BOUNDARY, props: { match, children } }`. The renderer (`@weftui/dom`) detects it and:

1. **At construction time**: renders children in a forked subtree scope. If the render fails, `match(cause)` is called immediately. If it returns a node, the fallback is rendered instead; if it returns `null`, the cause propagates up.

2. **Post-mount**: a `BoundaryContext` service is provided to the subtree. Stream fibers that fail route their error to `BoundaryContext`, which fires a recovery fiber. The recovery fiber calls `match(cause)`, closes the subtree scope, removes the existing DOM between the boundary's comment markers, and inserts the fallback in its place.

3. **Re-raise**: when `match` returns `null`, the cause is forwarded to the nearest parent boundary via its `BoundaryContext`. If there is no parent, the mount fails.

### SSR

On the server, `renderBoundarySSR` renders children to HTML. On error, it calls `match`. If a fallback node is returned, its HTML is emitted inline with no markers. If `match` returns `null`, the stream fails.
