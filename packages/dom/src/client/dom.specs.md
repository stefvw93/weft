# DOM Mount Feature Specification

> **Amended by `weft-app.specs.md` (WeftApp refactor):** the standalone
> `mount`/`hydrate` exports and per-mount runtimes described below were
> replaced by the `WeftApp` API — one shared lazy `ManagedRuntime` per app,
> one root `Scope` per `WeftApp.mount`/`WeftApp.hydrate` call, and an
> app-level unhandled-error hub. AC24 is **reversed**, AC26–AC28 are amended,
> and the AC26/AC27 ambient-scope amendment is **removed** (see the notes at
> each criterion). Rendering behavior (AC2–AC23, AC25) is unchanged.

## Overview

Build a reactive DOM mounting system that renders JSX to HTML elements with support for Effect and Stream-based reactivity. Components are ephemeral - executed once to set up their reactive side effects. Streams and Effects drive updates over time, similar to SolidJS's reactive model.

## Purpose

Enable declarative, reactive UI rendering in the browser by mounting JSX trees to DOM elements, with full support for Effect and Stream primitives for handling asynchronous and time-varying values.

## Acceptance Criteria

### AC1: Mount Function API

- **Given** a Renderable and a root HTMLElement
- **When** `mount(app, root)` is called
- **Then** it returns `Effect.Effect<void>` that:
  - Clears the root element's existing children
  - Renders the JSX tree to DOM nodes
  - Appends rendered nodes to root
  - Completes after initial render (streams run in background)
  - _(Amended)_ Runs against the owning `WeftApp`'s shared runtime — see
    weft-app.specs.md WA2; the historical fresh-runtime-per-mount behavior is
    reversed by WA-AC24 below.

### AC2: Primitive Renderable Rendering

- **Given** primitive Renderable values
- **When** rendering occurs
- **Then**:
  - `string`, `number`, `bigint` → text nodes
  - `boolean`, `null`, `undefined`, `void` → render nothing (skip)

### AC3: Iterable Children

- **Given** Renderable that is an iterable (including nested iterables)
- **When** rendering children
- **Then** recursively flatten all iterables and render each child

### AC4: Element Creation

- **Given** Renderable with `{ type: string, props: object }`
- **When** rendering
- **Then**:
  - Create element using `document.createElement(type)` (HTML only, SVG/MathML later)
  - Browser validates element type (no manual validation)
  - Render order: create → set attrs/props → set up streams → append children → append to parent

### AC5: Function Components

- **Given** Renderable with `{ type: function, props: object }`
- **When** rendering
- **Then**:
  - Call function once with props (ephemeral execution)
  - Function can return: Renderable, Effect<Renderable>, or Stream<Renderable>
  - Effects and Streams normalized to Streams and handled reactively
  - Component doesn't re-execute (no re-rendering)

### AC6: Fragment Handling

- **Given** Renderable with `{ type: FRAGMENT, props: { children } }`
- **When** rendering
- **Then**:
  - Render children without wrapper element
  - At root level: append all children to root element
  - As child: append all fragment children to parent

### AC7: Attribute vs Property Detection

- **Given** element props (excluding `children`)
- **When** setting props on element
- **Then**:
  - Check prototype chain (`prop in element` + walk prototypes) to distinguish properties from attributes
  - `data-*` and `aria-*` always treated as attributes
  - Properties: use `element[prop] = value`
  - Attributes: use `element.setAttribute(prop, value)`
  - Skip `children` prop

### AC8: Boolean Attributes

- **Given** boolean attribute (e.g., `disabled`, `checked`, `readonly`)
- **When** setting attribute
- **Then**:
  - Follow HTML spec for each element type
  - Truthy value: `setAttribute(name, "")`
  - Falsy value: `removeAttribute(name)`

### AC9: Attribute Value Serialization

- **Given** non-string attribute value
- **When** setting attribute
- **Then**:
  - Convert to string using `String(value)`
  - `undefined` values: skip/remove attribute
  - `null` values: not valid, skip/remove

### AC10: Style Attribute - String Form

- **Given** `style` prop as string (e.g., `style="background: blue;"`)
- **When** rendering
- **Then**: use `element.setAttribute("style", value)`

### AC11: Style Attribute - Object Form

- **Given** `style` prop as object (e.g., `style={{ fontSize: "16px", color: "red" }}`)
- **When** rendering
- **Then**:
  - Iterate through object properties
  - Use `element.style.setProperty(key, value)` for each
  - Property names use camelCase (matches CSSStyleDeclaration)

### AC12: Style with Stream Properties

- **Given** `style` object with Stream values (e.g., `style={{ color: Stream.make("red"), fontSize: "16px" }}`)
- **When** rendering
- **Then**:
  - Static properties set once
  - Each Stream property sets up independent subscription
  - Each emission updates only that CSS property

### AC13: Style as Stream

- **Given** `style` prop as `Stream<string>` or `Stream<object>`
- **When** stream emits
- **Then**:
  - If string: replace entire style attribute
  - If object: replace all style properties
  - Handle both cases appropriately

### AC14: Effect/Stream Normalization

- **Given** Effect or Stream values in JSX
- **When** rendering begins
- **Then**:
  - Normalize all Effects to Streams using `Stream.fromEffect`
  - Applies to: attributes, properties, style properties, children, component return values

### AC15: Reactive Attribute/Property Updates

- **Given** attribute or property value as Stream
- **When** stream emits
- **Then**:
  - Each emission updates that specific attribute/property
  - `null` or `undefined` emission removes the attribute/property
  - Use `Stream.runForEach` in forked fiber with Scope
  - Stream runs in background (doesn't block render)

### AC16: Stream Completion

- **Given** a Stream that completes without error
- **When** completion occurs
- **Then**: leave last rendered value in place

### AC17: Stream Errors

- **Given** a Stream that fails
- **When** error occurs
- **Then**:
  - Throw tagged error that bubbles up
  - Log error/warning with context
  - Error types: `StreamSubscriptionError`

### AC18: Children Array with Mixed Streams

- **Given** children array with mix of static and Stream values (e.g., `[Stream.make("a"), "b", Stream.make("c")]`)
- **When** rendering
- **Then**:
  - Each child rendered in order
  - Each Stream child updates its position independently
  - Static children remain static

### AC19: Stream Children - Comment Markers

- **Given** a child that is a Stream
- **When** rendering
- **Then**:
  - Insert start comment marker: `<!-- stream-start-{id} -->`
  - Render placeholder comment initially
  - Insert end comment marker: `<!-- stream-end-{id} -->`
  - Use simple counter for unique IDs
  - Keep internal reference to track nodes

### AC20: Stream Children - Updates (same-type patching)

_(amended by loom.specs.md)_ Emissions no longer apply directly on the pump
fiber. Each reactive region and prop is a latest-value cell in the app's Loom
scheduler; a single flush fiber commits cells in registration order. Emissions
arriving faster than commits drain conflate to the newest value
(latest-value-wins), and `RootHandle.awaitCommit` acknowledges when everything
dirty has committed. The per-commit reconciliation below is unchanged.

- **Given** a Stream child that emits a new value
- **When** emission occurs
- **Then** the region between the start and end comment markers is reconciled against
  the new value's shape (read from its descriptor / primitive type) **before** rendering,
  patching in place when the shape is unchanged rather than tearing down and rebuilding:
  - **SP1 — text→text**: the region holds exactly one `Text` node and the new value is a
    `string`/`number`/`bigint` → update that node's `.data` in place (node identity
    preserved). A bare text value spawns no nested fibers, so the content scope the caller
    rotates around this call is empty and its rotation is a no-op.
  - **SP2 — unchanged text**: the new text equals the current `.data` → no DOM mutation.
  - **SP3 — same-tag element reuse**: the region holds a single `Element` and the new
    value's descriptor has the same string `type` → reuse the element node, re-apply props
    (`setElementProps` re-subscribes reactive props under the fresh content scope the caller
    has already rotated to; the prior emission's prop subscriptions and event listeners were
    torn down when the caller closed the previous scope), then reconcile its children by
    position. A child slot is patched in place only when it maps 1:1 to a single node
    (text→`Text`, same-tag element→`Element`, recursing into SP3); if any child does not
    (count mismatch, kind mismatch, multi-node/reactive child) the element's children are
    rebuilt wholesale, still preserving the element node itself. Re-applying props does not
    remove props absent from the new descriptor (no stale-attribute diffing); same-element
    re-emissions are expected to carry a consistent prop set.
  - **SP4 — fallback (shape change)**: any other case (text↔element, different tag,
    multi-node, fragment/array, boundary) → remove all nodes between the markers
    (iterate from `startComment.nextSibling` until `endComment`), render the new
    Renderable, and insert the resulting nodes before the end marker. New value can be
    an array/fragment (multiple nodes).
- **Scope ownership**: content-scope rotation (close previous → fork fresh) is owned by the
  caller (`handleStreamChild` / `hydrateReactive`), not `updateStreamChild`. It rotates
  unconditionally before each call; SP3/SP4 rely on this for correct teardown of the prior
  emission's subscriptions, and SP1/SP2's rotation is a harmless no-op.
- **Rationale**: SP1/SP3 preserve DOM identity across scalar updates, so focus,
  uncontrolled input values, scroll position, and in-flight CSS transitions survive a
  value change that does not change the region's shape.

### AC21: Nested Streams in Dynamic Children

- **Given** a Stream child that emits Renderable containing Streams
- **When** rendering the emitted Renderable
- **Then**:
  - Recursively set up all nested streams
  - Dynamically rendered content gets full reactive support

### AC22: Component Returning Stream

- **Given** function component that returns `Stream<Renderable>`
- **When** rendering
- **Then**:
  - Normalize to Stream
  - Treat as stream child (updates over time)
  - Wrap in comment markers

### AC23: Tagged Errors

- **Given** various error conditions during rendering
- **When** error occurs
- **Then** throw appropriate tagged error:
  - `InvalidElementType` - Renderable type not string/FRAGMENT/function
  - `StreamSubscriptionError` - stream subscription/execution fails
  - `RenderError` - general rendering failures
  - All errors include useful context for debugging

### AC24: Runtime Management — REVERSED by weft-app.specs.md

- ~~Create fresh `ManagedRuntime` per mount~~ **Reversed:** one shared, lazy
  `ManagedRuntime` per `WeftApp` serves every root (weft-app.specs.md WA1/WA2).
  The runtime is disposed by `WeftApp.dispose`, never by a root's `unmount`
  (WA5/WA6).

### AC25: Scope Management

- **Given** stream subscriptions
- **When** setting up subscriptions
- **Then**:
  - Use Scopes for cleanup support
  - Fork streams in Scope context
  - All scopes closed on unmount

### AC26: Unmount Function — amended by weft-app.specs.md WA5

- **Given** a mounted JSX tree
- **When** `unmount()` is called on the root handle
- **Then**:
  - Close the **root scope only** to cancel running streams and handler-forked
    work (_amended_: the shared app runtime is NOT disposed — that is
    `WeftApp.dispose`'s job)
  - Stop all of this root's stream subscriptions
  - Returns an Effect that completes when cleanup is done

### AC27: Mount Return Value — amended by weft-app.specs.md WA2/WA5

- **Given** `WeftApp.mount` is called
- **When** the mount Effect completes
- **Then**:
  - Returns a `RootHandle` (_amended from `MountHandle`_) with an `unmount()`
    method and the mounted `element`
  - Calling unmount multiple times is safe (idempotent)

### AC26/AC27 amendment: ambient-scope auto-unmount — REMOVED

- **Removed by weft-app.specs.md WA17:** ambient context capture no longer
  exists; `WeftApp.mount`/`WeftApp.hydrate` never read an ambient
  `Scope.Scope` and never auto-register `unmount` on one. Root lifetimes are
  owned by the app scope (`WeftApp.dispose`) or explicit `handle.unmount()`.
  The scope-aware variants `mountScoped`/`hydrateScoped` were deleted
  (mount-scoped.specs.md superseded).

## Technical Requirements

### Dependencies

- Effect library for Effect, Stream, Layer, Scope primitives
- Browser DOM APIs

### Architecture

- Keep implementation in `src/dom.ts` initially
- Split into multiple files if implementation grows large
- Use Effect patterns throughout (avoid try/catch unless ergonomics suffer)
- Follow strict TypeScript config: use type guards, careful narrowing

### Performance Considerations

- Static values don't create streams (optimization for common case)
- Comment markers for tracking positions (minimal DOM overhead)
- Internal references for efficient updates

### Browser Compatibility

- Modern browsers only (no polyfills planned)
- Relies on standard DOM APIs

### Future Extensions

- SVG namespace support (`createElementNS`)
- MathML namespace support
- Custom elements support
- Event handlers
- HMR support
- Keyed children and reconciliation

### AC28: Resource Cleanup on Mount Failure — amended by weft-app.specs.md WA18

- **Given** a `WeftApp.mount` call where `renderNode` fails (e.g. unsupported Renderable type)
- **When** the failure propagates
- **Then**:
  - The **root scope** is closed before the error surfaces (_amended_: the app
    runtime and other roots are untouched)
  - The original error is propagated unchanged
  - The root element remains mountable (no zombie resources)

## Constraints

- HTML elements only (no SVG/MathML yet)
- No event handlers yet
- No custom elements support yet
- No prop name mapping (`class` not `className` - stay close to HTML spec)
- No HMR support yet

## Success Criteria Summary

1. Static JSX renders correctly to DOM
2. Stream-based attributes/properties update reactively
3. Stream-based children update reactively with proper positioning
4. Style attribute supports string and object forms with streams
5. Function components work with plain Renderable, Effects, and Streams
6. Fragments render without wrapper elements
7. Errors are tagged with useful context
8. Effect completes after initial render, streams run in background
9. TypeScript types are strict and sound
10. Code follows Effect patterns and project standards
