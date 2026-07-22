# Keyed List (`List.each`)

## Overview

This example demonstrates `List.each`, Weft's **keyed list combinator**. Each
row has a stable identity (`by`), so reordering, inserting, or removing items
reuses and moves the existing DOM nodes instead of rebuilding the whole list.
That preserves focus, uncontrolled input values, and per-row subscriptions.

## Problem

The plain `Stream<Array>` pattern (`Stream.map(items, (xs) => xs.map(render))`)
replaces the **entire** region on every emission. That destroys every row's DOM
node and tears down every nested subscription, so on each update:

- focus and uncontrolled `<input>` values are lost,
- per-row timers/counters reset to zero,
- the cost scales with `list-size × update-frequency`, even for a one-item move.

## Solution

```typescript
import { h, List } from "@weftui/core";
import { SubscriptionRef } from "effect";

h.ul([
  List.each({ of: SubscriptionRef.changes(rows), by: (row) => row.id }, (row) =>
    h.li({ id: `row-${row.id}` }, [/* … per-row content … */]),
  ),
]);
```

- `of` accepts a static `Iterable`, an `Effect`, a `Stream`, or a `Subscribable`
  of an iterable. Each emission is reconciled by key.
- `by` projects each item to a stable key (compared via Effect `Equal`). Omit it
  to key by the item itself (structural for `Data`, by reference otherwise).

## How It Works

1. The region is bracketed by `stream-start`/`stream-end` comment markers; each
   item is bracketed by its own `list-item-start`/`list-item-end` markers so a
   multi-node row moves and is removed as a single unit.
2. A persistent `HashMap<Key, ItemRecord>` is held across emissions. Each record
   owns a per-item scope forked from the region scope that **persists** until the
   key is removed, which is what keeps a row's subscription fibers alive.
3. On each emission the reconciler: inserts new keys (rendering them once),
   reuses persisted keys untouched, removes dropped keys (closing their scopes),
   and reorders survivors using a **longest-increasing-subsequence** so only the
   items not already in order are moved.

## When to Use

Use `List.each` whenever a list's items have identity and the list reorders,
grows, or shrinks over time, especially when rows hold local state (focus,
inputs, scroll, animations, running streams). For a static array that never
changes, plain `array.map(...)` is simpler and sufficient.

## ⚠️ Render-once / index-key footgun

A persisted key's `render` runs **exactly once**; it is never re-invoked.
Reconciliation only reuses/moves/inserts/removes DOM; it never refreshes a kept
row's content. Refresh a row by threading a `Stream` **inside** the row, not by
re-running `render`.

Because of this, `by: (_, index) => index` (an index key) reuses rows
**positionally**: after a reorder or replace, a row keeps the previous item's
rendered content unless that content is itself reactive. Prefer a stable
identity key (`by: (item) => item.id`).

## Running

```bash
vp install
vp run dev
```

Type into a row, watch its counter start, then **Shuffle** or **Reverse**. Focus,
the typed value, and the counter all survive the move. Compare with the
`list-rendering` example's `Stream<Array>` approach, which resets them.
