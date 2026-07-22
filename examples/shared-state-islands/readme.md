# Shared State Islands

## Overview

One `WeftApp`, several DOM roots. This example mounts a "controls" island and a
"display" island into separate containers from the same app, sharing a
`SubscriptionRef`-backed `Counter` service through the app layer. Clicking a
button in one island updates the other reactively.

## Problem

Real pages are often not a single root: a header widget here, a sidebar there,
a product panel in the middle of server-rendered content. Before `WeftApp`,
every `mount` call created its own private runtime, so two roots could not see
the same service instance. Sharing state across them meant globals, a
hand-rolled event bus, or threading everything through the DOM.

## Solution

`WeftApp.make(CounterLive)` creates one app whose layer is built once and
memoized. Every `WeftApp.mount(app, …)` root resolves the same `Counter`
service, the same `SubscriptionRef` by reference, so `SubscriptionRef.changes`
streams in any island observe writes made from any other island.

Each root still has its own lifetime: `handle.unmount()` tears down one island,
`WeftApp.dispose(app)` tears down everything (roots first, then the layer).

## How It Works

- `app.ts` defines the `Counter` service (`Context.Service`) and `CounterLive`
  (`Layer.effect` building one `SubscriptionRef.make(0)`).
- `ControlsIsland` mutates the counter from `onclick` effect handlers; the
  handlers read `Counter` straight from the app layer, with no props and no capture.
- `DisplayIsland` renders `SubscriptionRef.changes(count)` (and a derived
  double) via `Stream.unwrap`: pure subscription, no mutation.
- `main.ts` makes the app once and mounts each island into its own container.
  The layer builds lazily on the first mount; the second mount reuses it.

## When to Use

- Widget/island architectures: several independent DOM roots that must share
  reactive state or services.
- Progressive enhancement of server-rendered pages, where interactive regions
  are scattered across static markup.
- Anywhere you would otherwise reach for a global store or event bus to link
  separately-mounted components.
