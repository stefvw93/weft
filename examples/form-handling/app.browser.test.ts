/**
 * End-to-end browser test for the Form Handling example.
 *
 * Mounts the real `App` in Chromium and asserts the headline behaviour: the
 * Schema-validated email input shows an error for invalid input and a success
 * message once a valid email is entered.
 */

import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "./app";

let container: HTMLElement;
let app: WeftApp.WeftApp;

const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
});

describe("form-handling example", () => {
  it("validates the schema email input reactively", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    const email = await vi.waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('input[type="email"]');
      expect(el).not.toBeNull();
      return el!;
    });

    type(email, "not-an-email");
    await vi.waitFor(() => expect(container.querySelector(".error-text")).not.toBeNull());

    type(email, "user@example.com");
    await vi.waitFor(() => {
      expect(container.querySelector(".error-text")).toBeNull();
      expect(container.querySelector(".success-text")?.textContent).toBe("Valid email");
    });
  });
});
