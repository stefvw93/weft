/**
 * Real-browser coverage for `Props.merge` / `Props.cx` (props.specs.md).
 *
 * Covers what jsdom cannot faithfully reproduce: real click dispatch through
 * chained handlers (AC6, AC7), live class-attribute updates from a derived
 * stream (AC9, AC17), and ref fan-out onto a real element (AC12, AC14).
 *
 * Note: package browser tests import the BUILT `@weftui/dom` entries. The flat
 * browser config does not resolve the package's `~/*` source aliases.
 */

import { Props } from "@weftui/dom";
import { WeftApp } from "@weftui/dom/client";
import { h } from "@weftui/core";
import { Effect, Option, SubscriptionRef } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  container.remove();
});

describe("Props.merge: chained handlers under real event dispatch", () => {
  it("AC6/AC7: both handlers run in order on a real click, sharing the event", async () => {
    const calls: string[] = [];
    let defaultPreventedInRight: boolean | undefined;

    const app = WeftApp.make();
    const view = h.form({ "data-testid": "form" }, [
      h.button(
        Props.merge(
          {
            type: "submit",
            "data-testid": "go",
            onclick: (event: Event) => {
              calls.push("left");
              event.preventDefault();
            },
          },
          {
            onclick: (event: Event) =>
              Effect.sync(() => {
                calls.push("right");
                defaultPreventedInRight = event.defaultPrevented;
              }),
          },
        ),
        "Go",
      ),
    ]);

    await Effect.runPromise(WeftApp.mount(app, view, container));
    const button = () => container.querySelector<HTMLElement>('[data-testid="go"]');
    await vi.waitFor(() => expect(button()).not.toBeNull());

    button()?.click();

    await vi.waitFor(() => expect(calls).toEqual(["left", "right"]));
    expect(defaultPreventedInRight).toBe(true);

    await Effect.runPromise(WeftApp.dispose(app));
  });

  it("AC6: a failing left handler does not stop the right one", async () => {
    const calls: string[] = [];

    const app = WeftApp.make();
    const view = h.button(
      Props.merge(
        {
          "data-testid": "risky",
          onclick: () => {
            calls.push("left");
            throw new Error("left handler boom");
          },
        },
        {
          onclick: () =>
            Effect.sync(() => {
              calls.push("right");
            }),
        },
      ),
      "Risky",
    );

    await Effect.runPromise(WeftApp.mount(app, view, container));
    const button = () => container.querySelector<HTMLElement>('[data-testid="risky"]');
    await vi.waitFor(() => expect(button()).not.toBeNull());

    button()?.click();

    await vi.waitFor(() => expect(calls).toEqual(["left", "right"]));

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

describe("Props.merge / Props.cx: reactive class on a live element", () => {
  it("AC9/AC17: the class attribute alone updates as the condition emits", async () => {
    const active = await Effect.runPromise(SubscriptionRef.make(false));

    const app = WeftApp.make();
    const view = h.button(
      Props.merge(
        { "data-testid": "toggle", id: "stable", class: "btn" },
        {
          class: Props.cx("btn--themed", {
            "btn--active": SubscriptionRef.changes(active),
          }),
          onclick: () => SubscriptionRef.update(active, (on) => !on),
        },
      ),
      "Toggle",
    );

    await Effect.runPromise(WeftApp.mount(app, view, container));
    const button = () => container.querySelector<HTMLElement>('[data-testid="toggle"]');
    await vi.waitFor(() => expect(button()?.getAttribute("class")).toBe("btn btn--themed"));

    // Sibling props are untouched by the class stream.
    expect(button()?.id).toBe("stable");

    button()?.click();
    await vi.waitFor(() =>
      expect(button()?.getAttribute("class")).toBe("btn btn--themed btn--active"),
    );
    expect(button()?.id).toBe("stable");

    button()?.click();
    await vi.waitFor(() => expect(button()?.getAttribute("class")).toBe("btn btn--themed"));

    await Effect.runPromise(WeftApp.dispose(app));
  });

  it("AC8: an all-static merged class renders as a plain attribute", async () => {
    const app = WeftApp.make();
    const view = h.div(
      Props.merge({ class: "card" }, { class: "card--wide", "data-testid": "card" }),
      "Static",
    );

    await Effect.runPromise(WeftApp.mount(app, view, container));
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="card"]')?.getAttribute("class")).toBe(
        "card card--wide",
      ),
    );

    await Effect.runPromise(WeftApp.dispose(app));
  });
});

describe("Props.merge: ref fan-out on a real element", () => {
  it("AC12/AC14: every merged ref receives the mounted element", async () => {
    const behaviorRef = await Effect.runPromise(SubscriptionRef.make(Option.none<HTMLElement>()));
    const measureRef = await Effect.runPromise(SubscriptionRef.make(Option.none<HTMLElement>()));

    const app = WeftApp.make();
    const view = h.div(
      Props.merge({ ref: behaviorRef, "data-testid": "fan" }, { ref: measureRef }),
      "Fan out",
    );

    await Effect.runPromise(WeftApp.mount(app, view, container));
    const target = () => container.querySelector<HTMLElement>('[data-testid="fan"]');
    await vi.waitFor(() => expect(target()).not.toBeNull());

    const [behavior, measure] = await Effect.runPromise(
      Effect.all([SubscriptionRef.get(behaviorRef), SubscriptionRef.get(measureRef)]),
    );

    expect(Option.isSome(behavior)).toBe(true);
    expect(Option.isSome(measure)).toBe(true);
    expect(Option.getOrThrow(behavior)).toBe(target());
    expect(Option.getOrThrow(measure)).toBe(target());

    // A fanned-out ref is a live handle to the real element, not a copy.
    expect(Option.getOrThrow(measure).isConnected).toBe(true);

    await Effect.runPromise(WeftApp.dispose(app));
  });
});
