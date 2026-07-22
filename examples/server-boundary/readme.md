# Server Boundary: `Boundary.rpc` client-first mount

## Overview

`Boundary.rpc` is Weft's boundary for **server-resolved, client-refreshable** data. It
backs one rpc across four lifecycles (SSR, hydrate-replay, refetch, and **client-first
mount**), all resolved through the ambient `AppRpcClientTag` seam. This example isolates
the **client-first mount** path (the one that runs when you navigate into a boundary with
no SSR payload to replay) in a small, router-less client app.

## Problem

The full `Boundary.rpc` story usually arrives with `@weftui/router`, which provides the
`AppRpcClientTag` seam (a network client in the browser, an in-process client on the
server). That makes it hard to see the boundary's own behaviour without the routing and
SSR machinery around it.

## Solution

`AppRpcClientTag` is a plain `Context.Service` key exported from `@weftui/core`, so a
router-less client app can **provide the seam directly**. Here `AppRpcClientLive` is an
in-process `AppRpcClient` whose `call` returns a product after a short delay. Mounting the
boundary under that layer exercises the client-first mount end to end.

## How it works

1. `App()` is a single `Boundary.rpc(GetProduct, () => ({ id: 1 }), render, { fallback })`.
2. On mount, the boundary renders its **`fallback`** immediately, then **forks** the rpc
   `call`.
3. When the call resolves, it **swaps in** `render(resource)` in an atomic DOM swap; the
   fallback is removed.
4. The region stays **live**: `render` receives a reactive `Resource`, so
   `Subscribable.changes(resource.value)` drives the display,
   `Subscribable.changes(resource.pending)` shows a refreshing indicator, and the
   **Refresh** button runs `resource.refetch` to re-run the call and patch the subtree in
   place (the in-process client increments a `restocks` counter so you can see fresh data
   arrive).

The seam is provided as **the app's layer** (`WeftApp.make(AppRpcClientLive)`), not inside
`App`: services come exclusively from the app layer, so this is the only place that reaches
the boundary's forked rpc call. An `Effect.provide` wrapped around the mount call would not
reach it. `app.ts` stays side-effect-free and exports `App` + `AppRpcClientLive`; `main.ts`
is the thin entry.

## When to use

Reach for `Boundary.rpc` when data must be resolved on the server (behind a server-only
service, credential, or private network) and rendered into the initial HTML, then remain
**refreshable** on the client. This example shows only the client-first slice; for the
full model (the contract/handler split, router wiring, the four lifecycles, and
typed-failure replay), see the [Load Data with RPC how-to](../../docs/how-to/load-data-with-rpc.md)
and [examples/router-ssr](../router-ssr).

## Run

```bash
vp dev            # from this directory
vp run test:browser   # from the repo root, runs app.browser.test.ts
```
