---
title: Handle Forms
order: 8
section: how-to
description: Build a controlled form with SubscriptionRef field state, reactive Schema validation, and an Effect-returning submit handler.
---

# Handle Forms

**Goal:** a controlled form whose inputs drive `SubscriptionRef` state, whose errors update reactively as the user types, and whose submit runs an Effect.

Each field is a `SubscriptionRef`. Bind it with `oninput`, derive validation from its `SubscriptionRef.changes(ref)` stream, and return an `Effect` from `onsubmit` (after `preventDefault`).

```typescript
import { h } from "@weftui/core";
import { Effect, Result, Schema, Stream, SubscriptionRef } from "effect";

const Email = Schema.String.pipe(
  Schema.check(Schema.makeFilter((s) => (s.includes("@") ? undefined : "Must contain @"))),
  Schema.check(Schema.makeFilter((s) => (s.includes(".") ? undefined : "Must contain a domain"))),
);

const LoginForm = () =>
  Effect.gen(function* () {
    const email = yield* SubscriptionRef.make("");
    const status = yield* SubscriptionRef.make<string | null>(null);

    // Validation is a stream derived from the field: it re-runs as the user types.
    const error = Stream.map(SubscriptionRef.changes(email), (value) => {
      if (value.length === 0) return null; // don't nag an empty field
      return Result.match(Schema.decodeUnknownResult(Email)(value), {
        onFailure: (e) => e.message.split(":").pop()?.trim() ?? "Invalid",
        onSuccess: () => null,
      });
    });

    return yield* h.form(
      {
        onsubmit: (e) => {
          e.preventDefault();
          return Effect.gen(function* () {
            yield* SubscriptionRef.set(status, "Submitting…");
            yield* Effect.sleep("1500 millis");
            yield* SubscriptionRef.set(status, "Login successful!");
          });
        },
      },
      [
        h.input({
          type: "email",
          oninput: (e) => SubscriptionRef.set(email, (e.target as HTMLInputElement).value),
        }),
        Stream.map(error, (err) => (err ? h.span({ class: "error-text" }, err) : null)),
        h.button({ type: "submit" }, "Login"),
        h.div([Stream.map(SubscriptionRef.changes(status), (s) => (s ? h.span(s) : null))]),
      ],
    );
  });
```

## How it works

- **Field state** is a `SubscriptionRef.make("")`; `oninput` writes the current value with `SubscriptionRef.set`. Because the input is driven by the ref, it is a controlled input.
- **Validation is reactive**, not on-blur or on-submit only: `Stream.map(SubscriptionRef.changes(email), …)` produces an error string (or `null`) on every keystroke. Use [`Schema`](https://effect.website/docs/schema/introduction) to decode: `Schema.decodeUnknownResult(schema)(value)` returns a `Result`, and `Result.match` turns it into UI. A node or `null` in a child slot renders the error or nothing.
- **Submit returns an Effect.** `onsubmit` calls `e.preventDefault()` and then **returns** an `Effect` (it is not `yield*`-ed inline). The renderer runs it in a detached fiber, so it can `SubscriptionRef.set`, `Effect.sleep`, read fields with `SubscriptionRef.get`, or call a service.

## Variations

- **Cross-field rules** (e.g. "passwords match") combine two fields with `Stream.zipLatestWith` before mapping to an error.
- **Read a field imperatively** inside the submit handler with `yield* SubscriptionRef.get(field)` rather than threading it through.

## See also

- [Reactive Primitives](../explanation/reactive-primitives.md): `SubscriptionRef.changes` and stream-shaped children
- [Author Components](./author-components.md): Effect-returning and service-aware handlers
- [examples/form-handling](../../examples/form-handling): a runnable multi-field form with Schema validation and an async submit
