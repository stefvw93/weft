---
title: Server-Side Rendering
order: 2
section: how-to
description: renderToString / renderToStringHydratable / streaming variants, hydrate, and the server/client split.
---

# Server-Side Rendering

Weft renders on the server and **hydrates** on the client. The server produces HTML plus inline data, and the browser adopts that existing DOM in place rather than re-creating it.

[`Boundary.rpc`](../reference/core.md#boundaryrpc) extends this to **rpc-backed server data**: resolve an rpc on the server, serialize its result into the HTML, and replay it on the client without a second request. The region then stays live for refetch.

## The two halves

- **Server**: `@weftui/dom/server` renders an app node to an HTML string (or stream). The _hydratable_ variants also emit the inline data each reactive region and `Boundary.rpc` needs to resume on the client.
- **Client**: `@weftui/dom/client`'s `WeftApp.hydrate` walks the server DOM, adopts it, wires up reactivity and event handlers, and resumes from the inline data. It does **not** re-render from scratch.

```typescript
// server entry
import { renderToStringHydratable } from "@weftui/dom/server";
import { Effect } from "effect";
import { App } from "./app";

export const render = (): Promise<string> => Effect.runPromise(renderToStringHydratable(App()));
```

```typescript
// client entry
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App } from "./app";

const root = document.getElementById("root")!;
const app = WeftApp.make();
void Effect.runPromise(WeftApp.hydrate(app, App(), root));
```

Both entries import the same side-effect-free `App`. Splice the server HTML into your template's outlet, ship it, and let the client entry hydrate it.

`@weftui/dom/server` exports four renderers:

|                                        | String                     | Stream                     |
| -------------------------------------- | -------------------------- | -------------------------- |
| **Plain** (no JS / no hydration)       | `renderToString`           | `renderToStream`           |
| **Hydratable** (emits inline payloads) | `renderToStringHydratable` | `renderToStreamHydratable` |

Use a hydratable renderer whenever the client will call `hydrate`. The plain renderers produce complete, JS-free HTML with no payload scripts.

## Loading server data with `Boundary.rpc`

`Boundary.rpc` resolves an rpc **on the server**, serializes the result into the same HTML this page produces, and replays it on the client during `hydrate`. There is no second request and no fallback flash, and the region stays live for `refetch`.

It follows the same server/client split: the rpc **contract** (pure Schema) is shared, while its **handler** lives in a server-only Layer the client never imports.

```typescript
import { Boundary, h, Subscribable } from "@weftui/core";
import { Stream } from "effect";
import { GetStock } from "./data/inventory";

const StockPanel = (productId: number) =>
  Boundary.rpc(
    GetStock,
    () => ({ id: productId }), // a fresh typed payload per call (SSR / refetch / mount)
    (resource) =>
      h.p([
        "in stock: ",
        h.span([Stream.map(Subscribable.changes(resource.value), (stock) => String(stock.units))]),
        h.button({ type: "button", onclick: () => resource.refetch }, "Refresh"),
      ]),
    { fallback: h.p("loading stock…") }, // shown only on a client-first SPA mount
  );
```

Under SSR the server resolves the rpc in-process, `successSchema`-encodes the result inline as `<script type="application/json">`, and renders in place; `hydrate` reads that payload positionally, seeds the `Resource`, and adopts the DOM **without re-calling the rpc** (replay, never retry). The full model lives in one place, the [RPC Data Boundaries guide](./load-data-with-rpc.md): the contract/handler split, router wiring, the four lifecycles, the `Resource` handle, and typed-failure replay. This page does not repeat it.

> **Note.** `Boundary.rpc` resolves through the ambient [`AppRpcClientTag`](../reference/core.md#apprpcclienttag) seam, which `@weftui/router` provides on both sides. In a router-less mount there is no seam, so the boundary resolves to a descriptive "needs router/rpc" error (not a defect).

## When to use

- **`Boundary.rpc`**: data that must be resolved on the server (behind a server-only service, credential, or private network) and rendered into the initial HTML, then **refreshable** on the client (refetch / client-first SPA mount) over the same rpc.
- **`Boundary.suspend`**: async data that loads on the client (or streams the shell then fills); see the [Boundary API](../reference/core.md#boundarysuspend).

## See also

- [rpc data boundaries guide](./load-data-with-rpc.md): the full `Boundary.rpc` walkthrough, covering the contract/handler split, router wiring, the four lifecycles, and typed-failure replay
- [Routing](./add-routing.md): `@weftui/router` builds on this SSR + hydration model for full-page nested routing
- [`Boundary.rpc` API reference](../reference/core.md#boundaryrpc)
- [`ServerTag` API reference](../reference/core.md#servertag)
- [examples/router-ssr](../../examples/router-ssr): a runnable shop with an SSR-replayed, refetchable live-stock `Boundary.rpc`
- [examples/ssr-hydration](../../examples/ssr-hydration): SSR + hydration without server data loading
