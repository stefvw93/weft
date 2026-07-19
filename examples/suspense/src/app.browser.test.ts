/**
 * End-to-end browser test for the Suspense example.
 *
 * Asserts the headline behaviour via the client `mount` path: a Suspense
 * boundary shows its fallback while its children are pending, then swaps in the
 * resolved content once every child has settled.
 *
 * The full streaming-SSR flow (`renderToStreamHydratable` emitting fallback +
 * inline `<template>`/`<script>` patches) is out of scope here. Driving those
 * self-removing patch scripts requires the HTTP response pipeline from
 * `server.ts`, not a single mounted tree. The client boundary coordination
 * tested here is the same logic the hydrated page relies on.
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

describe("suspense example", () => {
  it("shows the fallback, then reveals the resolved cards", async () => {
    app = WeftApp.make();
    await Effect.runPromise(WeftApp.mount(app, App(), container));

    // The shared fallback is shown while the three sibling cards are pending.
    await vi.waitFor(() => {
      expect(container.querySelector(".fallback")).not.toBeNull();
      expect(container.querySelector(".card")).toBeNull();
    });

    // All three cards (300/600/900ms) resolve and are revealed together.
    await vi.waitFor(
      () => {
        const titles = [...container.querySelectorAll(".card-title")].map((el) => el.textContent);
        expect(titles).toEqual(["Card 1", "Card 2", "Card 3"]);
      },
      { timeout: 3000 },
    );
  });
});
