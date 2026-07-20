/**
 * Example: Headless Menu
 *
 * Composes behavior into markup with `Props.merge`/`Props.cx`. `menu.ts`'s
 * `Menu.trigger`/`popup`/`item` are plain Effects yielding prop bags: aria
 * wiring, refs, keyboard/mouse handlers, reactive highlight state. None of
 * them call `h.*`. `FileMenu` below owns every element and merges those bags
 * onto its own classes, its own click handler, and its own ref, per
 * `docs/how-to/compose-behavior-and-markup.md`.
 */

import { h, List } from "@weftui/core";
import { Props } from "@weftui/dom";
import { Context, Effect, Layer, Option, pipe, Stream, SubscriptionRef } from "effect";
import { Menu } from "./menu";
import type { MenuItemDef } from "./menu";

/**
 * Service one menu item's `onSelect` requires below, proving the `R` channel
 * flows through `Props.merge`: `main.ts` must provide `NotifyLive` or the
 * program doesn't typecheck. `activity` is per-Layer state (via `Layer.effect`),
 * not a module singleton, so each `WeftApp.make(NotifyLive)` gets its own log
 * instead of leaking state across mounts.
 */
export class Notify extends Context.Service<
  Notify,
  {
    readonly send: (message: string) => Effect.Effect<void>;
    readonly activity: SubscriptionRef.SubscriptionRef<ReadonlyArray<string>>;
  }
>()("Notify") {}

export const NotifyLive = Layer.effect(
  Notify,
  Effect.gen(function* () {
    const activity = yield* SubscriptionRef.make<ReadonlyArray<string>>([]);
    return {
      activity,
      send: (message) => SubscriptionRef.update(activity, (log) => [...log, message]),
    };
  }),
);

const items: ReadonlyArray<MenuItemDef<never, never> | MenuItemDef<never, Notify>> = [
  {
    label: "New file",
    onSelect: Effect.sync(() => console.info("[headless-menu] created a new file")),
  },
  {
    label: "Rename",
    onSelect: Effect.gen(function* () {
      const notify = yield* Notify;
      yield* notify.send("Renamed to draft.md");
    }),
  },
  {
    label: "Duplicate",
    onSelect: Effect.gen(function* () {
      const notify = yield* Notify;
      yield* notify.send("Duplicated as draft-copy.md");
    }),
  },
];

const FileMenu = () =>
  Effect.gen(function* () {
    const notify = yield* Notify;
    const menu = yield* Menu.make(items);
    const toggleCount = yield* SubscriptionRef.make(0);
    const measureRef = yield* SubscriptionRef.make(Option.none<HTMLButtonElement>());
    const trigger = yield* Menu.trigger(menu);
    const popup = yield* Menu.popup(menu);

    return h.div({ class: "file-menu" }, [
      h.button(
        Props.merge(trigger, {
          class: Props.cx("btn", { "btn--open": SubscriptionRef.changes(menu.isOpen) }),
          onclick: () => SubscriptionRef.update(toggleCount, (n) => n + 1),
          ref: measureRef,
        }),
        "File",
      ),

      h.p({ class: "meta" }, [
        "toggled ",
        Stream.map(SubscriptionRef.changes(toggleCount), String),
        " times · ref fan-out: ",
        Stream.map(SubscriptionRef.changes(measureRef), (captured) =>
          Option.isSome(captured) ? "captured" : "pending",
        ),
      ]),

      h.ul(Props.merge(popup, { class: "menu-popup" }), [
        List.each({ of: items, by: (item) => item.label }, (item, index) =>
          pipe(
            Menu.item(menu, { index }),
            Effect.flatMap((itemProps) =>
              h.li(
                Props.merge(itemProps, {
                  class: Props.cx("menu-item", {
                    "menu-item--highlighted": Stream.map(
                      SubscriptionRef.changes(menu.highlighted),
                      Option.contains(index),
                    ),
                  }),
                }),
                item.label,
              ),
            ),
          ),
        ),
      ]),

      h.div({ class: "log" }, [
        Stream.map(SubscriptionRef.changes(notify.activity), (log) =>
          log.length === 0
            ? "(no activity yet)"
            : List.each({ of: log, by: (item, index) => `${item} ${index}` }, (item) => h.p(item)),
        ),
      ]),
    ]);
  });

export const App = () =>
  h.div({ class: "app" }, [
    h.h1("Headless Menu"),
    h.p(
      { class: "subtitle" },
      "A behavior primitive (Menu.trigger/popup/item) merged onto markup the consumer owns.",
    ),
    FileMenu(),
  ]);
