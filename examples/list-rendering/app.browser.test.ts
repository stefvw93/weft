/**
 * End-to-end browser test for the List Rendering example.
 *
 * Mounts the real `App` in Chromium and asserts the headline behaviour: the
 * static array renders one `<li>` per item, in order.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "./app";

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

describe("list-rendering example", () => {
  it("renders the static array as ordered list items", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    // The mounted tree is appended a tick after `mount` resolves, so poll.
    const firstList = await vi.waitFor(() => {
      const list = container.querySelector("ul");
      expect(list).not.toBeNull();
      return list!;
    });

    const items = [...firstList.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toEqual(["Apple", "Banana", "Cherry", "Date", "Elderberry"]);
  });
});
