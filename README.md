# Weft

[![CI + Release](https://github.com/stefvw93/weft/actions/workflows/ci-release.yml/badge.svg)](https://github.com/stefvw93/weft/actions/workflows/ci-release.yml)

> Reactive UI, woven from [Effect](https://effect.website).

Frontend at scale is hard. Real applications need robust API orchestration, error handling, retries, and telemetry. [Effect](https://effect.website) solves these problems elegantly, and Weft brings the same patterns to the UI layer, in the browser and on the server.

Weft is a reactive DOM library where every node _is_ an Effect. Components are plain functions that return `Node<E, R>`, a type alias for `Effect.Effect<ElementDescriptor, E, R>`. Error and requirement channels accumulate through the tree, and every Effect combinator applies to nodes directly.

Your component tree is the **warp**, the fixed structure held under tension; streams are the **weft**, the live thread drawn across it. Streams drive all updates, so there is no virtual DOM and no diffing.

The same tree renders to HTML on the server and `hydrate()`s in place on the client, flash-free. No JSX. The full model is explained in [The Rendering Model](./docs/explanation/rendering-model.md).

> **Early Development Notice**: Weft is in active early development. APIs may change rapidly. Not recommended for production use yet.

## Features

- **Effect-first architecture**: Services, Layers, and dependency injection across client and server
- **Combinator API**: Build trees with `h`, `h.fragment`, and `Component.gen` / `Component.make`, with no JSX and no build-tool plugins
- **Type-safe channels**: Effect's `E` and `R` channels propagate through the full component tree
- **Ephemeral components**: Components run once, streams drive all updates
- **Error boundaries**: Six failure-catch `Boundary.*` variants, plus `Boundary.suspend` and the `Boundary.rpc` server-data seam
- **SSR + Hydration**: `renderToString`, `renderToStream`, and flash-free `hydrate()` for full-stack apps
- **Progressive streaming**: `renderToStream` emits HTML chunks in document order as slow nodes resolve
- **Universal routing**: `@weftui/router` maps a URL to a nested page tree on both server and client, with type-safe params and persistent layouts

## Packages

Weft is a monorepo with three packages:

- **`@weftui/core`**: Element builders and combinators. Exports `h` (with `h.fragment`), `Component` (`Component.gen` / `Component.make`), `Boundary` (six failure-catch variants, `Boundary.suspend`, `Boundary.rpc`), `List` (`List.each`), and the `Node<E, R>` / `Source<A, E, R>` types.
- **`@weftui/dom`**: The renderer. `WeftApp.mount` and `WeftApp.hydrate` for the browser (`@weftui/dom/client`); `renderToString`, `renderToStringHydratable`, `renderToStream`, and `renderToStreamHydratable` for the server (`@weftui/dom/server`).
- **`@weftui/router`**: Universal nested router. Authors a route tree with `Router.route` / `Router.layout` / `Router.router`, splits it with `Router.lazy`, and renders it on the server (`@weftui/router/server`) and the client (`@weftui/router/client`), with type-safe `href`s and dependency-injected params.

## Installation

```bash
npm install @weftui/core @weftui/dom @weftui/router effect@beta
```

Weft tracks Effect 4's beta line. This release is built and tested against `effect@4.0.0-beta.98`; the peer range accepts newer 4.0 betas, which may contain upstream breaking changes.

**New to Effect?** Check out the [Effect documentation](https://effect.website/docs/getting-started/introduction) to learn the fundamentals. These docs assume you know them.

## A minimal app

```typescript
import { h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect, SubscriptionRef } from "effect";

const Counter = () =>
  Effect.gen(function* () {
    const count = yield* SubscriptionRef.make(0);

    return yield* h.div([
      h.span([SubscriptionRef.changes(count)]),
      h.button({ onclick: () => SubscriptionRef.update(count, (n) => n + 1) }, "+"),
      h.button({ onclick: () => SubscriptionRef.update(count, (n) => n - 1) }, "-"),
    ]);
  });

const app = WeftApp.make();
void Effect.runPromise(WeftApp.mount(app, Counter(), document.getElementById("root")!));
```

## Documentation

Full documentation lives in [`docs/`](./docs/index.md). Pick your entry point by what you are trying to do:

|                                                          |                                                                                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Tutorial](./docs/tutorial/01-your-first-app.md)**     | Learning-oriented. A four-step guided path: your first app → reactivity → services and async → errors and server rendering.                                           |
| **[How-to guides](./docs/how-to/author-components.md)**  | Task-oriented. Author components, render on the server, load data with rpc, add routing, plus recipes for forms, keyed lists, refs, and more.                         |
| **[Explanation](./docs/explanation/rendering-model.md)** | Understanding-oriented. The rendering model, the combinator API, reactive primitives, boundaries, and services & context.                                             |
| **[Reference](./docs/reference/core.md)**                | Information-oriented. Full API: [`@weftui/core`](./docs/reference/core.md), [`@weftui/dom`](./docs/reference/dom.md), [`@weftui/router`](./docs/reference/router.md). |

New to the model itself? Read [The Rendering Model](./docs/explanation/rendering-model.md): why there is no virtual DOM, and what "streams are the weft" means.

## Examples

The [examples/](./examples) directory contains standalone applications you can run with `vp run -F <name> dev`. Each covers a specific pattern and ships with a browser test:

| Example                      | What it shows                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `async-data-loading`         | Loading states, retry, error boundaries with Stream and Effect                       |
| `declarative-event-handlers` | Plain, Effect-returning, service-aware, and reactive handlers                        |
| `element-ref`                | DOM refs with `SubscriptionRef<Option<HTMLElement>>`                                 |
| `error-boundary`             | All six failure-catch `Boundary.*` variants                                          |
| `form-handling`              | Reactive inputs, Schema validation, Effect submit handlers                           |
| `keyed-list`                 | Keyed list rendering with `List.each`                                                |
| `list-rendering`             | Static and stream-based lists, fragments, nested iterables                           |
| `reactive-styles`            | Per-property and whole-object stream styles, CSS transitions                         |
| `router-ssr`                 | Universal nested routing with SSR, hydration, layouts, `Boundary.rpc`, `Router.lazy` |
| `server-boundary`            | `Boundary.rpc` client-first mount + refetch, router-less                             |
| `ssr-hydration`              | SSR + hydration without server data loading                                          |
| `subscription-ref`           | Local state, derived streams, coordinating multiple refs                             |
| `suspense`                   | Suspense boundaries for streaming SSR and client coordination                        |
| `type-augmentation`          | Typed custom elements on `h` via the `CustomElements` interface                      |

## Development

The root `vite.config.ts` defines tasks you run with `vp run <task>`:

```bash
vp install           # Install all workspace dependencies
vp run dev           # Run dev recursively across workspace packages (vp run -r dev)
vp run pack          # Build all packages
vp run check         # Format, lint, and typecheck (packs first)
vp run test          # Run all node/jsdom tests (packs first)
vp run test:browser  # Run real-browser e2e tests via Playwright (packs first)
```

To work on a single example:

```bash
vp run -F ssr-hydration dev
```

## License

MIT
