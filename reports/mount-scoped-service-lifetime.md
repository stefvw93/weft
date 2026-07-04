# Report: `mount` outlives the scope of services provided around it

**Severity:** High (correctness footgun) — the obvious integration pattern compiles,
runs, and breaks at runtime, invisibly (see companion report
`reports/silent-stream-failure-swallowing.md`).
**Component:** `@weftui/dom` client renderer (`mount`/`hydrate`,
`packages/dom/src/client/render.ts:1827`, `render.ts:1960` for `hydrate`)
**Discovered:** 2026-07-04, while building `examples/effect-atom` (PR #120).

## Summary

`mount` captures the ambient Effect context and wraps it in a per-mount
`ManagedRuntime` that serves the app for its **entire lifetime** — every stream
subscription and event-handler Effect runs on it until `unmount`:

```ts
// render.ts:1834–1837
const effectContext = yield * Effect.context<never>();
const runtime = ManagedRuntime.make(Layer.succeedContext(effectContext));
```

But the `mount` _effect_ completes as soon as the initial tree is rendered and the
`MountHandle` is returned. Any **scoped layer** provided the documented way —

```ts
Effect.runPromise(mount(App(), root).pipe(Effect.provide(SomeScopedLayer)));
```

— has its scope closed (and finalizers run) the moment that `runPromise` settles.
The app keeps running against services that have already been torn down.

`Layer.succeed`-style value layers are unaffected, which is why every current
`examples/*` app works: they provide plain values (`AnalyticsLive`) or nothing at all.
The failure only appears with `Layer.scoped` / `Layer.effect`-with-finalizer layers —
i.e. exactly the layers real integrations use (connection pools, registries, sockets).

## Concrete failure

effect-atom's canonical layer is scoped:

```ts
// @effect-atom/atom Registry.ts
export const layerOptions = (options?) => Layer.scoped(AtomRegistry, ...); // finalizer: registry.dispose()
export const layer = layerOptions();
```

Providing it directly around `mount` disposes the registry immediately after mount
resolves. Every `Atom.toStream` subscription then dies with the defect
`Cannot access Atom {...}: registry is disposed`, and because stream failures are
swallowed without a Boundary (companion report), the symptom is: **all reactive
regions render empty, zero console output**.

Timing makes it worse: the subscriptions are forked during render, so whether a
subscription sees the live registry for its first emission before the finalizer runs
is a race between the forked fibers and `runPromise` settling. The bug can present as
"nothing renders", "first value renders then never updates", or intermittently pass a
fast test.

## Reproduction

```ts
import { Atom, Registry } from "@effect-atom/atom";
import { h } from "@weftui/core";
import { mount } from "@weftui/dom/client";
import { Effect } from "effect";

const count = Atom.make(0);
const App = h.div([Atom.toStream(count)]);

await Effect.runPromise(
  mount(App, document.getElementById("root")!).pipe(Effect.provide(Registry.layer)),
);
// Registry disposed here. Region renders empty; no error surfaces.
```

Working pattern (used by `examples/effect-atom/main.ts`): provide the service as a
plain value so nothing is scoped to the mount effect:

```ts
const registry = Registry.make();
await Effect.runPromise(
  mount(App, root).pipe(Effect.provideService(Registry.AtomRegistry, registry)),
);
```

## Why this is Weft's problem, not the user's

Effect's scoping semantics are working as designed: `Effect.provide` ties a scoped
layer's lifetime to the effect it wraps. The mismatch is that **`mount` is not
honest about its lifetime**: it returns "done" while holding the captured context for
open-ended background use. There is no scope the provider could reasonably attach to,
and no variant of `mount` that expresses "keep my requirements alive until unmount".
Every Effect-native library that ships a scoped layer will steer users into this trap
via its own documentation.

## Recommendation

1. **Add a scope-aware mount** (preferred, additive — no breaking change):

   ```ts
   // Requires Scope; unmount is registered as a finalizer of that scope.
   export const mountScoped: (
     app: Renderable,
     root: HTMLElement,
   ) => Effect.Effect<MountHandle, MountError, Scope.Scope>;
   ```

   Usage: `mountScoped(App(), root).pipe(Effect.provide(Registry.layer), Effect.scoped)`
   inside a long-lived program, or via `ManagedRuntime` — the layer's scope now closes
   at unmount, not at mount. `hydrate` gets the same variant.

2. **Document the rule** in the mount/hydrate JSDoc and in
   `docs/` (how-to on providing services): _services provided around `mount` must
   outlive the app; provide plain values (`Effect.provideService`,
   `Layer.succeed`) or keep the providing scope open; never `Effect.provide` a scoped
   layer directly around `mount`'s `runPromise`._

3. Optional hardening: `mount` could `Effect.serviceOption(Scope.Scope)` and, when an
   ambient scope exists, register `unmount` on it automatically — making
   `Effect.scoped`-wrapped programs safe by default with the existing API.

## Acceptance criteria

- A scoped layer (e.g. effect-atom `Registry.layer`) provided to the scope-aware mount
  stays alive until unmount; its finalizer runs on unmount, verified by a browser test.
- Existing `mount`/`hydrate` signatures and behavior are unchanged.
- Docs and JSDoc state the lifetime rule and show the value-service workaround for the
  plain `mount`.
