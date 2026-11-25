---
title: Provide Services
order: 12
section: how-to
description: "Provide plain and scoped Layers to a WeftApp: app layers for the common case, scoped layers that just work, memoMap sharing, and binding an app's lifetime to a scope."
---

# Provide Services

**Goal:** provide a `Layer` to a `WeftApp` so its components can read services with `yield* Service`.

## Recipe 1: app layers

Pass the layer to `WeftApp.make`: the common case, and it needs nothing else. The layer builds lazily on first mount; every component, event handler, and stream subscription in every root mounted from `app` can read it.

```typescript
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App } from "./app";
import { ThemeServiceLive } from "./theme-service";

const root = document.getElementById("root")!;

const app = WeftApp.make(ThemeServiceLive);
void Effect.runPromise(WeftApp.mount(app, App(), root));
```

A component reads the service the same way anywhere else in Effect: `yield* Service`.

```typescript
import { h } from "@weftui/core";
import { Effect } from "effect";
import { ThemeService } from "./theme-service";

export const App = () =>
  Effect.gen(function* () {
    const theme = yield* ThemeService;
    return yield* h.div({ class: `app app--${theme.mode}` }, [h.p(`Theme: ${theme.mode}`)]);
  });
```

## Recipe 2: scoped layers just work

A **scoped** layer (`Layer.effect` backed by `acquireRelease`, or anything else that owns a subscription, listener, or registry) needs nothing different from Recipe 1. The app owns one lazy `ManagedRuntime`. The layer builds on first mount and releases only at `WeftApp.dispose(app)`, not when any individual mount's render effect resolves.

There is no `mountScoped`, no `Effect.never`, no manual scope threading.

`AtomRegistry.layer` (from `effect/reactivity`) is a real scoped layer. Its atom subscriptions are fibers forked for the app's whole lifetime:

```typescript
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { AtomRegistry } from "effect/reactivity";
import { App } from "./app";

const app = WeftApp.make(AtomRegistry.layer);
void Effect.runPromise(WeftApp.mount(app, App(), document.getElementById("root")!));
```

`RouterLive` (from `@weftui/router/client`) is another. It owns the `popstate` listener and the same-origin link-click interceptor for as long as the app runs:

```typescript
const app = WeftApp.make(RouterLive(App, { rpc: { group: StockRpcs } }));
void Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), root));
```

Both examples are runnable in full at [examples/effect-atom](../../examples/effect-atom) and [examples/router-ssr](../../examples/router-ssr).

## Recipe 3: sharing layer memoization with `memoMap`

`WeftApp.make(layer, { memoMap })` accepts an explicit `Layer.MemoMap`, so multiple `WeftApp` instances can share layer construction. For example, build one app per test case while reusing an expensive shared dependency's memoized build across them:

```typescript
import { WeftApp } from "@weftui/dom/client";
import { Layer } from "effect";

const memoMap = Layer.makeMemoMap();

const appA = WeftApp.make(SharedLive, { memoMap });
const appB = WeftApp.make(SharedLive, { memoMap });
```

Most apps have exactly one `WeftApp` and never need this option.

## Recipe 4: binding an app's lifetime to a scope

There is deliberately no `makeScoped`. To tie an app's disposal to a `Scope` you already manage (a framework integration or a test harness that owns one), compose it yourself with `Effect.acquireRelease`:

```typescript
import { Effect } from "effect";
import { WeftApp } from "@weftui/dom/client";
import { AppLive } from "./app-live";

const acquireApp = Effect.acquireRelease(
  Effect.sync(() => WeftApp.make(AppLive)),
  (app) => WeftApp.dispose(app),
);
```

`acquireApp` yields a `WeftApp` and registers `WeftApp.dispose` as a finalizer on whatever scope the surrounding effect runs in. Closing that scope tears the app down the same way `WeftApp.dispose` normally would (roots, then layers, then the error hub).

## Complete example

Recipe 1 end to end: a `ThemeService` defined with `Context.Service`, provided through `WeftApp.make`, and read by `App` with `yield* Service`. This is the whole file set, copy/paste runnable in a `vite` project.

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Provide services demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```typescript
// src/theme-service.ts
/** The active theme, provided app-wide by `ThemeServiceLive`. */
import { Context, Layer } from "effect";

export class ThemeService extends Context.Service<
  ThemeService,
  { readonly mode: "light" | "dark" }
>()("ThemeService") {}

export const ThemeServiceLive = Layer.succeed(ThemeService, { mode: "dark" });
```

```typescript
// src/app.ts
/**
 * Reads `ThemeService` from the app layer and renders the active mode.
 * Side-effect-free (no mount call), so `main.ts` and any test can import `App`.
 */
import { h } from "@weftui/core";
import { Effect } from "effect";
import { ThemeService } from "./theme-service";

export const App = () =>
  Effect.gen(function* () {
    const theme = yield* ThemeService;
    return yield* h.div({ class: `app app--${theme.mode}` }, [
      h.h1("Provide Services demo"),
      h.p(`Theme: ${theme.mode}`),
    ]);
  });
```

```typescript
// src/main.ts
/** Browser entry: mounts `App` with `ThemeServiceLive` provided through the app layer. */
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App } from "./app";
import { ThemeServiceLive } from "./theme-service";

const root = document.getElementById("root")!;

const app = WeftApp.make(ThemeServiceLive);
void Effect.runPromise(WeftApp.mount(app, App(), root));
```

## Anti-pattern: `Effect.provide` around the mount call

```typescript
import { Effect, pipe } from "effect";

// ❌ does nothing useful: WeftApp.mount's R is always `never`, and services
// come exclusively from the app layer: a wrapped Effect.provide never
// reaches components, handlers, or stream subscriptions
Effect.runPromise(pipe(WeftApp.mount(app, App(), root), Effect.provide(SomeLayer)));
```

`WeftApp.mount`/`WeftApp.hydrate` return an effect whose requirement channel is always `never`, so there is no `R` left for `Effect.provide` to discharge. Any service a component needs must be in the layer passed to `WeftApp.make`.

## See also

- [Services and Context](../explanation/services-and-context.md): how `R` accumulates and discharges at `WeftApp.make`, and why scoped layers no longer need special handling
- [`WeftApp` reference](../reference/dom.md): full signatures for `make`, `mount`, `hydrate`, `dispose`
- [examples/effect-atom](../../examples/effect-atom): a real scoped layer (`AtomRegistry.layer`)
- [examples/shared-state-islands](../../examples/shared-state-islands): one app layer shared by reference across multiple mounted roots
