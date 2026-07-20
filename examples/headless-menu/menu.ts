/**
 * Behavior primitives for a headless dropdown menu. `Menu.make` builds scoped
 * state (open/highlight/anchor); `Menu.trigger`, `Menu.popup`, and `Menu.item`
 * each yield a plain prop bag, never an element. The consumer (`app.ts`) owns
 * every `h.*` call and merges these bags on with `Props.merge`, per
 * `docs/how-to/compose-behavior-and-markup.md`.
 *
 * Keyboard nav is centralized on the trigger rather than roving `tabindex`
 * across items: focus never has to leave the trigger button, so there is no
 * imperative focus-management to get wrong for a demo. Mouse users still get
 * per-item hover-highlight and click-to-select via `Menu.item`.
 */

import { Effect, Option, pipe, Scope, Stream, SubscriptionRef } from "effect";

/** One selectable action. `E`/`R` are whatever its `onSelect` effect declares. */
export interface MenuItemDef<E, R> {
  readonly label: string;
  readonly onSelect: Effect.Effect<void, E, R>;
}

/** Scoped state shared by a trigger/popup/item trio. */
export interface MenuState<E, R> {
  readonly isOpen: SubscriptionRef.SubscriptionRef<boolean>;
  readonly highlighted: SubscriptionRef.SubscriptionRef<Option.Option<number>>;
  readonly anchor: SubscriptionRef.SubscriptionRef<Option.Option<HTMLElement>>;
  readonly popupRef: SubscriptionRef.SubscriptionRef<Option.Option<HTMLElement>>;
  readonly popupId: string;
  readonly items: ReadonlyArray<MenuItemDef<E, R>>;
  readonly open: Effect.Effect<void>;
  readonly close: Effect.Effect<void>;
  readonly toggle: Effect.Effect<void>;
  readonly highlightNext: Effect.Effect<void>;
  readonly highlightPrev: Effect.Effect<void>;
  /** Runs `items[index].onSelect` then closes. A no-op for an out-of-range index. */
  readonly selectIndex: (index: number) => Effect.Effect<void, E, R>;
  readonly selectHighlighted: Effect.Effect<void, E, R>;
}

let nextMenuId = 0;

export const Menu = {
  /**
   * Builds one menu's state. Forks an outside-pointerdown listener into the
   * caller's scope, so it is torn down automatically on unmount, the same
   * lifetime discipline `examples/element-ref` uses for its ref observers.
   */
  make: <E, R>(
    items: ReadonlyArray<MenuItemDef<E, R>>,
  ): Effect.Effect<MenuState<E, R>, never, Scope.Scope> =>
    Effect.gen(function* () {
      const isOpen = yield* SubscriptionRef.make(false);
      const highlighted = yield* SubscriptionRef.make(Option.none<number>());
      const anchor = yield* SubscriptionRef.make(Option.none<HTMLElement>());
      const popupRef = yield* SubscriptionRef.make(Option.none<HTMLElement>());
      const popupId = `headless-menu-${nextMenuId++}`;

      const close = Effect.all(
        [SubscriptionRef.set(isOpen, false), SubscriptionRef.set(highlighted, Option.none())],
        { discard: true },
      );
      const open = Effect.all(
        [SubscriptionRef.set(isOpen, true), SubscriptionRef.set(highlighted, Option.some(0))],
        { discard: true },
      );
      const toggle = Effect.flatMap(SubscriptionRef.get(isOpen), (isOpenNow) =>
        isOpenNow ? close : open,
      );

      const highlightBy = (delta: number) =>
        SubscriptionRef.update(highlighted, (current) => {
          const count = items.length;
          if (count === 0) return Option.none();
          const at = Option.getOrElse(current, () => -1);
          return Option.some((((at + delta) % count) + count) % count);
        });
      const highlightNext = highlightBy(1);
      const highlightPrev = highlightBy(-1);

      const selectIndex = (index: number): Effect.Effect<void, E, R> => {
        const item = items[index];
        return item ? Effect.andThen(item.onSelect, close) : Effect.void;
      };
      const selectHighlighted: Effect.Effect<void, E, R> = Effect.gen(function* () {
        const current = yield* SubscriptionRef.get(highlighted);
        if (Option.isSome(current)) yield* selectIndex(current.value);
      });

      // The popup is a sibling of the trigger in the consumer's markup, not
      // its descendant, so a pointerdown anywhere inside it (including on an
      // item, ahead of that item's own `click`) must also count as "inside".
      // Checking `anchor` alone would close the menu on every real mouse
      // click on an item, one event ahead of that item's own select-and-close
      // handler.
      //
      // `Effect.forkScoped`, not a raw `addEventListener` + `Effect.runSync`:
      // the latter runs outside the app's runtime, so a failure in the
      // handler throws synchronously mid-DOM-dispatch instead of routing
      // through the app's normal fiber-failure reporting, and cleanup would
      // be manual (`examples/element-ref` uses the same `forkScoped` +
      // `Stream.fromEventListener` pairing for its ref observers).
      yield* pipe(
        Stream.fromEventListener<PointerEvent>(document, "pointerdown", { capture: true }),
        Stream.runForEach((event) =>
          Effect.gen(function* () {
            const isOpenNow = yield* SubscriptionRef.get(isOpen);
            if (!isOpenNow) return;
            const target = event.target as Node;
            const anchorEl = yield* SubscriptionRef.get(anchor);
            const popupEl = yield* SubscriptionRef.get(popupRef);
            const insideAnchor = Option.isSome(anchorEl) && anchorEl.value.contains(target);
            const insidePopup = Option.isSome(popupEl) && popupEl.value.contains(target);
            if (!insideAnchor && !insidePopup) {
              yield* close;
            }
          }),
        ),
        Effect.forkScoped,
      );

      return {
        isOpen,
        highlighted,
        anchor,
        popupRef,
        popupId,
        items,
        open,
        close,
        toggle,
        highlightNext,
        highlightPrev,
        selectIndex,
        selectHighlighted,
      };
    }),

  /** Prop bag for the button that opens/closes the menu. */
  trigger: <E, R>(menu: MenuState<E, R>) =>
    Effect.succeed({
      ref: menu.anchor,
      type: "button" as const,
      "aria-haspopup": "menu" as const,
      "aria-controls": menu.popupId,
      // Not a plain boolean stream: the renderer treats a `boolean` attribute
      // value as presence-only (`setAttribute(name, "")` / `removeAttribute`),
      // which is right for a true boolean attribute but wrong for `aria-*`,
      // which wants the literal string `"true"`/`"false"`.
      "aria-expanded": Stream.map(SubscriptionRef.changes(menu.isOpen), (isOpenNow) =>
        isOpenNow ? ("true" as const) : ("false" as const),
      ),
      onclick: () => menu.toggle,
      onkeydown: (ev: KeyboardEvent): Effect.Effect<void, E, R> =>
        Effect.gen(function* () {
          const isOpenNow = yield* SubscriptionRef.get(menu.isOpen);
          switch (ev.key) {
            case "ArrowDown":
              ev.preventDefault();
              yield* isOpenNow ? menu.highlightNext : menu.open;
              return;
            case "ArrowUp":
              ev.preventDefault();
              yield* isOpenNow ? menu.highlightPrev : menu.open;
              return;
            case "Escape":
              if (isOpenNow) yield* menu.close;
              return;
            case "Enter":
            case " ":
              if (isOpenNow) {
                ev.preventDefault();
                yield* menu.selectHighlighted;
              }
              return;
            default:
              return;
          }
        }),
    }),

  /**
   * Prop bag for the popup list element. Visibility plus the ref the
   * outside-click check in `Menu.make` uses to treat a click on the popup
   * itself (or one of its items) as "inside"; nav lives on the trigger.
   *
   * `ref` is a single-entry array, not a bare `SubscriptionRef`: the single-
   * ref prop arm types exactly to the target element
   * (`SubscriptionRef<Option<HTMLUListElement>>` for `h.ul`), but this bag
   * doesn't know which element it will land on. The array form is the
   * permissive fan-out arm (`SubscriptionRef<Option<any>>`, `props.specs.md`
   * AC14a), which any element accepts, the same trade-off `Props.merge`
   * makes for its own `ref` fan-out.
   */
  popup: <E, R>(menu: MenuState<E, R>) =>
    Effect.succeed({
      ref: [menu.popupRef],
      id: menu.popupId,
      role: "menu" as const,
      hidden: Stream.map(SubscriptionRef.changes(menu.isOpen), (isOpenNow) => !isOpenNow),
    }),

  /**
   * Prop bag for one menu item. `options.index` must match its position in
   * `items`. No `tabindex`: DOM focus stays on the trigger for keyboard use
   * (see `Menu.trigger`), so a roving `tabindex` here would set state nothing
   * ever reads.
   */
  item: <E, R>(menu: MenuState<E, R>, options: { readonly index: number }) =>
    Effect.succeed({
      role: "menuitem" as const,
      onmouseenter: () => SubscriptionRef.set(menu.highlighted, Option.some(options.index)),
      onclick: (): Effect.Effect<void, E, R> => menu.selectIndex(options.index),
    }),
};
