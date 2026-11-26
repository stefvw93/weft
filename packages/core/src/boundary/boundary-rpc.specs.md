# Boundary.rpc — Core API Spec

## Overview

`Boundary.rpc` is a universal server/client render boundary backed by one `Rpc`
from the application's merged `RpcGroup` (`effect/rpc`). It is a **thin consumer**:
its data source is the ambient {@link AppRpcClientTag} seam, not a co-located
`load`. The rpc **tag** is the boundary's stable identity and the rpc **payload
schema** its typed input — so there is no hand-rolled `id`, no `provide`, no
per-boundary registry, and **no bundler prune**. The handler lives in the
server-only rpc Layer (`group.toLayer(...)`), which the client never imports;
tree-shaking does the client/server split structurally.

This replaces the former `Boundary.server` (co-located `load`/`provide`/`id` +
build-time prune plugin + `GET /_eui/data` registry endpoint). The
`SERVER_BOUNDARY` descriptor tag and the SSR-inline-payload + hydrate-replay
mechanics are retained; only the data source changed.

The boundary returns a plain descriptor `{ type, props }` (tagged with the
{@link SERVER_BOUNDARY} symbol) built via `elementNode`, so the renderer detects
and handles it synchronously via the `{ type, props }` branch without executing
the node (and without calling `payload`/`render`).

This spec covers the **core** surface: the descriptor, the `Boundary.rpc`
signature and its channel algebra, the {@link AppRpcClientTag} seam, and the
`Resource<A>` shape. Renderer behaviour (SSR emit, hydrate replay, client-first
mount) is spec'd alongside the DOM package; this file states the contract those
renderers must honour. The `ServerTag` / `AssertNoServerOnly` brand (guarding
`hydrate` against a server-only tag leaked through `render`) is unchanged from the
prior model and spec'd in `packages/core/src/server`.

### Scope

- **SSR resolve + replay.** On the server the renderer resolves the rpc through an
  in-process {@link AppRpcClientTag} (over the handler Layer), encodes the success
  inline via the rpc's `successSchema`, and renders `render(seededResource)`. On
  `hydrate` the client **replays** the inline payload (decodes via `successSchema`,
  seeds the `Resource`) — never re-calling the rpc.
- **Client refetch.** After hydrate (or a client-first mount) the region is a live
  `Resource<A>`; `refetch` calls the rpc again over the network client and patches
  the subtree in place (stale-on-error).
- **Client-first mount (C1).** SPA-navigating into a boundary with **no** SSR
  payload renders `options.fallback`, forks an `AppRpcClient.call(tag, payload())`,
  and swaps in `render(resource)` once it resolves. (This was out of scope for
  `Boundary.server`; the rpc seam dissolves it — the same client serves SSR-replay,
  refetch, and mount.)
- **Typed-failure replay.** A resolved rpc **error** (encoded via the rpc's
  `errorSchema`) on the hydratable SSR pass is relocated to the nearest enclosing
  failure `Boundary` and replayed on the client — the same `data-weft-boundary-failure`
  mechanism as before. A transport **defect** (no `Cause.failureOption`, or an rpc
  with no `error` schema) is not replayed; it propagates (server fallback, client
  mismatch).
- **Out of scope (this pass):** streamed success (`Rpc.make(..., { stream: true })`)
  and mutations. The `effect/rpc` foundation supports both; deferred to follow-on
  specs.

---

## Acceptance Criteria

### Descriptor

1. `Boundary.rpc(rpc, payload, render, options?)` returns a plain object
   `{ type: SERVER_BOUNDARY, props }` carried on the node via `elementNode` —
   readable through `getElementDescriptor` **without running the node** (and
   therefore without calling `payload` or `render`).
2. `props` carries, derived from the `rpc` instance + arguments:
   - `tag: string` — `rpc._tag`, the rpc identity. It is the stable boundary id
     (replacing the former author-supplied `id`) and the key the client passes to
     {@link AppRpcClientTag.call}.
   - `payloadSchema: Schema.Codec<any, any>` — `rpc.payloadSchema`.
   - `successSchema: Schema.Codec<any, any>` — `rpc.successSchema`, the wire
     contract used for the inline SSR payload and refetch decode.
   - `errorSchema: Schema.Codec<any, any>` — `rpc.errorSchema`, used to encode a
     resolved rpc error for typed-failure replay.
   - `payload: () => Payload` — a **thunk** producing a fresh payload per call
     (SSR, refetch, mount). Not invoked at descriptor-build time.
   - `render: (resource: Resource<Success>) => C` — builds the subtree from a
     reactive `Resource<Success>` (see AC-8), **not** a bare value.
   - `fallback: Renderable | undefined` — `options.fallback`, shown only during a
     client-first mount.
3. The `SERVER_BOUNDARY` symbol is exported from `@weftui/core` for renderers.

### Signature / channel algebra

4. Signature:
   `rpc<R extends Rpc.Any, C extends Node<any, any>>(rpc: R, payload: () => Rpc.Payload<R>, render: (resource: Resource<Rpc.Success<R>>) => C, options?: RpcOptions): Node<Node.Error<C> | Rpc.Error<R>, Node.Context<C>>`.
5. `payload`'s return type is exactly `Rpc.Payload<R>` (the rpc's decoded payload).
   A mismatched thunk return is a compile error.
6. `render` receives `Resource<Rpc.Success<R>>` — the rpc's decoded success wrapped
   in the reactive resource, never the bare value.
7. Output channels:
   - **Error** = `render`'s error union (`Node.Error<C>`) plus `Rpc.Error<R>` (the
     rpc's typed error; `never` for an rpc with no `error` schema).
   - **Requirement** = exactly `render`'s `R` (`Node.Context<C>`) — **untouched**.
     There is no `provide`/`RServer` to discharge (the handler lives in the rpc
     Layer), and **no `Exclude`** is applied: a server-only tag accidentally
     referenced in `render` remains in `R`, where `hydrate`'s `AssertNoServerOnly`
     rejects it.

### `Resource<A>` handed to `render` (AC-8)

8. `render` receives a `Resource<A>` (`A = Rpc.Success<R>`):
   - `value: Subscribable.Subscribable<A>` — current data. On the **server** and on
     the **first client paint after hydrate** it is seeded with the SSR `data`
     (await-first, emits the seed immediately) so SSR HTML and the adopted DOM are
     byte-identical — no fallback flash. A successful refetch pushes the new value.
   - `refetch: Effect.Effect<void>` — calls `AppRpcClient.call(tag, payload())` and
     sets `value` (client only; a no-op on the server / a router-less mount).
   - `pending: Subscribable.Subscribable<boolean>` — `true` while a refetch is in
     flight (`false` on server / before any refetch).
   - `error: Subscribable.Subscribable<Option.Option<unknown>>` — `Some` with the
     last refetch error, else `None`. A failed refetch leaves `value` intact
     (stale-on-error); it does **not** unmount the subtree or raise into an
     enclosing failure `Boundary`.

### `AppRpcClient` seam (AC-9)

9. {@link AppRpcClientTag} is a `Context.Service` holding a **flat, untyped** caller
   `{ call: (tag: string, payload: unknown) => Effect<unknown, unknown> }`. It lets
   `@weftui/dom` resolve a boundary without importing `effect/rpc` or
   `@weftui/router`. `@weftui/router` provides it: a network `RpcClient`
   (POST `/_eui/rpc`) on the browser, an in-process client over the handler Layer
   on the server. `call` returns the **already-decoded** success; the renderer owns
   `successSchema`/`errorSchema` decoding of the inline SSR payload only.

### Renderer contract (honoured by `@weftui/dom` / `@weftui/router`; spec'd there)

10. **SSR (hydratable):** resolve the rpc via the in-process `AppRpcClient`, encode
    the success via `successSchema`, emit `<script type="application/json">…</script>`
    inline at the region cursor (XSS-safe), then render `render(seededResource)`.
11. **SSR (plain):** render `render(seededResource)` only — no payload script.
12. **Hydrate:** do **not** call the rpc. Read the inline payload at the cursor,
    `JSON.parse` → `Schema.decode(successSchema)`, seed a live `Resource`, hydrate
    `render(resource)`, remove the script. Region stays live for refetch.
13. **Client-first mount:** with no SSR payload, render `fallback` between comment
    markers, fork `AppRpcClient.call(tag, payload())`, decode, seed the resource,
    render `render(resource)`, swap in. With **no** `AppRpcClient` in context
    (router-less mount), raise a typed, descriptive error (not a defect).
14. **Refetch:** `Resource.refetch` calls `AppRpcClient.call(tag, payload())` over
    the network client and patches the subtree in place (stale-on-error).
15. **Typed-failure replay:** a resolved rpc error on the hydratable pass is encoded
    via `errorSchema` and relocated to the enclosing failure `Boundary`, emitted as
    `<script type="application/json" data-weft-boundary-failure>{"index":N,"error":…}</script>`
    before the fallback HTML; the client decodes it and replays the same fallback.
    Unchanged in mechanism from the prior model.

### Edge cases

- **Nesting:** a `Boundary.rpc` nested inside another emits its payload positionally
  within its own region; each `hydrate` reads its own payload.
- **Composition with `suspend` / `List.each`:** payloads are read positionally from
  the DOM cursor during the adopt-walk, interleaving with suspense/list markers.
- **Same tag, different payload:** two boundaries (or a refetch) using the same rpc
  tag with different `payload()` values resolve independently — the payload is a
  real typed input, not a per-entity id.
- **Defect / no error schema:** a transport defect, or an rpc with no `error`
  schema where the encode would be `Never`, is not replayed; it propagates (server
  fallback, client mismatch).

---

## API shape

```ts
export const SERVER_BOUNDARY: unique symbol;

interface Resource<A> {
  readonly value: Subscribable.Subscribable<A>;
  readonly refetch: Effect.Effect<void>;
  readonly pending: Subscribable.Subscribable<boolean>;
  readonly error: Subscribable.Subscribable<Option.Option<unknown>>;
}

interface RpcOptions {
  readonly fallback?: Renderable;
}

interface AppRpcClient {
  readonly call: (tag: string, payload: unknown) => Effect.Effect<unknown, unknown>;
}
class AppRpcClientTag extends Context.Service<AppRpcClientTag, AppRpcClient>()(
  "@weftui/core/AppRpcClient",
) {}

Boundary.rpc<R extends Rpc.Any, C extends Node<any, any>>(
  rpc: R,
  payload: () => Rpc.Payload<R>,
  render: (resource: Resource<Rpc.Success<R>>) => C,
  options?: RpcOptions,
): Node<Node.Error<C> | Rpc.Error<R>, Node.Context<C>>;
```

---

## Migration from `Boundary.server`

| `Boundary.server`                    | `Boundary.rpc`                                    |
| ------------------------------------ | ------------------------------------------------- |
| author `id: string`                  | rpc `_tag` (stable identity)                      |
| `load: () => Effect<A, E, RServer>`  | rpc handler in `group.toLayer(...)` (server-only) |
| `provide: Layer<RServer>`            | handler Layer's own `Layer.provide`               |
| `schema` / `failure`                 | rpc `success` / `error` schemas                   |
| nullary `load` (no params)           | typed `payload: () => Rpc.Payload<R>`             |
| module registry + `GET /_eui/data`   | rpc handler Layer + `POST /_eui/rpc`              |
| prune plugin strips `load`/`provide` | tree-shaking (handler never imported by client)   |
| client-first mount **unsupported**   | client-first mount **supported** (C1)             |

## Deferred / roadmap

- **Streamed success** (`Rpc.make(..., { stream: true })`) — stream-the-shell-then-fill,
  natively supported by `effect/rpc`. Needs its own spec.
- **Mutations** (non-GET-style rpcs that change server state) — out of scope this
  pass; the contract/handler split already accommodates them.
