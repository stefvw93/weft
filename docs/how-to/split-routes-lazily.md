---
title: Split Routes Lazily
order: 6
section: how-to
description: Code-split a route's component into its own chunk with Router.lazy, keeping the descriptor eager so matching, href, and SSR stay unchanged.
---

# Split Routes Lazily

**Goal:** keep a heavy page's render code (and its dependencies) out of the initial bundle, loading it only when its route is actually rendered.

Wrap the route's `component` in [`Router.lazy`](../reference/router.md#routerlazy). The route **descriptor** (its segment and param schemas) stays eager, so the matcher, `href`, and the server's dispatch API still see it statically. Only the component body is split into its own chunk.

```typescript
import { Router } from "@weftui/router";
import { Schema } from "effect";

Router.route("docs/:category/:slug", {
  path: { category: Schema.String, slug: Schema.String },
  component: Router.lazy(() => import("./doc-page").then((m) => m.DocPage)),
});
```

The chunk loads on the server during render and on the client on navigation. Only the **matched branch's** chunks are ever fetched.

`E`/`R` are preserved: a lazy route has the exact same channels as the same component declared eagerly. An unmet service requirement is still a compile error at `Router.router(...)`.

## Make the split real

`Router.lazy` only splits if the dynamic `import()` is the **only eager path** to the heavy module. Keep the `Router.route(…)` descriptor in an eagerly-imported file. Move the component implementation (and its heavy deps) into a separate module referenced _only_ through `Router.lazy(() => import("./impl"))`:

```typescript
// routes.ts: eager and tiny, just the descriptor
export const docsRoute = Router.route("docs/:category/:slug", {
  path: { category: Schema.String, slug: Schema.String },
  component: Router.lazy(() => import("./doc-page-impl").then((m) => m.DocsPage)),
});

// doc-page-impl.ts: heavy, pulled into its own chunk, never in the initial graph
export const DocsPage = Component.gen(function* () {
  /* renderHast, code highlighting, … */
});
```

A descriptor file that still `import`s the impl statically gains nothing: the bundler keeps it in the initial graph.

## What you get for free

- **Flash-free hydration.** On a directly-loaded lazy route, the client re-invokes the same slot, awaits the chunk, and adopts the server DOM in place. The first production matches, so nothing is mutated.
- **Blank-free navigation.** Client navigation is **deferred-commit**: the router resolves the target branch's chunk **and the matched leaf's own component effect** _before_ committing the URL. The previous page stays mounted through the fetch and any data the leaf awaits, and the swap is a single tick. See [Show Navigation Progress](./show-navigation-progress.md) for the `Router.navigating` signal this exposes.
- **Synchronous revisits.** `Router.lazy` memoizes its load per slot, so a second visit to a loaded route commits immediately.

## Edge cases

- **Lazy layouts.** A `Router.layout({ component: Router.lazy(...) })` splits too. Each lazy node in the matched branch is awaited; nodes outside it never load.
- **Chunk-load failure is a defect.** If the `import()` rejects (offline, or a stale client requesting a chunk a new deploy removed), it dies as a defect and surfaces through normal defect handling. It never hangs or silently 404s. The rejection is memoized, so the route keeps failing until a reload (the deploy-skew case).
- **Not a lazy _subtree_.** Only the component is lazy. You cannot defer a whole `RouteNode` behind an `import()`; the matcher needs every leaf's segment and param schema before anything loads.

## See also

- [`Router.lazy` API reference](../reference/router.md#routerlazy)
- [Show Navigation Progress](./show-navigation-progress.md): the deferred-commit `Router.navigating` signal
- [Add Routing](./add-routing.md): authoring the route tree `Router.lazy` plugs into
- [examples/router-ssr](../../examples/router-ssr): includes a `Router.lazy` page (`lazy-page.ts`) with a browser test
