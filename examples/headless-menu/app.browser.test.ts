/**
 * End-to-end browser test for the Headless Menu example.
 *
 * Mounts the real `App` in Chromium and asserts the headline behaviour: a
 * behavior primitive (`Menu.trigger`/`popup`/`item`) merged onto consumer-owned
 * elements via `Props.merge` still behaves like one coherent widget.
 *
 * - handler chaining: the trigger's own `onclick` runs alongside `menu.toggle`,
 * - ref fan-out: `menu.anchor` and the consumer's own ref both capture the button,
 * - reactive `aria-expanded`/`hidden`/highlight class track menu state,
 * - a service (`Notify`) required by an item's `onSelect` flows through the
 *   merge and must be provided at the `WeftApp` layer,
 * - keyboard nav (ArrowDown/Enter/Escape) and outside-click both work without
 *   moving DOM focus off the trigger.
 *
 * `Notify`'s activity log is created fresh per `Layer.effect` instantiation
 * (per `WeftApp.make(NotifyLive)`), so each `mountMenu()` call below starts
 * with an empty log.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App, NotifyLive } from "./app";

let container: HTMLElement;
let app: WeftApp.WeftApp;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
});

async function mountMenu() {
  app = WeftApp.make(NotifyLive);
  await Effect.runPromise(WeftApp.mount(app, App(), container));

  const trigger = await vi.waitFor(() => {
    const el = container.querySelector<HTMLButtonElement>(".btn");
    expect(el).not.toBeNull();
    return el!;
  });
  const popup = container.querySelector<HTMLUListElement>(".menu-popup")!;
  return { trigger, popup };
}

const highlightedItems = (popup: HTMLElement) =>
  [...popup.querySelectorAll<HTMLElement>(".menu-item")].filter((li) =>
    li.classList.contains("menu-item--highlighted"),
  );

describe("headless-menu example", () => {
  it("opens via the trigger, chaining the consumer's onclick after menu.toggle", async () => {
    const { trigger, popup } = await mountMenu();
    expect(popup.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    trigger.click();

    await vi.waitFor(() => expect(popup.hidden).toBe(false));
    await vi.waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));
    // The consumer's own onclick (toggle-count) ran alongside menu.toggle.
    await vi.waitFor(() => {
      const meta = container.querySelector(".meta");
      expect(meta?.textContent).toContain("toggled 1 times");
    });

    trigger.click();
    await vi.waitFor(() => expect(popup.hidden).toBe(true));
  });

  it("fans the ref out: menu.anchor and the consumer's own ref both capture the trigger", async () => {
    await mountMenu();

    await vi.waitFor(() => {
      const meta = container.querySelector(".meta");
      expect(meta?.textContent).toContain("ref fan-out: captured");
    });
  });

  it("selects an item by click, running its Notify-requiring onSelect and closing the menu", async () => {
    const { trigger, popup } = await mountMenu();
    trigger.click();
    await vi.waitFor(() => expect(popup.hidden).toBe(false));

    const renameItem = await vi.waitFor(() => {
      const el = [...popup.querySelectorAll<HTMLElement>(".menu-item")].find(
        (li) => li.textContent === "Rename",
      );
      expect(el).toBeDefined();
      return el!;
    });
    renameItem.click();

    await vi.waitFor(() => expect(popup.hidden).toBe(true));
    await vi.waitFor(() => {
      const log = container.querySelector(".log");
      expect(log?.textContent).toContain("Renamed to draft.md");
    });
  });

  it("does not treat a real pointerdown on an item as an outside click", async () => {
    // A real click fires `pointerdown` (captured by the outside-click
    // listener) before `click`. `element.click()` in the previous test
    // skips that, so this reproduces the actual browser event order: the
    // item is a descendant of the popup, not the trigger, so the listener
    // must recognize the popup itself as "inside", not just the anchor.
    const { trigger, popup } = await mountMenu();
    trigger.click();
    await vi.waitFor(() => expect(popup.hidden).toBe(false));

    const duplicateItem = await vi.waitFor(() => {
      const el = [...popup.querySelectorAll<HTMLElement>(".menu-item")].find(
        (li) => li.textContent === "Duplicate",
      );
      expect(el).toBeDefined();
      return el!;
    });

    duplicateItem.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(popup.hidden).toBe(false);

    duplicateItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(popup.hidden).toBe(true));
    await vi.waitFor(() => {
      const log = container.querySelector(".log");
      expect(log?.textContent).toContain("Duplicated as draft-copy.md");
    });
  });

  it("highlights on hover", async () => {
    const { trigger, popup } = await mountMenu();
    trigger.click();
    await vi.waitFor(() => expect(popup.hidden).toBe(false));

    const duplicateItem = await vi.waitFor(() => {
      const el = [...popup.querySelectorAll<HTMLElement>(".menu-item")].find(
        (li) => li.textContent === "Duplicate",
      );
      expect(el).toBeDefined();
      return el!;
    });

    duplicateItem.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    await vi.waitFor(() => expect(highlightedItems(popup)).toEqual([duplicateItem]));
  });

  it("navigates and selects with the keyboard from the trigger, without needing DOM focus in the popup", async () => {
    const { trigger, popup } = await mountMenu();

    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await vi.waitFor(() => expect(popup.hidden).toBe(false));
    await vi.waitFor(() => expect(highlightedItems(popup)).toHaveLength(1));
    await vi.waitFor(() => expect(highlightedItems(popup)[0]?.textContent).toBe("New file"));

    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await vi.waitFor(() => expect(highlightedItems(popup)[0]?.textContent).toBe("Rename"));

    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() => expect(popup.hidden).toBe(true));
    await vi.waitFor(() => {
      const log = container.querySelector(".log");
      expect(log?.textContent).toContain("Renamed to draft.md");
    });
  });

  it("closes on Escape without selecting", async () => {
    const { trigger, popup } = await mountMenu();
    trigger.click();
    await vi.waitFor(() => expect(popup.hidden).toBe(false));

    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(popup.hidden).toBe(true));
  });

  it("closes on an outside click", async () => {
    const { trigger, popup } = await mountMenu();
    trigger.click();
    await vi.waitFor(() => expect(popup.hidden).toBe(false));

    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await vi.waitFor(() => expect(popup.hidden).toBe(true));
  });
});
