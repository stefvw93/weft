# List Rendering

## Overview

This example demonstrates patterns for rendering lists in Weft, including static arrays, stream-based lists, and `h.fragment` usage.

## Problem

Lists are fundamental to web UIs. Understanding how Weft handles arrays, iterables, and dynamic updates is essential.

## Solution

Weft supports multiple list rendering patterns:

```typescript
import { h } from "@weftui/core";
import { Stream } from "effect";

// Static array mapping
h.ul(items.map((item) => h.li(item)));

// Fragment for multiple elements without a wrapper
const TableRow = ({ user }: { user: User }) => h.fragment([h.td(user.name), h.td(user.role)]);

// Stream of arrays: entire list re-renders on each emission
const itemsStream = Stream.iterate([], (items) => [...items, newItem]);
h.ul([Stream.map(itemsStream, (items) => items.map((i) => h.li(i)))]);
```

## How It Works

1. Arrays are flattened during rendering, so nested arrays work naturally
2. `h.fragment` renders children without a wrapper element
3. Streams of arrays replace the entire list on each emission
4. Individual list items can have their own reactive streams
5. Comment markers track stream positions for efficient updates

## Benefits

- **Natural syntax**: Standard `array.map()` works as expected
- **Fragments**: No extra DOM nodes for multi-element returns
- **Reactive lists**: Stream-based arrays for dynamic content
- **Nested support**: Deep array nesting handled automatically
- **Mixed content**: Static and reactive items can coexist

## Usage Patterns

### Static Array

```typescript
const items = ["A", "B", "C"];
h.ul(items.map((item) => h.li(item)));
```

### Fragment Component

```typescript
const TableRow = ({ data }: { data: { name: string; value: string } }) =>
  h.fragment([h.td(data.name), h.td(data.value)]);

h.table([h.tbody(rows.map((row) => h.tr([TableRow({ data: row })])))]);
```

### Growing List

```typescript
const itemsStream = Stream.iterate(["Initial"], (items) => [
  ...items,
  `Item ${items.length + 1}`,
]).pipe(Stream.schedule(Schedule.spaced("1 second")));

h.ul([Stream.map(itemsStream, (items) => items.map((item) => h.li(item)))]);
```

### Items with Individual Streams

```typescript
const items = ids.map((id) => ({
  id,
  valueStream: fetchDataStream(id),
}));

h.ul(items.map((item) => h.li([`${item.id}: `, item.valueStream])));
```

### Nested Lists

```typescript
const categories = [
  { name: "A", items: ["A1", "A2"] },
  { name: "B", items: ["B1", "B2"] },
];

h.div(categories.map((cat) => h.div([h.h3(cat.name), h.ul(cat.items.map((i) => h.li(i)))])));
```

### Badges with Fragment

```typescript
const TagList = ({ tags }: { tags: string[] }) =>
  h.fragment(tags.map((tag) => h.span({ class: "badge" }, tag)));
```

## When to Use

- Displaying collections of data
- Table rows that return multiple cells
- Tag/badge lists without wrappers
- Real-time updating lists
- Any component that needs to return multiple elements
