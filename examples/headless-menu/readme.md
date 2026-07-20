# Headless Menu

## Overview

A dropdown menu split into two owners. `menu.ts` owns behavior: open/close
state, keyboard nav, outside-click, aria wiring, per-item highlight. `app.ts`
owns every element. `Props.merge` and `Props.cx` reconcile the two onto one
set of DOM nodes.

## Problem

Shared behavior and consumer markup usually fight over the same props. A
menu's keyboard handling, `aria-expanded` wiring, and anchor ref are worth
writing once. The button itself belongs to the caller: their classes, their
click tracking, their own ref.

Object spread can't combine them. `{ ...behavior, ...mine }` drops the
behavior's `onclick` the moment the caller supplies their own, and drops its
`ref` the moment the caller supplies theirs. Nothing warns you when this
happens.

## Solution

`menu.ts` exports `Menu`, a set of plain Effects that yield prop bags, not
elements:

```ts
Effect.gen(function* () {
  const menu = yield* Menu.make(items); // scoped: outside-click listener torn down on unmount
  const trigger = yield* Menu.trigger(menu); // ref, aria-*, onclick, onkeydown
  const popup = yield* Menu.popup(menu); // id, role, reactive hidden
});
```

`app.ts` merges each bag onto an element it owns:

```ts
h.button(
  Props.merge(trigger, {
    class: Props.cx("btn", { "btn--open": SubscriptionRef.changes(menu.isOpen) }),
    onclick: () => SubscriptionRef.update(toggleCount, (n) => n + 1),
    ref: measureRef,
  }),
  "File",
);
```

Three `Props.merge` rules earn their keep here:

- **Handlers chain.** `menu.toggle` runs, then the caller's `toggleCount`
  update runs. Both always run; a bug in one can't block the other.
- **Refs fan out.** `menu.anchor` (used for the outside-click check) and the
  caller's `measureRef` both get set to the same element. Spread would have
  kept only one, silently.
- **`cx` takes a reactive condition.** `btn--open` follows `menu.isOpen`; only
  the class attribute updates, nothing else re-renders.

## How It Works

- `Menu.make` builds `SubscriptionRef` state (`isOpen`, `highlighted`,
  `anchor`) and forks a `pointerdown` listener into the caller's scope, so it
  tears down automatically on unmount, the same discipline
  `examples/element-ref` uses for its ref observers. The outside-click check
  treats both `anchor` (the trigger) and `Menu.popup`'s own ref as "inside":
  in the consumer's markup the popup is a sibling of the trigger, not a
  descendant, and a real mouse click fires `pointerdown` before `click`, so
  checking `anchor` alone would close the menu on every click on an item, one
  event ahead of that item's own select-and-close handler.
- `Menu.trigger` centralizes keyboard nav (`ArrowDown`/`ArrowUp`/`Enter`/
  `Escape`) on the trigger button itself, instead of a roving `tabindex`
  across items. Focus never has to leave the trigger for keyboard use, so
  there's no imperative focus-management to get wrong in a demo. Mouse users
  still get per-item hover-highlight and click-to-select through `Menu.item`.
- One menu item's `onSelect` (`Rename`, `Duplicate`, defined in `app.ts`
  alongside the `Notify` service they need) requires `Notify`. That
  requirement travels from the item's `Effect` into `Menu.item`'s returned
  prop bag, through `Props.merge`, into the `h.li` node's type, into `App`'s
  `Node<E, R>`. `main.ts` has to provide `NotifyLive` at `WeftApp.make` or
  the program wouldn't typecheck: a service dependency enforced at compile
  time, not discovered at runtime. `menu.ts` itself never mentions `Notify`;
  it only has to carry whatever `E`/`R` an item's `onSelect` declares.
- `aria-expanded` is set from an explicit `"true" | "false"` stream, not a
  raw `boolean` one. The renderer treats a `boolean` attribute value as
  presence-only (`setAttribute(name, "")` / `removeAttribute`), which is
  correct for a true boolean attribute like `hidden` but wrong for `aria-*`,
  which needs the literal string token.

## When to Use

Reach for this pattern when a UI primitive's behavior (state, aria wiring,
keyboard handling, refs) is worth sharing, but the element it renders to
isn't. A tooltip, a disclosure, a combobox, a roving-tabindex toolbar: each
has behavior a library part could own, while the markup, styling, and any
extra event handling stay with the caller. See
[Compose Behavior and Markup](../../docs/how-to/compose-behavior-and-markup.md)
for the underlying `Props.merge`/`Props.cx` rules, and
`plans/props-merge-composition.md` for the design rationale (this example is
the incubator the design doc named as the next step).
