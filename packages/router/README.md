# @weftui/router

> Universal nested router for [Weft](https://weftui.dev): one route tree, rendered on the server and the client, with type-safe params and `href`s.

Maps a URL to a nested page tree that renders identically on the server (`@weftui/router/server`) and the client (`@weftui/router/client`). Route params and query are decoded through [Effect Schema](https://effect.website/docs/schema/introduction/), `href` builds type-safe URLs that round-trip with the matcher, layouts persist across navigations, and `Router.lazy` code-splits a branch while keeping its descriptor eager.

Three entry points mirror `@weftui/dom`: `@weftui/router` (authoring + universal nodes), `@weftui/router/client` (History-backed runtime), `@weftui/router/server` (SSR dispatch).

## Installation

```bash
npm install @weftui/core @weftui/dom @weftui/router effect@beta
```

Weft tracks Effect 4's beta line. This release is built and tested against `effect@4.0.0-beta.98`; the peer range accepts newer 4.0 betas, which may contain upstream breaking changes.

`effect` is a peer dependency; `@weftui/core` and `@weftui/dom` provide the tree and renderer.

## Key exports

| Export                           | What it does                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `Router.route` / `Router.layout` | Author a leaf page (with `:param` segments + schemas) or a UI-only nesting layout.      |
| `Router.router`                  | Seals a route tree into a `RouterDef` and captures the app-level not-found page.        |
| `Router.lazy`                    | Code-splits a route's component into its own chunk; only the matched branch loads.      |
| `Router.params` / `Router.query` | Read the live match (snapshot); `…Stream` variants for reactive query-in-place updates. |
| `Router.navigating`              | Reactive `Idle`/`Navigating` signal for pending UI during deferred-commit navigation.   |
| `href(ref, args)`                | Builds a type-safe URL for a leaf route reference.                                      |
| `RouterApp` / `RouterOutlet`     | The universal router root node: render on both server and client.                       |
| `RouterLive` (client)            | History-backed `Router` layer; also provides the `AppRpcClientTag` seam.                |
| `RouterServer` (server)          | `RouterServer.render` / `RouterServer.toWebHandler` for SSR dispatch.                   |

Client-side navigation to a different path resets the window scroll to the top at commit; query-only navigations and browser back/forward preserve it (the latter via the browser's native `history.scrollRestoration`).

## Example

```typescript
import { h } from "@weftui/core";
import { Router, href } from "@weftui/router";
import { Schema } from "effect";

const userRoute = Router.route("users/:id", {
  path: { id: Schema.NumberFromString },
  component: ({ path }) => h.div(`User ${path.id}`),
});

const App = Router.router(userRoute, { notFound: () => h.div("Not found") });

href(userRoute, { path: { id: 42 } }); // "/users/42"
```

## Documentation

- Full docs: **https://weftui.dev**
- `@weftui/router` API reference: **https://weftui.dev/docs/reference/router**
- Routing guide: **https://weftui.dev/docs/how-to/add-routing**
- Bundled with this package: see the [`./docs`](./docs) directory in `node_modules/@weftui/router/docs`. The complete tutorial, how-to, explanation, and reference tree ships on disk for offline and agent use.

## License

MIT © Stef van Wijchen
