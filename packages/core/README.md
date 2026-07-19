# @weftui/core

> Element builders and combinators for [Weft](https://weftui.dev) — reactive UI, woven from [Effect](https://effect.website).

The authoring layer of Weft. Build your component tree with `h`, compose it with `Boundary` and `List`, and let streams drive every update. Every node **is** an Effect: components return `Node<E, R>` (an alias for `Effect.Effect<ElementDescriptor, E, R>`), so error and requirement channels accumulate through the tree and every Effect combinator applies to nodes directly.

This package is renderer-agnostic — pair it with [`@weftui/dom`](https://weftui.dev/docs/reference/dom) to render to the browser and the server.

## Installation

```bash
npm install @weftui/core effect@beta
```

Weft tracks Effect 4's beta line. This release is built and tested against `effect@4.0.0-beta.98`; the peer range accepts newer 4.0 betas, which may contain upstream breaking changes.

`effect` is a peer dependency. To render, add [`@weftui/dom`](https://www.npmjs.com/package/@weftui/dom).

## Key exports

| Export      | What it is                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `h`         | Proxy namespace of element builders — `h.div`, `h.span`, `h.button`, … plus `h.fragment` for wrapper-less groups.                                                             |
| `Component` | `Component.gen` / `Component.make` — reusable components whose reactive prop channels propagate to the call site.                                                             |
| `Boundary`  | Error boundaries (`catch`, `catchTag`, `catchTags`, `catchFilter`, `catchIf`, `catchCause`), plus `Boundary.suspend` (async fallbacks) and `Boundary.rpc` (server-data seam). |
| `List`      | `List.each` — the keyed list combinator; renders once per key and reconciles across emissions.                                                                                |
| `Source`    | The reactive prop vocabulary (`A \| Effect \| Stream \| Subscribable`) + `Source.toSubscribable`.                                                                             |
| `Node<E,R>` | The core tree type — an alias for `Effect.Effect<ElementDescriptor, E, R>`.                                                                                                   |

## Example

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

- Full docs: **https://weftui.dev**
- `@weftui/core` API reference: **https://weftui.dev/docs/reference/core**
- The rendering model (why no virtual DOM): **https://weftui.dev/docs/explanation/rendering-model**
- Bundled with this package: see the [`./docs`](./docs) directory in `node_modules/@weftui/core/docs` — the complete tutorial, how-to, explanation, and reference tree ships on disk for offline and agent use.

**New to Effect?** Read the [Effect docs](https://effect.website/docs/getting-started/introduction) first — Weft assumes the fundamentals.

## License

MIT © Stef van Wijchen
