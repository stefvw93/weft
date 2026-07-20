---
title: Compose Behavior and Markup
order: 13
section: how-to
description: "Use Props.merge to combine a behavior prop bag with your own markup: chained handlers, ref fan-out, and reactive classes on one element."
---

# Compose Behavior and Markup

**Goal:** share behavior (aria wiring, handlers, refs, reactive state) without
giving up ownership of the element it applies to.

## The problem

Behavior and markup usually want different owners. A dropdown's keyboard
handling, `aria-expanded` wiring and anchor ref are worth writing once. The
button itself is yours: your classes, your text, your extra handlers.

Object spread cannot combine them. `{ ...behavior, ...mine }` silently drops the
behavior's `onclick` when you supply your own, and drops its `ref` when you
supply yours. Nothing warns you.

`Props.merge` reconciles both bags instead.

## Behavior as a prop bag

A behavior primitive is a plain Effect that yields a prop bag. There is no
component wrapper and no hook rules, so you can `yield*` it anywhere and hold
the result.

```ts
import { Effect, Option, SubscriptionRef } from "effect";

const makeDisclosure = () =>
  Effect.gen(function* () {
    const isOpen = yield* SubscriptionRef.make(false);
    const anchor = yield* SubscriptionRef.make(Option.none<HTMLElement>());

    const trigger = {
      ref: anchor,
      "aria-expanded": SubscriptionRef.changes(isOpen),
      onclick: () => SubscriptionRef.update(isOpen, (open) => !open),
    };

    return { isOpen, trigger };
  });
```

`makeDisclosure` returns a plain object, not a `DomProps`-typed value. `merge`
accepts it as-is: it dispatches on each key's name, not on the bag's declared
type.

## Merge it onto your element

You write the element. The bag merges onto it.

```ts
import { h } from "@weftui/core";
import { Props } from "@weftui/dom";

const Panel = () =>
  Effect.gen(function* () {
    const disclosure = yield* makeDisclosure();
    const measure = yield* SubscriptionRef.make(Option.none<HTMLElement>());

    return yield* h.button(
      Props.merge(disclosure.trigger, {
        class: Props.cx("btn", { "btn--open": SubscriptionRef.changes(disclosure.isOpen) }),
        onclick: (ev: MouseEvent) => trackClick(ev),
        ref: measure,
      }),
      "Details",
    );
  });
```

Three rules earn their keep in that one call:

1. **Handlers chain.** The disclosure toggles, then `trackClick` runs. Both
   always run, and a failure in one does not prevent the other. A broken
   analytics call cannot block the toggle.
2. **Refs fan out.** `anchor` and `measure` both receive the element. Spread
   would have kept only one, silently.
3. **`cx` takes a reactive condition.** `btn--open` follows `isOpen`, and only
   the class attribute updates.

Type an inline handler's event explicitly, as `(ev: MouseEvent)` above. `merge`
does not know which element the bag will land on, so it cannot infer it.

## Typed errors flow through

A handler that fails with a tagged error, or needs a service, keeps both
channels through the merge. They surface on the component's `Node<E, R>`, so the
app must provide the service and can catch the error at a boundary.

```ts
declare const rowBehavior: object;
declare const itemId: string;

const deleteItem = Effect.gen(function* () {
  const files = yield* FileService;
  yield* files.remove(itemId);
});

// The merged node requires FileService and can fail with whatever error
// `files.remove` declares. Both channels flow through `merge` untouched.
h.button(Props.merge(rowBehavior, { onclick: () => deleteItem }), "Delete");
```

## Two gotchas that differ from spread

- **`false` on a handler is an explicit opt-out and wins.** `null` and
  `undefined` mean "not provided", so the other side survives instead.
- **Every other key is genuinely last-wins.** Forwarding an omitted optional
  prop (`{ id: props.id }`) still overwrites a default with `undefined`, the
  same as `{ ...base, ...override }` would. Guard at the call site if that
  matters.

The [reference](../reference/dom.md#propsmerge) has the full per-key rule
table, including the `style` and reactive-class cases this guide doesn't
cover.

## When to use

Reach for `Props.merge` when two parties contribute props to one element: a
shared behavior and a caller, or a base variant and a caller's override. For
a single bag you already control, write the object directly. Merge earns its
cost only when a key could collide.

`Props.merge` is pure: calling it has no side effects and subscribes
nothing. A merged `class` that turns out reactive is a `Stream` description.
The renderer subscribes it once the element mounts, the same as any other
reactive prop.

## See also

- [`@weftui/dom` reference](../reference/dom.md): the full per-key rules and `cx` grammar
- [Use Element Refs](./use-element-refs.md): the single-ref contract that fan-out builds on
- [Style Reactively](./style-reactively.md): per-property style streams and `cx`
- [The Combinator API](../explanation/combinator-api.md): why elements are plain data you always own
