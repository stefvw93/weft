# effect-atom (Built-in Atom State Management)

## Overview

This example demonstrates driving a Weft UI from Effect 4's built-in atom state management module, `effect/unstable/reactivity` — the upstreamed successor of [effect-atom](https://github.com/tim-smart/effect-atom) (`AsyncResult` is the former effect-atom `Result`). It shows a writable atom, a derived atom, and an async atom rendered through its `AsyncResult` states.

## Problem

Applications often need a state library with more structure than a bare `SubscriptionRef` — derived/computed atoms, async atoms with loading and refresh semantics, and a registry that can be shared, tested, or torn down independently of the UI. Reaching for such a library usually means writing an adapter layer to bridge its subscription model into the UI's reactivity model.

## Solution

`effect/unstable/reactivity` needs no adapter here because both Weft and the module speak Effect. `Atom.toStream` turns an atom into a `Stream`, which Weft already consumes natively as a child or prop; `Atom.update` and `Atom.refresh` return Effects, which Weft event handlers already run on the mount runtime.

```typescript
import { h } from "@weftui/core";
import { Effect, Stream } from "effect";
import { Atom, AsyncResult } from "effect/unstable/reactivity";

const countAtom = Atom.make(0);
const doubleAtom = Atom.map(countAtom, (n) => n * 2);

const Counter = () =>
  h.div([
    h.p(["Count: ", h.strong([Atom.toStream(countAtom)])]),
    h.p(["Doubled: ", h.span([Atom.toStream(doubleAtom)])]),
    h.button({ onclick: () => Atom.update(countAtom, (n) => n + 1) }, "+"),
  ]);
```

`effect/unstable/reactivity` lives under Effect's `unstable` namespace: it ships with `effect@beta`, but its API may still change before it stabilizes.

## How It Works

1. `Atom.make(initial)` creates a writable atom; `Atom.map(atom, fn)` derives a read-only atom that recomputes whenever its source changes. State lives in the `AtomRegistry`, not the component — atoms are defined at module scope.
2. `Atom.toStream(atom)` subscribes with `immediate: true` and returns a `Stream<A, never, AtomRegistry>` that emits the current value right away, then every subsequent change. Passed directly into `h.*` as a child or prop, Weft renders it like any other stream.
3. `Atom.update(atom, fn)` and `Atom.refresh(atom)` return Effects requiring `AtomRegistry`. An `onclick` handler that returns one of these Effects is run on the app runtime, which carries whatever layer was given to `WeftApp.make` — no manual `Effect.runPromise` inside the handler.
4. Async atoms wrap an Effect (e.g. `Atom.make(Effect.gen(...))`) and expose their state as an `AsyncResult`. `AsyncResult.match` maps `onInitial` / `onFailure` / `onSuccess` to renderable values; the `waiting` flag on a `Success` result distinguishes an already-loaded value from one currently being refreshed via `Atom.refresh`, so the UI can show "Reloading…" instead of flashing back to a loading state.

**Scoped layers just work.** Atom subscriptions are fibers forked for the lifetime of the app, not the lifetime of any one mount call. `AtomRegistry.layer` is a scope-backed `Layer.effect` — its registry is disposed when the layer's scope closes. Under `WeftApp` that scope is the app's own: the layer builds lazily on the first mount and releases only at `WeftApp.dispose(app)`, not when any individual mount's render effect resolves. So `main.ts` just does:

```typescript
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { AtomRegistry } from "effect/unstable/reactivity";
import { App } from "./app";

const app = WeftApp.make(AtomRegistry.layer);
void Effect.runPromise(WeftApp.mount(app, App(), document.getElementById("root")!));
```

No `mountScoped`, no `Effect.never`, no manual `ManagedRuntime` composition — the registry outlives every mount because the app owns it. The co-located `app.browser.test.ts` tears it down deterministically per test: each test calls a `mountApp()` helper that does `app = WeftApp.make(AtomRegistry.layer); await Effect.runPromise(WeftApp.mount(app, App(), container))`, and `afterEach` calls `await Effect.runPromise(WeftApp.dispose(app))` — closing the root scope (unmount) and then releasing `AtomRegistry.layer`, isolating atom state between test cases with no `Deferred`/fiber-interrupt dance.

See [Provide Services](../../docs/how-to/provide-services.md) for this pattern as a general recipe, and [Services and Context](../../docs/explanation/services-and-context.md) for why scoped layers no longer need special handling under `WeftApp`.

## When to Use

- You want derived/computed state (`Atom.map`) beyond what a single `SubscriptionRef` conveniently expresses.
- You want async state with built-in loading/success/failure/refresh semantics (`AsyncResult`, `Atom.refresh`) rather than modeling that by hand over a `Stream`.
- You need a registry that can be swapped, scoped per-test, or shared across multiple mounted trees independently of any single component's lifetime.
- You're migrating from effect-atom (`@effect-atom/atom`) and want the equivalent built into Effect 4 — the shape is the same, minus the external dependency, with `Result` renamed to `AsyncResult`.
