# Boundary.rpc — Hydrate Replay Specification

## Overview

`Boundary.rpc` is constructed with `Boundary.rpc(rpc, payload, render, options?)`
(in `@weftui/core`) and recognised by the DOM client renderer via its
`SERVER_BOUNDARY` symbol type tag. This spec covers the **client `hydrate`
replay** half of the renderer contract stated in
`packages/core/src/boundary/boundary-rpc.specs.md` (core AC-12). The server emit
half is spec'd in `packages/dom/src/server/server-boundary-ssr.specs.md`; the
client-first mount half (no SSR payload) is spec'd in `client/boundary.specs.md`.

When the `hydrate` adopt-walk reaches a `SERVER_BOUNDARY` descriptor, the cursor
is positioned on the inline `<script type="application/json">…</script>` payload
the hydratable server renderer emitted at the region cursor (followed by the
`render(data)` HTML). The client renderer:

1. **Does not call the rpc.** It replays the server result — never re-fetches.
2. Reads the payload's text content, `JSON.parse` → `Schema.decode(successSchema)`
   → `data`.
3. **Seeds a live `Resource<A>`** with `data`: a `SubscriptionRef` holding the
   decoded value, exposed as `resource.value` (await-first, emits the seed first),
   plus `refetch`/`pending`/`error`. `refetch` reads the ambient `AppRpcClientTag`
   and calls `call(tag, payload())` (over the network client), taking the
   already-decoded success and `SubscriptionRef.set`ting `value`.
4. Hydrates `render(resource)` against the adopted DOM starting at
   `script.nextSibling`, wiring event handlers and reactive subscriptions in
   place (node identity preserved, no re-render). `resource.value` renders through
   the renderer's existing reactive-child path; its first emission is the seeded
   `data`, so the adopt-walk matches the server DOM (no fallback flash).
5. Removes the payload script (it is consumed only by hydration) and returns the
   cursor following `render(resource)`, so the surrounding adopt-walk stays aligned.
   The region stays **live** afterwards — a later `refetch` patches it in place.

Region location is **positional**: the payload sits at the region cursor and is
read inline during the same depth-first walk the renderer already relies on — no
service, no markers, no entrypoint plumbing.

### Scope

Success replay is owned here (`hydrateServerBoundary`). A payload that is
missing, malformed, or fails `successSchema` decoding is treated as a
**recoverable** hydration mismatch (`HydrationMismatchError`, logged) — not a
defect — since the region cannot be located or replayed without the data.

**Typed-failure replay is owned by the enclosing failure `Boundary`, not here.**
On a resolved rpc failure the server renders the failure boundary's _fallback_ (a
tree independent of this boundary's `render(data)`), so a children-vs-fallback walk
diverges structurally _before_ reaching this server boundary — its hydrate is
unreachable on a failure. The failure boundary therefore detects the
`data-weft-boundary-failure` payload, decodes via this boundary's `errorSchema`
(located by pre-order index), rebuilds the cause, and hydrates the fallback. See
`client/boundary.specs.md`. The only obligation here is **defensive** (AC-H-S7):
the success path must reject a failure-marked payload rather than mis-decode it.

### AC-H-S7: Success path rejects a failure payload (defensive)

- **Given** the cursor at a `<script type="application/json" data-weft-boundary-failure>`
  (a failure payload that somehow reached the server-boundary success descent)
- **When** `hydrateServerBoundary` runs
- **Then** it fails with a `HydrationMismatchError` rather than decoding the
  failure payload as success `data`.

---

## Acceptance Criteria

### AC-H-S1: Replay decodes the inline payload + seeds a live resource (core AC-12, AC-8)

- **Given** server HTML containing a `Boundary.rpc` region (payload script +
  `render(resource)` HTML)
- **When** `hydrate` reaches the region
- **Then** it `JSON.parse` → `Schema.decode(successSchema)`s the payload to `data`,
  seeds a live `Resource<A>` (`value` emitting `data` first), and hydrates
  `render(resource)` against the adopted DOM, preserving node identity (the
  server-rendered nodes are adopted in place, not re-created). No fallback flash:
  the seeded `value`'s first emission equals the server `data`.

### AC-H-S8: Refetch patches the region in place (core AC-8, AC-14)

- **Given** a hydrated `Boundary.rpc` region and an `AppRpcClientTag` in context
  (the network client `@weftui/router` provides)
- **When** `resource.refetch` runs
- **Then** it calls `AppRpcClient.call(tag, payload())` (POST `/_eui/rpc`), takes
  the already-decoded success, and `SubscriptionRef.set`s `value` — so `render`'s
  subtree patches in place (no remount). `pending` is `true` during the call and
  `false` after. The rpc is **not** re-resolved on hydrate; only `refetch` calls it.

### AC-H-S9: Refetch failure is stale-on-error

- **Given** a hydrated region whose refetch `call` fails (network/rpc error)
- **When** `resource.refetch` runs
- **Then** the previous `value` is retained (subtree unchanged), `error` becomes
  `Some(cause)`, `pending` returns to `false`, and the failure is **not** raised
  into an enclosing failure `Boundary` (no fallback flash). A subsequent successful
  refetch clears `error` to `None`.

### AC-H-S2: the rpc is never called on the client during hydrate

- **Given** a `Boundary.rpc` whose handler reads a server-only service
- **When** the region is hydrated
- **Then** `AppRpcClient.call` is **not** invoked during hydrate — the serialized
  result is replayed. (The handler is server-only and never reaches the client; a
  server-only tag leaked through `render` is rejected at the type level — AC-H-S6.)

### AC-H-S3: Post-hydrate interactivity

- **Given** a `render(data)` subtree containing an event handler / reactive prop
- **When** the region is hydrated
- **Then** the handler/subscription is wired against the adopted DOM and fires
  after hydration.

### AC-H-S4: Cursor alignment (core AC-14)

- **Given** a `Boundary.rpc` followed by sibling nodes, and nested
  `Boundary.rpc` regions
- **When** hydrated
- **Then** the cursor is stepped past the payload script and the full
  `render(data)` output, so following siblings and nested boundaries hydrate
  positionally, and every payload script is consumed (removed from the DOM).

### AC-H-S5: Payload divergence is a recoverable mismatch

- **Given** a region whose cursor is **not** the expected
  `<script type="application/json">` payload, or whose payload is malformed JSON,
  or whose payload fails `successSchema` decoding
- **When** hydrated
- **Then** `hydrate` fails with a `HydrationMismatchError` (a typed, recoverable
  failure, logged), not a defect.

### AC-H-S6: A leaked server-only Tag is a compile error (core AC-7/AC-9)

- **Given** an app node whose requirement channel `R` retains a server-only
  `ServerTag` (e.g. referenced in client `render` code)
- **When** passed to `hydrate`
- **Then** it is a compile error: `hydrate`'s return type degrades to the
  `ServerOnlyLeak` sentinel via `AssertNoServerOnly<R>`. Clean nodes (including
  plain client requirements and raw `Renderable` inputs) hydrate normally. Pinned
  by `src/client/__type-tests__/hydrate.tst.ts`.
