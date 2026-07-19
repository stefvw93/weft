---
title: The Combinator API
order: 2
section: explanation
description: How h, h.fragment, and Component.gen / Component.make work; why Node is an Effect; how E and R accumulate through a tree.
---

# The Combinator API

Weft builds UI trees by calling builder functions. Because component return types stay as generic `Effect.Effect<ElementDescriptor, E, R>`, the error channel (`E`) and requirements channel (`R`) propagate through the entire tree: visible to the type checker, satisfiable at the mount boundary.

JSX collapses every component's return type to an opaque `JSX.Element`, erasing both channels. The combinator API exists specifically to keep them intact.

## Nodes are Effects

`Node<E, R>` is defined as:

```typescript
type Node<E = never, R = never> = Effect.Effect<ElementDescriptor, E, R>;
```

Nodes are first-class Effects. Everything in the Effect ecosystem works on them directly:

```typescript
import { h } from "@weftui/core";
import { Effect } from "effect";

// yield* in Effect.gen: R propagates into the generator's context
const node = yield * h.div({ class: "container" }, "Hello");

// pipe: chain Effect operators directly
const provided = pipe(h.div(userStream), Effect.provide(UserServiceLive));

// Effect.flatMap: sequence node creation with async logic
const card = pipe(
  fetchCard(id),
  Effect.flatMap((data) => h.div({ class: "card" }, data.title)),
);
```

## The `h` namespace

`h` is a proxy object where every property is an element builder. Access any HTML or SVG tag name as `h.tagName`:

```typescript
import { h } from "@weftui/core";

h.div({ class: "container" }, [h.span("Hello"), h.p("World")]);
h.input({ type: "text", placeholder: "Search..." });
h.button({ type: "button", onclick: () => handleClick() }, "Submit");
```

Each builder accepts these call signatures:

```typescript
// props + children array
h.div(props, children: Node[])

// props + single string or number child
h.div(props, child: string | number)

// props only
h.div(props)

// children only (no props)
h.div(children: Node[])

// single string or number child
h.div("five")
h.div(5)

// no props, no children
h.div()
```

### How `E` and `R` accumulate

Reactive prop values (any `Stream`, `Effect`, or `Subscribable`) contribute their channels to the node:

```typescript
declare const colorStream: Stream.Stream<string, never, ThemeService>;

// Node<never, ThemeService>: R comes from the stream prop
const box = h.div({ style: { color: colorStream } }, "Hello");
```

Children contribute their channels too, and siblings union their channels:

```typescript
declare const nodeA: Node<never, ServiceA>;
declare const nodeB: Node<never, ServiceB>;

// Node<never, ServiceA | ServiceB>
const parent = h.div([nodeA, nodeB]);
```

Static values (strings, numbers, plain functions) contribute `never` to both channels.

## `h.fragment`

`h.fragment` groups children without emitting a wrapper element. Use it when a component needs to return multiple sibling nodes:

```typescript
import { h } from "@weftui/core";

// Renders as three adjacent <td> elements with no wrapping element
const TableRow = ({ user }: { user: User }) =>
  h.fragment([h.td(user.name), h.td(user.role), h.td(user.status)]);
```

## Custom components with `Component.gen` / `Component.make`

Plain functions work fine for simple components, but the `Component` factories provide type-level wiring so the caller's reactive prop types contribute their `E`/`R` to the returned node. Pick `Component.make` for a plain-function body and `Component.gen` for a generator body (when you need `yield*` to set up local state or pull from services).

```typescript
import { Component, h } from "@weftui/core";
import { Stream } from "effect";

interface ButtonProps {
  label: string | Stream.Stream<string>;
  onclick?: () => void;
}

const Button = Component.make((props: ButtonProps) =>
  h.button({ onclick: props.onclick }, [props.label]),
);

// When called with a stream prop, the stream's R flows into the node type:
declare const labelStream: Stream.Stream<string, never, I18nService>;

// Node<never, I18nService>
const btn = Button({ label: labelStream });
```

Components also accept an optional `children` argument, either as `readonly Renderable[]` or as a `(input) => readonly Renderable[]` function (render-prop pattern). `E`/`R` from children, including the array returned by a function-children call, accumulate on the resulting node.

Without `Component`, a plain function's return type is fixed at definition time and does not reflect the caller's reactive prop types.

See [component-authoring.md](../how-to/author-components.md) for a full walkthrough.

## Suspense boundaries

`Boundary.suspend` wraps async children and shows a fallback until all of them have emitted their first value:

```typescript
import { Boundary, h } from "@weftui/core";

Boundary.suspend({ fallback: h.div({ class: "spinner" }, "Loading...") }, [
  AsyncCard({ id: 1 }),
  AsyncCard({ id: 2 }),
]);
```

The fallback is replaced atomically: either all children are visible or none are. This prevents partial flicker when multiple async siblings resolve at different times. The boundary's node type is `Node<ChildrenE, ChildrenR>`: the children's `E`/`R` channels accumulate onto it, exactly as they would for a plain `h.*` parent.

On the server, `renderToStreamHydratable` emits the fallback inline and appends patch scripts as children resolve. On the client, `hydrate` sees through `Boundary.suspend` boundaries and adopts the already-resolved DOM directly.

`Boundary.suspend` is one of the boundary combinators. See the [core reference](../reference/core.md#boundarysuspend) for the full `Boundary.*` surface, including the failure-catch variants and `Boundary.rpc`.

## See also

- [The Rendering Model](./rendering-model.md): why a `Node` is an `Effect` and how the tree renders
- [Reactive Primitives](./reactive-primitives.md): the `Source` vocabulary that reactive props and children accept
- [Boundaries and Suspense](./boundaries-and-suspense.md): the boundary combinators as tree nodes
- [Author Components](../how-to/author-components.md): `Component.gen` / `Component.make` in practice
- [`@weftui/core` reference](../reference/core.md)
