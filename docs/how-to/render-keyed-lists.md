---
title: Render Keyed Lists
order: 5
section: how-to
description: Render a reactive collection with List.each so reordering, inserting, and removing items reuses and moves existing DOM instead of rebuilding the region.
---

# Render Keyed Lists

**Goal:** render a list whose items reorder, insert, or remove over time, without rebuilding the whole region (which would lose focus, scroll, and input state in the surviving rows).

Use [`List.each`](../reference/core.md#listeach), the keyed-list combinator. It renders each item **once per key** and reconciles across emissions. A reorder _moves_ existing DOM nodes, an insert adds one, a remove drops one, and untouched rows are left entirely alone.

```typescript
import { h, List, Subscribable } from "@weftui/core";
import { Stream } from "effect";

declare const rows: Subscribable.Subscribable<ReadonlyArray<{ id: number; name: string }>>;

h.ul([
  List.each(
    { of: Subscribable.changes(rows), by: (row) => row.id }, // key by stable identity
    (row) => h.li(row.name),
  ),
]);
```

- **`of`** is the list source: any `Stream`, `Effect`, or `Subscribable` of an `Iterable`. Each emission is materialized to an array to fix order, then reconciled by key.
- **`by`** projects each item to its reconciliation key, compared via Effect's `Equal`/`Hash`. Omit it and the item itself is the key (structural for `Data`, by reference otherwise).

## Why not `map`?

Mapping items by hand (`Stream.map(Subscribable.changes(rows), (rs) => rs.map(r => h.li(r.name)))`) produces a **new children array on every emission**. The renderer then rebuilds the whole region: every row's DOM node is recreated even if only one item moved.

`List.each` reconciles by key instead, so DOM identity (and the focus/scroll/typed-input state attached to it) survives across updates.

## Refresh a row's content

Because `render` runs **exactly once per key**, reconciliation never re-runs it for a kept row, so it never refreshes that row's content on its own. To make a row's content reactive, thread a `Stream` **inside** the row rather than expecting a re-render:

```typescript
List.each({ of: Subscribable.changes(rows), by: (row) => row.id }, (row) =>
  h.li([h.span([Stream.map(Subscribable.changes(row.status), (s) => s)])]),
);
```

> **⚠️ Index-key footgun.** Keying by index (`by: (_, i) => i`) reuses rows positionally, so after a reorder each position keeps its old content and you see stale rows. Prefer a stable identity key (`by: (item) => item.id`).

## See also

- [`List.each` API reference](../reference/core.md#listeach): full signature, `List.Options`, and the descriptor shape
- [Reactive Primitives](../explanation/reactive-primitives.md): the stream-shaped sources `of` accepts
- [examples/keyed-list](../../examples/keyed-list): a runnable keyed list with reordering and a browser test
