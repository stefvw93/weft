import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Context, Effect, Layer, Stream } from "effect";
import { JSDOM } from "jsdom";
import { h } from "@weftui/core";
import type { Renderable } from "@weftui/core/types";
import * as WeftApp from "./weft-app";

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Creates a fresh DOM environment for each test
 */
function createTestDOM() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Comment = dom.window.Comment;
  global.Text = dom.window.Text;
  global.MouseEvent = dom.window.MouseEvent;
  global.Event = dom.window.Event;
  return dom;
}

/**
 * Creates a root element for mounting
 */
function createRoot(): HTMLElement {
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  return root;
}

/**
 * Helper to run mount and wait for initial render
 */
async function runMount(app: Renderable, root: HTMLElement) {
  const handle = await Effect.runPromise(WeftApp.mount(WeftApp.make(), app, root));
  return handle;
}

/**
 * Helper to wait for async operations
 */
function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for stream emissions
 */
function waitForStream(): Promise<void> {
  return waitFor(100);
}

// ============================================================================
// AC1: Static Plain Callback Handler
// ============================================================================

describe("AC1: Static Plain Callback Handler", () => {
  it("should invoke callback synchronously when event fires", async () => {
    createTestDOM();
    const root = createRoot();
    let clicked = false;

    await runMount(
      h.button(
        {
          type: "button",
          onclick: () => {
            clicked = true;
          },
        },
        "Click me",
      ),
      root,
    );

    const button = root.querySelector("button");
    assert.ok(button, "Button should exist");

    button.click();
    assert.equal(clicked, true, "Callback should have been invoked");
  });

  it("should pass event object to callback", async () => {
    createTestDOM();
    const root = createRoot();
    let receivedEvent: Event | null = null;

    await runMount(
      h.button(
        {
          type: "button",
          onclick: (e) => {
            receivedEvent = e;
          },
        },
        "Click me",
      ),
      root,
    );

    const button = root.querySelector("button");
    button?.click();

    assert.ok(receivedEvent !== null, "Event should have been received");
    assert.equal((receivedEvent as Event).type, "click");
  });

  it("should handle multiple event types on same element", async () => {
    createTestDOM();
    const root = createRoot();
    const events: string[] = [];

    await runMount(
      h.input({
        type: "text",
        onfocus: () => {
          events.push("focus");
        },
        onblur: () => {
          events.push("blur");
        },
      }),
      root,
    );

    const input = root.querySelector("input");
    input?.focus();
    input?.blur();

    assert.deepEqual(events, ["focus", "blur"]);
  });
});

// ============================================================================
// AC2: Static Effect Handler
// ============================================================================

describe("AC2: Static Effect Handler", () => {
  it("should detect and run Effect-returning handler", async () => {
    createTestDOM();
    const root = createRoot();
    let effectRan = false;

    await runMount(
      h.button(
        {
          type: "button",
          onclick: () =>
            Effect.sync(() => {
              effectRan = true;
            }),
        },
        "Click me",
      ),
      root,
    );

    const button = root.querySelector("button");
    button?.click();

    // Effect runs async via runFork
    await waitFor(50);
    assert.equal(effectRan, true, "Effect should have run");
  });

  it("should allow Effect.gen in handler", async () => {
    createTestDOM();
    const root = createRoot();
    const logs: string[] = [];

    await runMount(
      h.button(
        {
          type: "button",
          onclick: () =>
            Effect.gen(function* () {
              logs.push("step1");
              yield* Effect.sync(() => logs.push("step2"));
            }),
        },
        "Click me",
      ),
      root,
    );

    const button = root.querySelector("button");
    button?.click();

    await waitFor(50);
    assert.deepEqual(logs, ["step1", "step2"]);
  });
});

// ============================================================================
// AC3: Effect Handler with Services
// ============================================================================

describe("AC3: Effect Handler with Services", () => {
  it("should allow handler to access services provided at mount", async () => {
    createTestDOM();
    const root = createRoot();

    // Define a test service
    class CounterService extends Context.Service<
      CounterService,
      { increment: () => Effect.Effect<number> }
    >()("CounterService") {}

    let counterValue = 0;
    const CounterServiceLive = Layer.succeed(CounterService, {
      increment: () =>
        Effect.sync(() => {
          counterValue++;
          return counterValue;
        }),
    });

    // Mount with service provided
    const handle = await Effect.runPromise(
      WeftApp.mount(
        WeftApp.make(CounterServiceLive),
        h.button(
          {
            type: "button",
            onclick: () =>
              Effect.gen(function* () {
                const counter = yield* CounterService;
                yield* counter.increment();
              }),
          },
          "Increment",
        ),
        root,
      ),
    );

    const button = root.querySelector("button");

    // Click multiple times
    button?.click();
    await waitFor(50);
    assert.equal(counterValue, 1);

    button?.click();
    await waitFor(50);
    assert.equal(counterValue, 2);

    await Effect.runPromise(handle.unmount());
  });
});

// ============================================================================
// AC4: Effect Handler Error Handling
// ============================================================================

describe("AC4: Effect Handler Error Handling", () => {
  it("should not crash UI when Effect fails", async () => {
    createTestDOM();
    const root = createRoot();
    let clickCount = 0;

    await runMount(
      h.div({}, [
        h.button(
          { type: "button", id: "failing", onclick: () => Effect.fail(new Error("Test error")) },
          "Fail",
        ),
        h.button(
          {
            type: "button",
            id: "working",
            onclick: () => {
              clickCount++;
            },
          },
          "Work",
        ),
      ]),
      root,
    );

    const failingButton = root.querySelector("#failing") as HTMLButtonElement;
    const workingButton = root.querySelector("#working") as HTMLButtonElement;

    // Click failing button - should not crash
    failingButton?.click();
    await waitFor(50);

    // UI should still be responsive
    workingButton?.click();
    assert.equal(clickCount, 1, "Working button should still work");
  });
});

// ============================================================================
// AC5: Reactive Handler (Stream)
// ============================================================================

describe("AC5: Reactive Handler (Stream)", () => {
  it("should update handler when stream emits", async () => {
    createTestDOM();
    const root = createRoot();
    const calls: string[] = [];

    const handlerStream = Stream.make(
      () => {
        calls.push("handler1");
      },
      () => {
        calls.push("handler2");
      },
    );

    await runMount(h.button({ type: "button", onclick: handlerStream }, "Click me"), root);

    await waitForStream();

    const button = root.querySelector("button");
    button?.click();

    // Stream.make emits all values synchronously, so handler2 is active
    assert.deepEqual(calls, ["handler2"]);
  });

  it("should remove old listener when new handler emitted", async () => {
    createTestDOM();
    const root = createRoot();
    const calls: string[] = [];

    const handlerStream = Stream.make(
      () => {
        calls.push("handler1");
      },
      () => {
        calls.push("handler2");
      },
    );

    await runMount(h.button({ type: "button", onclick: handlerStream }, "Click me"), root);

    await waitForStream();

    const button = root.querySelector("button");
    button?.click();
    button?.click();

    // Only handler2 should be called (twice)
    assert.deepEqual(calls, ["handler2", "handler2"]);
  });
});

// ============================================================================
// AC6: Reactive Handler (Effect)
// ============================================================================

describe("AC6: Reactive Handler (Effect)", () => {
  it("should attach handler when Effect resolves", async () => {
    createTestDOM();
    const root = createRoot();
    let clicked = false;

    const handlerEffect = Effect.succeed((): void => {
      clicked = true;
    });

    await runMount(h.button({ type: "button", onclick: handlerEffect }, "Click me"), root);

    await waitForStream();

    const button = root.querySelector("button");
    button?.click();

    assert.equal(clicked, true);
  });
});

// ============================================================================
// AC7: Null/False Handler Values
// ============================================================================

describe("AC7: Null/False Handler Values", () => {
  it("should not attach listener when handler is null", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.button({ type: "button", onclick: null }, "Click me"), root);

    const button = root.querySelector("button");
    // Should not throw or cause issues
    button?.click();
    assert.ok(true, "Click on null handler should not crash");
  });

  it("should not attach listener when handler is false", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(h.button({ type: "button", onclick: false }, "Click me"), root);

    const button = root.querySelector("button");
    button?.click();
    assert.ok(true, "Click on false handler should not crash");
  });

  it("should remove listener when stream emits null", async () => {
    createTestDOM();
    const root = createRoot();
    let clickCount = 0;

    const handlerStream = Stream.make(
      (): void => {
        clickCount++;
      },
      null as (() => void) | null,
    );

    await runMount(h.button({ type: "button", onclick: handlerStream }, "Click me"), root);

    await waitForStream();

    const button = root.querySelector("button");
    button?.click();
    button?.click();

    // Handler was removed after null emission
    assert.equal(clickCount, 0);
  });
});

// ============================================================================
// AC8: Handler Change Cleanup
// ============================================================================

describe("AC8: Handler Change Cleanup", () => {
  it("should only have one listener attached at a time", async () => {
    createTestDOM();
    const root = createRoot();
    let callCount = 0;

    // Create a stream that emits multiple handlers
    const handlerStream = Stream.make(
      (): void => {
        callCount++;
      },
      (): void => {
        callCount++;
      },
      (): void => {
        callCount++;
      },
    );

    await runMount(h.button({ type: "button", onclick: handlerStream }, "Click me"), root);

    await waitForStream();

    const button = root.querySelector("button");
    button?.click();

    // Only one listener should be active (the last one)
    assert.equal(callCount, 1);
  });
});

// ============================================================================
// AC9: Cleanup on Unmount
// ============================================================================

describe("AC9: Cleanup on Unmount", () => {
  it("should remove event listeners on unmount", async () => {
    createTestDOM();
    const root = createRoot();
    let clickCount = 0;

    const handle = await runMount(
      h.button(
        {
          type: "button",
          onclick: () => {
            clickCount++;
          },
        },
        "Click me",
      ),
      root,
    );

    const button = root.querySelector("button");
    button?.click();
    assert.equal(clickCount, 1);

    // Unmount
    await Effect.runPromise(handle.unmount());

    // Click after unmount should not increment
    button?.click();
    assert.equal(clickCount, 1, "Handler should not fire after unmount");
  });

  it("should cleanup reactive handler streams on unmount", async () => {
    createTestDOM();
    const root = createRoot();
    let clickCount = 0;

    const handlerStream = Stream.make((): void => {
      clickCount++;
    });

    const handle = await runMount(
      h.button({ type: "button", onclick: handlerStream }, "Click me"),
      root,
    );

    await waitForStream();

    const button = root.querySelector("button");
    button?.click();
    assert.equal(clickCount, 1);

    await Effect.runPromise(handle.unmount());

    button?.click();
    assert.equal(clickCount, 1, "Handler should not fire after unmount");
  });
});

// ============================================================================
// AC10: Event Handler Detection
// ============================================================================

describe("AC10: Event Handler Detection", () => {
  it("should detect lowercase event names (onclick, onchange)", async () => {
    createTestDOM();
    const root = createRoot();
    const events: string[] = [];

    await runMount(
      h.div({}, [
        h.button(
          {
            type: "button",
            onclick: () => {
              events.push("click");
            },
          },
          "Button",
        ),
        h.input({
          type: "text",
          onchange: () => {
            events.push("change");
          },
        }),
      ]),
      root,
    );

    const button = root.querySelector("button");
    const input = root.querySelector("input");

    button?.click();
    input?.dispatchEvent(new Event("change"));

    assert.deepEqual(events, ["click", "change"]);
  });

  it("should not treat non-event props as handlers", async () => {
    createTestDOM();
    const root = createRoot();

    // "on" prefix but not followed by lowercase - these should be attributes
    await runMount(
      // oxlint-disable-next-line
      h.div({ onX: "value", on123: "test" }, "Content"),
      root,
    );

    const div = root.querySelector("div");
    // These should be set as attributes, not event handlers
    assert.equal(div?.getAttribute("onX"), "value");
    assert.equal(div?.getAttribute("on123"), "test");
  });
});
