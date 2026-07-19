# hydrate — Specification

## Overview

`hydrate` continues, on the client, the DOM that was produced on the server by
`renderToStringHydratable`/`renderToStreamHydratable`. Where `mount`
(`api.ts`) clears the root and rebuilds the tree from scratch, `hydrate`
**adopts** the existing server DOM: it walks the JSX tree in lockstep with the
already-present DOM nodes, attaches event handlers and reactive subscriptions in
place, and only creates DOM where a reactive region later re-renders.

It is the client counterpart of the hydratable server renderer and shares
`mount`'s lifecycle _(amended by weft-app.specs.md)_: the owning `WeftApp`'s
shared runtime, a per-root `Scope` that owns all forked subscriptions, and a
`RootHandle` for teardown.

## Design

### Region locating (Hybrid)

Static structure is matched **positionally** by walking the JSX tree against the
DOM. Reactive (`Stream`/`Effect`) regions — which on the server collapse to a
last emission that may be 0, 1, or many nodes — are delimited by comment markers
the hydratable server renderer emits: `<!-- stream-start-N -->` …
`<!-- stream-end-N -->` (the same vocabulary the client renderer already uses,
see `markers.ts`). The hydrator pairs markers positionally with a depth stack;
the numeric id is for debugging/validation only and need not match the client's
counter.

This mirrors React (`<!--$-->…<!--/$-->` around Suspense), Vue
(`<!--[-->…<!--]-->` around fragments), and Solid (insert anchors): walk static
structure, mark only the variable-length spots.

### Reactive replay (hydrate first, patch rest)

A reactive region's **first** emission was server-rendered, so the hydrator
**hydrates it in place** against the adopted content between the markers — reusing
the same adopt-walk used for static structure (attaching event handlers and
subscribing nested regions without re-creating nodes). Because the server (`§2`)
collapses the region to its _first_ emission and the client does too, the adopted
DOM is exactly the snapshot: when they match, nothing is mutated, node identity is
preserved, and there is **no flash**. Only the **subsequent** emissions are
client-rendered and patch the region via the shared `updateStreamChild` flow.

If the first emission diverges from the adopted DOM (a structural mismatch, or a
walk that doesn't consume the whole region), the hydrator falls back to patching
the region via `updateStreamChild` and logs a `console.error`. A divergent
reactive value is recoverable (the region is dynamic), unlike a static-structure
mismatch which hard-fails (AC-H8).

Because the first emission is hydrated in place, nested reactive regions inside it
also hydrate in place and become live immediately — there is no wait for an
enclosing re-render.

### Text-node disambiguation

Adjacent text/number children serialize to a single coalesced DOM text node
(no separators in the server output). The hydrator splits such a node with
`Text.splitText` by the JSX string's `.length`, adopting the head and leaving
the tail for the next sibling. Because the DOM text node holds the _unescaped_
value, length-based splitting is exact even where `escapeHtml` changed the byte
length. No extra server bytes are required.

### State serialization (not needed)

No `__EFFECT_UI_STATE__` JSON snapshot, Effect `Schema`, or `SubscriptionRef`
registry is required: the adopted server DOM **is** the snapshot, and since both
sides collapse a reactive node to its first/current emission (`§2`), the client's
first emission matches it for deterministic streams and for `SubscriptionRef`s
constructed with the same initial value on both sides. The first emission is then
hydrated in place rather than restored from a serialized blob.

**Known limitation:** on a divergent first emission, any nested subscriptions
forked during the partial in-place walk before the mismatch may briefly linger
until the fallback patch supersedes them; they are cleaned up at unmount.

### Out of scope (follow-ups)

- **Suspense / late-reveal** streaming hydration.

## Acceptance criteria

- **AC-H1:** `hydrate(app, root)` does **not** clear `root`. DOM nodes present
  before the call (static elements/text) retain their identity after hydration
  (verified by node-identity / expando sentinel).
- **AC-H2:** The static element/text/attribute output of
  `renderToStringHydratable(app)` hydrates against `app` without raising
  `HydrationMismatchError`.
- **AC-H3:** Event handlers — absent from server HTML — are attached during
  hydration and fire afterward. Effect-returning handlers run on the captured
  app runtime and can access services from the app layer
  (parity with `mount`).
- **AC-H4:** A reactive child is adopted from inside its `stream-start`/
  `stream-end` markers; a subsequent stream emission patches only the nodes
  between those markers, leaving sibling content untouched.
- **AC-H5:** Reactive attributes and style properties re-subscribe during
  hydration; the next emission updates the live element.
- **AC-H6:** Two adjacent text children that share one coalesced DOM text node
  hydrate correctly via length-based `splitText`.
- **AC-H7:** An empty reactive region (last emission renders nothing) is
  represented by an adjacent `stream-start`/`stream-end` marker pair and
  hydrates to an empty adopted slot, with subscription still established.
- **AC-H8:** A structural mismatch between the JSX tree and the DOM (e.g.
  expected text but found an element, mismatched tag name, or a missing reactive
  marker) fails the effect with `HydrationMismatchError` carrying expected/actual
  context.
- **AC-H9:** The returned `RootHandle.unmount()` (_amended_) interrupts all reactive
  subscriptions and disposes the runtime, and is idempotent (parity with
  `mount`, `dom.specs.md` AC-26/AC-27).
- **AC-H10:** Server marker output — `renderToStringHydratable(node)` equals
  `renderToString(node)` except that each reactive (`Stream`/`Effect`) region is
  wrapped in `<!-- stream-start-N -->` … `<!-- stream-end-N -->`. For a node with
  no reactive regions, the two outputs are identical.
- **AC-H11:** Flash-free resume — when a reactive region's first emission matches
  the adopted server DOM, that DOM node's identity is preserved across the first
  emission (it is hydrated in place, not re-rendered; verified by node-identity /
  expando sentinel). _Note:_ the only success-path DOM mutation hydrate performs
  is inserting invisible failure-boundary comment markers around each adopted
  boundary extent (AC-H13); adopted element/text identity is still preserved.
- **AC-H12:** Graceful divergence — when a reactive region's first emission does
  not match the adopted DOM, the region is patched to the correct value (the effect
  does **not** fail with `HydrationMismatchError`) and a `console.error` is emitted.
- **AC-H13:** Failure-boundary live machinery — hydrating a failure `Boundary`'s
  success path installs the same live machinery `mount`'s `renderBoundary` has:
  a `BoundaryContext` (error deferred) is provided to the children walk, the
  adopted extent is bracketed with invisible `boundary-start`/`boundary-end`
  comment markers, and a recovery fiber awaits the deferred. A live failure
  reported after hydration swaps the extent to `props.match`'s fallback,
  closing the boundary's subtree scope first; a `match` returning `null`
  propagates to the parent boundary, and with no parent the cause is logged
  (parity with mount propagation, `boundary.specs.md` AC15). Construction-time
  `HydrateError`s are **not** routed through `props.match` — static mismatches
  keep hard-failing per AC-H8. If the adopted extent is empty or its parent
  cannot be determined, the recovery install is skipped and logged.
- **AC-H14:** Substituted-suspense failure replay — when the cursor at a
  `Boundary.suspend` is a **retained** `suspense-start` marker (the server's
  failure-replay patch, `streaming-shell.specs.md` AC-FH7), hydrate reads the
  `data-weft-suspense-failure` sentinel script inside the region, replays the
  parsed `error` payload as a `Cause.fail` to the nearest `BoundaryContext`,
  consumes the whole region (cursor resumes after the end marker) without
  hydrating or mutating its static DOM, and never raises a
  `HydrationMismatchError` for it. The boundary's recovery then swaps the
  boundary extent to the fallback (e.g. the router's notFound page). The
  replayed value is the raw Schema-encoded object matched structurally by
  `_tag` — a generic `Boundary.catch` receives that object, not a class
  instance. With **no** enclosing `BoundaryContext`, the failure is logged via
  `console.error` and the substituted static DOM is left standing. A sentinel
  that fails to parse is logged and the region skipped (static DOM stands) —
  never a hard hydrate failure. A suspense boundary whose markers were removed
  by the standard patch keeps today's transparent walk.
- **AC-H15:** Reactive-region failure routing — a reactive region whose stream
  fails (at or after the first emission) reports its failure cause to the
  nearest `BoundaryContext` (parity with mount's `handleStreamChild`); with no
  boundary the failure exit is left unobserved so the Effect runtime reports it
  (`"Fiber terminated with an unhandled error"`) at `LogLevel.Error`, annotated
  with a `weft.region` log annotation identifying the hydrated region (e.g.
  `hydrate:stream-<id> (<path>)`, `hydrate:list-<id> (<path>)`);
  interruption-only causes stay silent. This covers post-hydrate live
  failures such as a page raising `RouterNotFound` after client-side
  navigation on a hydrated app.
