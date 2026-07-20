# @weftui/dom

> The DOM renderer for [Weft](https://weftui.dev): mount and hydrate in the browser, render to string or stream on the server.

Takes a [`@weftui/core`](https://weftui.dev/docs/reference/core) node tree and renders it to real DOM on the client or to HTML on the server. There is no virtual DOM and no diffing: streams patch the tree in place. The same tree renders to HTML with `renderToStringHydratable` and `hydrate()`s flash-free on the client.

Two entry points: `@weftui/dom/client` for the browser, `@weftui/dom/server` for Node.

## Installation

```bash
npm install @weftui/core @weftui/dom effect@beta
```

Weft tracks Effect 4's beta line. This release is built and tested against `effect@4.0.0-beta.98`; the peer range accepts newer 4.0 betas, which may contain upstream breaking changes.

`effect` is a peer dependency; `@weftui/core` is required to author the tree.

## Key exports

### `@weftui/dom/client`

| Export                             | What it does                                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WeftApp.make(layer?)`             | Creates an app: one lazily-built `ManagedRuntime` (the layer), one root `Scope`, one error hub. Synchronous: the layer builds on first mount.                                            |
| `WeftApp.mount(app, node, root)`   | Renders a node into `root` as a new root of `app`, starting all streams. Returns `Effect<RootHandle, …>` with `R = never`, so it runs via bare `Effect.runPromise`.                      |
| `WeftApp.hydrate(app, node, root)` | Adopts server-rendered DOM **in place** as a new root of `app` and resumes reactivity: the flash-free path.                                                                              |
| `WeftApp.errors(app)`              | `Stream` of errors that escaped every user-level handler (stream failures, outermost-boundary escapes, event-handler failures/defects). Subscribing suppresses the default log fallback. |
| `WeftApp.dispose(app)`             | Tears down every root, then releases the app layer, then shuts the error hub down. Idempotent.                                                                                           |
| `RootHandle`                       | Returned by `mount`/`hydrate`. `unmount()` closes that root's scope only; other roots and the app runtime are untouched. Idempotent.                                                     |

### `@weftui/dom/server`

| Export                           | What it does                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `renderToString`                 | Renders a node to a complete HTML string (static, non-hydrated).                |
| `renderToStringHydratable`       | Same, plus the hydration markers `hydrate` needs. Pair with `hydrate`.          |
| `renderToStream` / `…Hydratable` | Streaming variants: emit HTML chunks as the tree resolves, for progressive SSR. |
| `renderToHydratableShell`        | Produces the document scaffold for servers that assemble the shell separately.  |

### `@weftui/dom` (package root)

| Export             | What it does                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Props.merge(...)` | Merges prop bags left to right: handlers chain, `class` concatenates, `style` merges per property, `ref` fans out, everything else is last-wins. Pure, and `h.*` takes the result. |
| `Props.cx(...)`    | Builds a class string from strings, falsy values, nested arrays, and `{ className: condition }` records. Conditions may be reactive.                                               |

`Props.merge` lets a shared behavior and the element's owner both contribute
props without either silently dropping the other. See
[Compose Behavior and Markup](../../docs/how-to/compose-behavior-and-markup.md).

The package root also re-exports the renderer error types: `HydrationMismatchError`, `UnsupportedNodeTypeError`, `RenderError`, `StreamSubscriptionError`.

## Example

```typescript
import { h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect, SubscriptionRef } from "effect";

const Counter = () =>
  Effect.gen(function* () {
    const count = yield* SubscriptionRef.make(0);
    return yield* h.button({ onclick: () => SubscriptionRef.update(count, (n) => n + 1) }, [
      SubscriptionRef.changes(count),
    ]);
  });

const app = WeftApp.make();
void Effect.runPromise(WeftApp.mount(app, Counter(), document.getElementById("root")!));
```

## Documentation

- Full docs: **https://weftui.dev**
- `@weftui/dom` API reference: **https://weftui.dev/docs/reference/dom**
- Server-side rendering guide: **https://weftui.dev/docs/how-to/render-on-the-server**
- Bundled with this package: see the [`./docs`](./docs) directory in `node_modules/@weftui/dom/docs`. The complete tutorial, how-to, explanation, and reference tree ships on disk for offline and agent use.

## License

MIT © Stef van Wijchen
