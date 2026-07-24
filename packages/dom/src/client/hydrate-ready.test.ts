import * as assert from "node:assert/strict";
import { Effect, Exit, Stream, SubscriptionRef } from "effect";
import { JSDOM } from "jsdom";
import { describe, it } from "vite-plus/test";
import { h, List } from "@weftui/core";
import * as WeftApp from "./weft-app";
import { renderToStringHydratable as _renderToStringHydratable } from "~/server";
import type { Renderable } from "@weftui/core/types";
import { NoRpc } from "../__tests__/rpc-stub";

// These trees contain no `Boundary.rpc`; shadow the SSR fn with the no-op `NoRpc`
// layer pre-provided (it requires an AppRpcClientTag unconditionally).
const renderToStringHydratable = (n: Renderable) =>
  Effect.provide(_renderToStringHydratable(n), NoRpc);

// ============================================================================
// hydrate-ready: interactivity barrier (hydrate-ready.specs.md, AC-R1..R9)
//
// Contract: when `WeftApp.hydrate(WeftApp.make(), app, root)` resolves, every initial reactive region's
// first emission has hydrated and its listeners are attached. These tests use a
// *delayed* first emission so that, without the barrier, a post-resolve dispatch
// would race the fork and be lost.
// ============================================================================

function createTestDOM(): JSDOM {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Comment = dom.window.Comment;
  global.Text = dom.window.Text;
  global.Event = dom.window.Event;
  return dom;
}

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

async function seedServerHtml(app: Renderable): Promise<HTMLElement> {
  const root = createRoot();
  const html = await Effect.runPromise(renderToStringHydratable(app));
  root.innerHTML = html;
  return root;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rejects if `p` does not settle within `ms`: proves the latch can't deadlock. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out: ${label}`)), ms),
    ),
  ]);
}

/** A reactive region whose first emission is `value`, delayed on the client. */
function delayedRegion(value: Renderable, ms = 20): Stream.Stream<Renderable> {
  return Stream.fromEffect(Effect.delay(Effect.succeed(value), `${ms} millis`));
}

// ============================================================================
// AC-R1: interactive on resolve
// ============================================================================

describe("AC-R1: interactive on resolve", () => {
  it("attaches a region's listener before hydrate resolves: first dispatch fires", async () => {
    const dom = createTestDOM();
    let fired = 0;
    const button = h.button(
      {
        onclick: () =>
          Effect.sync(() => {
            fired++;
          }),
      },
      "click",
    );
    const app = h.div({}, [delayedRegion(button)]);
    const root = await seedServerHtml(app);

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    // No wait between resolve and dispatch: the listener must already be live.
    const el = root.querySelector("button");
    assert.ok(el);
    el?.dispatchEvent(new dom.window.Event("click"));
    await waitFor(50);

    assert.equal(fired, 1);
  });
});

// ============================================================================
// AC-R2: no flash / identity preserved (barrier doesn't change adopt output)
// ============================================================================

describe("AC-R2: no flash / identity preserved", () => {
  it("preserves node identity for a clean delayed first emission", async () => {
    createTestDOM();
    const app = h.div({}, [delayedRegion(h.span({}, "hi"))]);
    const root = await seedServerHtml(app);

    const serverSpan = root.querySelector("span");
    assert.ok(serverSpan);
    (serverSpan as unknown as { __sentinel?: boolean }).__sentinel = true;

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    const span = root.querySelector("span");
    assert.equal(span, serverSpan);
    assert.equal((span as unknown as { __sentinel?: boolean }).__sentinel, true);
    assert.equal(span?.textContent, "hi");
  });
});

// ============================================================================
// AC-R3: fast path (fully static page resolves)
// ============================================================================

describe("AC-R3: fast path (no reactive regions)", () => {
  it("resolves for a fully static page (latch already 0 after sentinel)", async () => {
    createTestDOM();
    const app = h.div({ class: "card" }, [h.span({}, "hello")]);
    const root = await seedServerHtml(app);

    await withTimeout(
      Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root)),
      1000,
      "static hydrate",
    );

    assert.equal(root.querySelector("span")?.textContent, "hello");
  });
});

// ============================================================================
// AC-R4: transitive (nested region inside a first emission)
// ============================================================================

describe("AC-R4: transitive nesting", () => {
  it("attaches a nested region's listener before hydrate resolves", async () => {
    const dom = createTestDOM();
    let fired = 0;
    const button = h.button(
      {
        onclick: () =>
          Effect.sync(() => {
            fired++;
          }),
      },
      "click",
    );
    // Outer region's first emission contains an inner region holding the button.
    const inner = delayedRegion(button, 20);
    const outer = delayedRegion(h.div({ id: "wrap" }, [inner]), 20);
    const app = h.section({}, [outer]);
    const root = await seedServerHtml(app);

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    const el = root.querySelector("button");
    assert.ok(el);
    el?.dispatchEvent(new dom.window.Event("click"));
    await waitFor(50);

    assert.equal(fired, 1);
  });
});

// ============================================================================
// AC-R5: list regions
// ============================================================================

describe("AC-R5: keyed list region", () => {
  it("attaches a list item's listener before hydrate resolves", async () => {
    const dom = createTestDOM();
    let fired = 0;
    const items = [{ id: "a" }, { id: "b" }];
    // Delay the list source so the first emission is forked, mirroring AC-R1.
    const source = Stream.fromEffect(
      Effect.delay(Effect.succeed(items as Iterable<{ id: string }>), "20 millis"),
    );
    const app = h.ul({}, [
      List.each({ of: source, by: (x) => x.id }, (x) =>
        h.li(
          {
            id: x.id,
            onclick: () =>
              Effect.sync(() => {
                fired++;
              }),
          },
          x.id,
        ),
      ),
    ]);
    const root = await seedServerHtml(app);

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    const li = root.querySelector("li#a");
    assert.ok(li);
    li?.dispatchEvent(new dom.window.Event("click"));
    await waitFor(50);

    assert.equal(fired, 1);
  });
});

// ============================================================================
// AC-R6: no deadlock (infinite stream)
// ============================================================================

describe("AC-R6: infinite stream does not deadlock", () => {
  it("resolves after the first emission of a never-completing region", async () => {
    createTestDOM();
    const ref = await Effect.runPromise(SubscriptionRef.make(h.span({}, "live")));
    const app = h.div({}, [SubscriptionRef.changes(ref)]);
    const root = await seedServerHtml(app);

    await withTimeout(
      Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root)),
      1000,
      "infinite hydrate",
    );

    assert.equal(root.querySelector("span")?.textContent, "live");
  });
});

// ============================================================================
// AC-R7: no deadlock (empty stream)
// ============================================================================

describe("AC-R7: empty stream does not deadlock", () => {
  it("resolves for a region whose stream emits nothing and completes", async () => {
    createTestDOM();
    const app = h.div({}, [Stream.empty as Stream.Stream<Renderable>]);
    const root = await seedServerHtml(app);

    await withTimeout(
      Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root)),
      1000,
      "empty hydrate",
    );

    // Region hydrates to an empty slot between its markers.
    assert.ok(root.querySelector("div"));
  });
});

// ============================================================================
// AC-R8: errored first emission does not hang
// ============================================================================

describe("AC-R8: errored first emission does not hang", () => {
  it("resolves when a region's first emission fails (settle in ensuring)", async () => {
    createTestDOM();
    const root = createRoot();
    // Hand-seed valid server markup; the client subscription fails on first pull.
    root.innerHTML = "<div><!-- stream-start-1 --><span>x</span><!-- stream-end-1 --></div>";
    const failing = Stream.fromEffect(
      Effect.delay(Effect.fail("boom"), "10 millis"),
    ) as unknown as Stream.Stream<Renderable>;
    const app = h.div({}, [failing]);

    const exit = await withTimeout(
      Effect.runPromiseExit(WeftApp.hydrate(WeftApp.make(), app, root)),
      1000,
      "errored hydrate",
    );

    // The latch releases via `ensuring`; hydrate itself still succeeds.
    assert.ok(Exit.isSuccess(exit));
  });
});

// ============================================================================
// AC-R9: recoverable divergence still settles the latch
// ============================================================================

describe("AC-R9: recoverable divergence settles the latch", () => {
  it("resolves and patches when a delayed first emission diverges", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = "<div><!-- stream-start-1 --><span>OLD</span><!-- stream-end-1 --></div>";
    const app = h.div({}, [delayedRegion(h.span({}, "NEW"))]);

    const originalError = console.error;
    let errorCalls = 0;
    console.error = () => {
      errorCalls++;
    };
    try {
      await withTimeout(
        Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root)),
        1000,
        "divergent hydrate",
      );
      await waitFor(50);
      assert.equal(root.querySelector("span")?.textContent, "NEW");
      assert.equal(errorCalls, 1);
    } finally {
      console.error = originalError;
    }
  });
});

// ============================================================================
// LM13 (loom.specs.md): a region discarded before its first commit settles
// ============================================================================

describe("LM13: a discarded pending region does not hang hydrate", () => {
  it("outer re-emission replacing a pending inner region still resolves", async () => {
    createTestDOM();
    // Inner region's first client value arrives at 500ms; the outer region
    // replaces it at 20ms, discarding the inner cell before its first commit.
    // The barrier must settle via the discard route, far before 500ms.
    const inner = h.div({ class: "inner-host" }, [delayedRegion(h.span({}, "inner"), 500)]);
    const outer = Stream.concat(
      Stream.make<[Renderable]>(inner),
      Stream.fromEffect(Effect.delay(Effect.succeed<Renderable>(h.p({}, "replaced")), "20 millis")),
    );
    const app = h.div({}, [outer]);
    const root = await seedServerHtml(app);

    await withTimeout(
      Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root)),
      400,
      "discarded inner region hydrate",
    );

    await waitFor(50);
    assert.equal(root.querySelector("p")?.textContent, "replaced");
    assert.equal(root.querySelector(".inner-host"), null);
  });
});
