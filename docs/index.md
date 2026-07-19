# Weft Documentation

**Reactive UI, woven from Effect.**

Weft is an Effect-native reactive DOM library, in the browser and on the server. `Node<E, R>` is `Effect.Effect<ElementDescriptor, E, R>`: every element is an Effect. Error and requirement channels accumulate through the tree, all Effect combinators apply to nodes directly, and services flow from mount through the whole app.

Streams drive every update; there is no virtual DOM. The same tree renders to HTML on the server and `hydrate()`s in place on the client, flash-free. No JSX.

The docs follow the [Diátaxis](https://diataxis.fr) model. Pick your entry point by what you are trying to do:

## Start here

**[→ Tutorial](tutorial/01-your-first-app.md)**: a four-step guided path from a static component to a server-rendered, error-handled app. Start here if you are new to Weft:

1. [Your First App](tutorial/01-your-first-app.md): `h` and `WeftApp`
2. [Reactivity](tutorial/02-reactivity.md): `SubscriptionRef` and streams
3. [Services and Async](tutorial/03-services-and-async.md): handlers, services, async loading
4. [Errors and Server Rendering](tutorial/04-errors-and-server.md): boundaries and SSR

## The four quadrants

|                                                   |                                                                                                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Tutorial](tutorial/01-your-first-app.md)**     | Learning-oriented. One guided path, start to finish.                                                                                                                               |
| **[How-to guides](how-to/author-components.md)**  | Task-oriented. Author components, render on the server, load data with rpc, add routing. Plus recipes for forms, async data, keyed lists, reactive styles, refs, and lazy routing. |
| **[Explanation](explanation/rendering-model.md)** | Understanding-oriented. The rendering model, the combinator API, reactive primitives, boundaries, and services & context.                                                          |
| **[Reference](reference/core.md)**                | Information-oriented. Full API: [`@weftui/core`](reference/core.md), [`@weftui/dom`](reference/dom.md), [`@weftui/router`](reference/router.md).                                   |

New to the model itself? Read [The Rendering Model](explanation/rendering-model.md): why there is no virtual DOM, and what "streams are the weft" means.

## Packages

Three published packages make up Weft's public API, plus one build-time plugin:

- **`@weftui/core`**: element builders (`h`), components, sources/streams, and boundaries. Start here.
- **`@weftui/dom`**: the renderer, with `./client` (`WeftApp.mount`/`WeftApp.hydrate`) and `./server` (`renderToString*`) entry points.
- **`@weftui/router`**: universal nested routing, `Router.lazy`, and the rpc seam.
- **`@weftui/vite`**: a build-time Vite plugin (tooling, not a runtime API).

`@weftui/base` is an internal, currently-empty stub with no public primitives. Ignore it.

## Examples

The [`examples/`](../examples/) directory contains standalone runnable apps. Each covers a specific pattern and ships with a browser test:

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
