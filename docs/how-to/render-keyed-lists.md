---
title: Render Keyed Lists
order: 5
section: how-to
description: Render a reactive collection with List.each so reordering, inserting, and removing items reuses and moves existing DOM instead of rebuilding the region.
---

# Render Keyed Lists

**Goal:** render a list that reorders, inserts, or removes items over time, without rebuilding the whole region and losing focus, scroll, or input state in the surviving rows.

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

[`List.each`](../reference/core.md#listeach) renders each item **once per key** and reconciles across emissions. A reorder moves existing DOM nodes, an insert adds one, a remove drops one, and untouched rows are left alone.

## Options

```typescript
interface List.Options<S, K> {
  readonly of: S; // Iterable<T>, or an Effect/Stream/Subscribable of one
  readonly by?: (item: ItemOf<S>, index: number) => K; // reconciliation key
}
```

- **`of`**: the list source. Each emission is materialized to an array to fix order, then reconciled by key.
- **`by`**: projects each item to its reconciliation key, compared via Effect's `Equal`/`Hash`. Omit it and the item itself is the key (structural for `Data`, by reference otherwise).

## Why not `map`

```typescript
// Rebuilds every row on every emission: a new children array each time.
Stream.map(Subscribable.changes(rows), (rs) => rs.map((r) => h.li(r.name)));
```

The renderer diffs children by position, so a new array means every row's DOM node is recreated, even the ones that didn't move. `List.each` reconciles by key instead, so DOM identity (and the focus/scroll/typed-input state attached to it) survives across updates.

## Static lists: use plain children

`List.each` exists to reconcile a collection that changes after mount: it keys each row, forks a per-row scope, and brackets each item with start/end markers so a later reorder or removal reuses existing DOM.

If a collection never changes after mount, skip that machinery and render plain array children instead:

```typescript
h.ul(items.map((item) => h.li(item.name)));
```

A list that never re-emits pays for markers, per-row scopes, and an identity map it never uses. Plain children render in one pass with none of that bookkeeping.

Reach for `List.each` only when the source is reactive and items can reorder, insert, or remove.

## Refresh a row's content

`render` runs **exactly once per key**, so reconciliation never re-runs it for a kept row. To make a row's content reactive, thread a `Stream` **inside** the row instead of expecting a re-render:

```typescript
List.each({ of: Subscribable.changes(rows), by: (row) => row.id }, (row) =>
  h.li([h.span([Stream.map(Subscribable.changes(row.status), (s) => s)])]),
);
```

## Index-key footgun

`by: index` defeats reconciliation: nodes are reused by DOM position, not by item identity, so content goes stale after any reorder.

```typescript
// Wrong: reuses rows positionally. After a reorder, each position keeps its
// old content, so the visible rows are stale.
List.each({ of: Subscribable.changes(rows), by: (_row, i) => i }, renderRow);

// Right: a stable identity key follows the item, not its position.
List.each({ of: Subscribable.changes(rows), by: (row) => row.id }, renderRow);
```

## Complete example

A shuffleable row list. Each row starts a per-row tick counter and renders an uncontrolled `<input>`; shuffling moves rows instead of recreating them, so counters keep counting and typed input keeps its value and focus.

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Keyed list demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```typescript
// src/app.ts
/**
 * Keyed list demo: List.each moves existing rows on shuffle instead of
 * rebuilding them, so each row's own tick counter keeps running and its
 * input keeps focus and value. Side-effect-free (no mount call), so
 * `main.ts` and any test can import `App` directly.
 */
import { h, List } from "@weftui/core";
import { Effect, Schedule, Stream, SubscriptionRef } from "effect";

interface Row {
  readonly id: number;
  readonly name: string;
}

const renderRow = (row: Row) => {
  // Created once per key: starts a single time and keeps running across
  // every later shuffle of this row.
  const ticks = Stream.iterate(0, (n) => n + 1).pipe(Stream.schedule(Schedule.spaced("1 second")));

  return h.li({ id: `row-${row.id}` }, [
    h.span(row.name),
    h.input({ placeholder: "type here…" }),
    h.span(["ticks: ", ticks]),
  ]);
};

export const App = () =>
  Effect.gen(function* () {
    const rows = yield* SubscriptionRef.make<ReadonlyArray<Row>>([
      { id: 1, name: "Ada" },
      { id: 2, name: "Babbage" },
      { id: 3, name: "Curie" },
    ]);

    const shuffle = SubscriptionRef.update(rows, (current) =>
      [...current].sort(() => Math.random() - 0.5),
    );

    return yield* h.div([
      h.button({ onclick: () => shuffle }, "Shuffle"),
      h.ul([List.each({ of: SubscriptionRef.changes(rows), by: (row) => row.id }, renderRow)]),
    ]);
  });
```

```typescript
// src/main.ts
/**
 * Browser entry: mounts the keyed list demo into #root.
 */
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { App } from "./app";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root not found");
}

const app = WeftApp.make();
void Effect.runPromise(WeftApp.mount(app, App(), root));
```

## See also

- [`List.each` API reference](../reference/core.md#listeach): full signature, `List.Options`, and the descriptor shape
- [Reactive Primitives](../explanation/reactive-primitives.md): the stream-shaped sources `of` accepts
- [examples/keyed-list](../../examples/keyed-list): a runnable keyed list with reordering and a browser test
