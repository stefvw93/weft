/**
 * Real-browser coverage for `WeftApp` (weft-app.specs.md).
 *
 * Folds in the issue #123 acceptance scenario from the deleted
 * mount-scoped.browser.test.ts: a scoped layer (acquireRelease service) must
 * outlive initial render: acquired once, alive across real click dispatches,
 * released only at `WeftApp.dispose`, with no DOM patching afterwards. On the
 * app model this needs no scope/Deferred dance: the app runtime owns the
 * layer's lifetime.
 *
 * Note: package browser tests import the BUILT `@weftui/dom/client`, so the flat
 * browser config does not resolve the package's `~/*` source aliases.
 */

import { WeftApp } from "@weftui/dom/client";
import { h } from "@weftui/core";
import { Context, Effect, Layer, Stream, SubscriptionRef } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

interface CounterShape {
  readonly count: SubscriptionRef.SubscriptionRef<number>;
}
class Counter extends Context.Service<Counter, CounterShape>()("test/weft-app-e2e/Counter") {}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  container.remove();
});

describe("WeftApp: scoped layer lifetime across real events (issue #123)", () => {
  it("acquires once (lazily), survives clicks, releases only at dispose", async () => {
    let acquired = 0;
    let released = 0;

    const CounterLive = Layer.effect(
      Counter,
      Effect.acquireRelease(
        Effect.gen(function* () {
          acquired++;
          const count = yield* SubscriptionRef.make(0);
          return { count };
        }),
        () => Effect.sync(() => void released++),
      ),
    );

    const app = WeftApp.make(CounterLive);
    expect(acquired).toBe(0); // WA1: make is lazy, nothing built yet

    const view = h.div([
      h.div({ "data-testid": "count" }, [
        Stream.unwrap(
          Effect.gen(function* () {
            const { count } = yield* Counter;
            return Stream.map(SubscriptionRef.changes(count), String);
          }),
        ),
      ]),
      h.button(
        {
          type: "button",
          "data-testid": "inc",
          onclick: () =>
            Effect.gen(function* () {
              const { count } = yield* Counter;
              yield* SubscriptionRef.update(count, (n) => n + 1);
            }),
        },
        "+",
      ),
    ]);

    await Effect.runPromise(WeftApp.mount(app, view, container));
    expect(acquired).toBe(1); // built exactly once, on first mount

    const count = () => container.querySelector<HTMLElement>('[data-testid="count"]');
    const inc = () => container.querySelector<HTMLElement>('[data-testid="inc"]');

    await vi.waitFor(() => expect(count()?.textContent).toBe("0"));

    // The service survives real event dispatches: no early release.
    inc()?.click();
    await vi.waitFor(() => expect(count()?.textContent).toBe("1"));
    inc()?.click();
    await vi.waitFor(() => expect(count()?.textContent).toBe("2"));
    expect(acquired).toBe(1);
    expect(released).toBe(0);

    // Dispose: roots close first, then the layer releases (exactly once).
    await Effect.runPromise(WeftApp.dispose(app));
    expect(released).toBe(1);

    // Post-dispose: nodes remain but nothing patches anymore.
    const frozen = count()?.textContent;
    expect(frozen).toBe("2");
    inc()?.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(count()?.textContent).toBe(frozen);
  });
});

describe("WeftApp: RootHandle.awaitCommit (loom.specs.md LM11)", () => {
  it("set -> awaitCommit -> the DOM shows the latest value, no DOM polling", async () => {
    const app = WeftApp.make();
    const value = await Effect.runPromise(SubscriptionRef.make(0));

    const handle = await Effect.runPromise(
      WeftApp.mount(
        app,
        h.div({ id: "out" }, [Stream.map(SubscriptionRef.changes(value), String)]),
        container,
      ),
    );
    // Initial commit: ack, then read synchronously.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await Effect.runPromise(handle.awaitCommit);
    expect(container.querySelector("#out")?.textContent).toBe("0");

    // Burst of 50 sets: one bounded beat for pump delivery, then the ack; the
    // DOM assertion itself is synchronous (no vi.waitFor polling).
    const generationBefore = await Effect.runPromise(handle.commitGeneration);
    await Effect.runPromise(
      Effect.forEach(
        Array.from({ length: 50 }, (_, index) => index + 1),
        (n) => SubscriptionRef.set(value, n),
        { discard: true },
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const generationAfter = await Effect.runPromise(handle.awaitCommit);
    expect(container.querySelector("#out")?.textContent).toBe("50");
    expect(generationAfter).toBeGreaterThan(generationBefore);

    await Effect.runPromise(handle.unmount());
    await Effect.runPromise(WeftApp.dispose(app));
  });
});
