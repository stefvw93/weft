import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Effect, Queue, Stream } from "effect";
import { Boundary, h } from "@weftui/core";
import { JSDOM } from "jsdom";
import * as WeftApp from "./weft-app";
import { renderToStringHydratable as _renderToStringHydratable } from "~/server/render-to-string";
import type { Renderable } from "@weftui/core/types";
import { NoRpc } from "../__tests__/rpc-stub";

// These trees contain no `Boundary.rpc`; shadow the SSR fn with the no-op `NoRpc`
// layer pre-provided (it requires an AppRpcClientTag unconditionally).
const renderToStringHydratable = (n: Renderable) =>
  Effect.provide(_renderToStringHydratable(n), NoRpc);

// ============================================================================
// Test Helpers
// ============================================================================

function createTestDOM() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Comment = dom.window.Comment;
  global.Text = dom.window.Text;
  return dom;
}

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  return root;
}

async function runMount(app: unknown, root: HTMLElement) {
  return Effect.runPromise(WeftApp.mount(WeftApp.make(), app as never, root));
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Collect all Comment nodes in a subtree. */
function getComments(el: Element): Comment[] {
  const result: Comment[] = [];
  const walker = document.createTreeWalker(el, 128 /* NodeFilter.SHOW_COMMENT */);
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    result.push(node as Comment);
  }
  return result;
}

/** Suspense-marker comments only. */
function getSuspenseComments(el: Element): Comment[] {
  return getComments(el).filter((c) => c.data.includes("suspense"));
}

// ============================================================================
// AC1: Synchronous children — no fallback rendered
// ============================================================================

describe("AC1: Synchronous children — no fallback rendered", () => {
  it("renders children directly without fallback or suspense markers", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Loading") }, [
        h.div({ class: "content" }, "Hello"),
      ]),
      root,
    );

    // Children are present
    assert.ok(root.querySelector(".content"), "Children should be in the DOM");
    assert.equal(root.querySelector(".content")?.textContent, "Hello");

    // Fallback is absent
    assert.equal(root.querySelector(".fallback"), null, "Fallback must not be rendered");

    // No suspense comment markers
    assert.equal(getSuspenseComments(root).length, 0, "No suspense markers should exist");
  });

  it("renders multiple sync children without markers", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      Boundary.suspend({ fallback: h.span({}, "Loading") }, [
        h.div({ class: "a" }, "A"),
        h.div({ class: "b" }, "B"),
      ]),
      root,
    );

    assert.ok(root.querySelector(".a"));
    assert.ok(root.querySelector(".b"));
    assert.equal(getSuspenseComments(root).length, 0);
  });
});

// ============================================================================
// AC2: Single async child — fallback shown, then swap
// ============================================================================

describe("AC2: Single async child — fallback shown, then swap", () => {
  it("shows fallback while pending, then swaps to resolved content", async () => {
    createTestDOM();
    const root = createRoot();

    function AsyncChild() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.p({ class: "resolved" }, "Done")), 150),
          ),
      );
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Loading") }, [AsyncChild()]),
      root,
    );

    // Fallback visible immediately
    assert.ok(root.querySelector(".fallback"), "Fallback must be shown while pending");
    assert.equal(root.querySelector(".resolved"), null, "Resolved content must not be present yet");

    // Suspense markers bracket the fallback
    const markersBefore = getSuspenseComments(root);
    assert.equal(markersBefore.length, 2, "Start and end markers must be in DOM while pending");

    // After child resolves
    await waitFor(250);
    assert.equal(root.querySelector(".fallback"), null, "Fallback must be removed after settle");
    assert.ok(root.querySelector(".resolved"), "Resolved content must be in DOM");

    // Markers cleaned up
    assert.equal(
      getSuspenseComments(root).length,
      0,
      "Suspense markers must be removed after swap",
    );
  });

  it("subsequent stream emissions update the resolved content normally", async () => {
    createTestDOM();
    const root = createRoot();

    // V1 at +100ms; V2 at +100ms+200ms = +300ms.
    // Check V1 at +160ms (after swap, before V2 replaces it).
    function AsyncChild() {
      return Stream.callback<unknown>((queue) =>
        Effect.sync(() => {
          setTimeout(() => {
            Queue.offerUnsafe(queue, h.span({ class: "v1" }, "V1"));
            setTimeout(() => {
              Queue.offerUnsafe(queue, h.span({ class: "v2" }, "V2"));
              Queue.endUnsafe(queue);
            }, 200); // 200ms gap so V1 is observable before V2 replaces it
          }, 100);
        }),
      );
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Loading") }, [AsyncChild()]),
      root,
    );

    // Pending
    assert.ok(root.querySelector(".fallback"));

    // After first emission (+160ms) — fallback swapped out, V1 visible
    await waitFor(160);
    assert.equal(root.querySelector(".fallback"), null, "Fallback removed after first emission");
    assert.ok(root.querySelector(".v1"), "First emission content should be visible");

    // After second emission (+380ms total) — V2 replaces V1, no fallback re-shown
    await waitFor(220);
    assert.ok(root.querySelector(".v2"), "Second emission should update content");
    assert.equal(
      root.querySelector(".fallback"),
      null,
      "Fallback not re-shown for subsequent emissions",
    );
    assert.equal(root.querySelector(".v1"), null, "First value replaced by second");
  });
});

// ============================================================================
// AC3: Multiple async siblings — shared fallback, single swap
// ============================================================================

describe("AC3: Multiple async siblings — shared fallback, single swap", () => {
  it("keeps fallback until ALL siblings have settled", async () => {
    createTestDOM();
    const root = createRoot();

    function FastChild() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.span({ class: "fast" }, "Fast")), 80),
          ),
      );
    }

    function SlowChild() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.span({ class: "slow" }, "Slow")), 250),
          ),
      );
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Loading") }, [
        FastChild(),
        SlowChild(),
      ]),
      root,
    );

    // Both pending → fallback visible
    assert.ok(root.querySelector(".fallback"), "Fallback shown while both pending");

    // Fast settles (80ms) → fallback still shown (slow still pending)
    await waitFor(130);
    assert.ok(root.querySelector(".fallback"), "Fallback must persist until ALL children settle");
    assert.equal(root.querySelector(".fast"), null, "Fast child not yet in live DOM");
    assert.equal(root.querySelector(".slow"), null, "Slow child not yet in live DOM");

    // Slow settles (250ms) → both inserted, fallback removed, single swap
    await waitFor(200);
    assert.equal(root.querySelector(".fallback"), null, "Fallback removed after all settle");
    assert.ok(root.querySelector(".fast"), "Fast child visible after swap");
    assert.ok(root.querySelector(".slow"), "Slow child visible after swap");
    assert.equal(getSuspenseComments(root).length, 0, "Markers cleaned up");
  });

  it("swap is atomic — all resolved children appear simultaneously", async () => {
    createTestDOM();
    const root = createRoot();

    const snapshots: string[] = [];

    function ChildA() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.span({ class: "a" }, "A")), 100),
          ),
      );
    }

    function ChildB() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.span({ class: "b" }, "B")), 200),
          ),
      );
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Loading") }, [
        ChildA(),
        ChildB(),
      ]),
      root,
    );

    // Poll at intermediate point — A settled but B hasn't
    await waitFor(150);
    snapshots.push(root.textContent ?? "");

    // After both settled
    await waitFor(150);
    snapshots.push(root.textContent ?? "");

    // At 150ms: fallback still showing, A not yet visible
    assert.ok(snapshots[0]?.includes("Loading"), "Fallback still at 150ms");
    assert.ok(!snapshots[0]?.includes("A"), "A not yet visible at 150ms");

    // After swap: both visible
    assert.ok(snapshots[1]?.includes("A"), "A visible after swap");
    assert.ok(snapshots[1]?.includes("B"), "B visible after swap");
    assert.ok(!snapshots[1]?.includes("Loading"), "Fallback gone after swap");
  });
});

// ============================================================================
// AC4: Nested Suspense — independent boundaries
// ============================================================================

describe("AC4: Nested Suspense — independent boundaries", () => {
  it("inner boundary resolves independently of outer boundary", async () => {
    createTestDOM();
    const root = createRoot();

    function InnerChild() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.p({ class: "inner-done" }, "Inner")), 100),
          ),
      );
    }

    function OuterChild() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.p({ class: "outer-done" }, "Outer")), 300),
          ),
      );
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "outer-fallback" }, "Outer Loading") }, [
        OuterChild(),
        Boundary.suspend({ fallback: h.span({ class: "inner-fallback" }, "Inner Loading") }, [
          InnerChild(),
        ]),
      ]),
      root,
    );

    // Both pending initially
    assert.ok(root.querySelector(".outer-fallback"), "Outer fallback shown initially");

    // After 150ms: inner should have resolved (100ms), outer still pending
    await waitFor(150);
    // Outer fallback still showing (outer child not settled yet)
    assert.ok(root.querySelector(".outer-fallback"), "Outer fallback persists until outer settles");

    // After 350ms: outer settled
    await waitFor(200);
    assert.equal(root.querySelector(".outer-fallback"), null, "Outer fallback gone");
    assert.ok(root.querySelector(".outer-done"), "Outer resolved content visible");
    // Inner should be resolved too
    assert.ok(root.querySelector(".inner-done"), "Inner resolved content visible");
    assert.equal(root.querySelector(".inner-fallback"), null, "Inner fallback gone");
  });

  it("outer has no direct async children — outer fast-paths while inner shows its fallback", async () => {
    createTestDOM();
    const root = createRoot();

    function InnerChild() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.p({ class: "inner-done" }, "Inner")), 150),
          ),
      );
    }

    await runMount(
      // Outer has only sync children (inner Suspense is not an async component)
      Boundary.suspend({ fallback: h.span({ class: "outer-fallback" }, "Outer Loading") }, [
        h.span({ class: "sync" }, "Sync"),
        Boundary.suspend({ fallback: h.span({ class: "inner-fallback" }, "Inner Loading") }, [
          InnerChild(),
        ]),
      ]),
      root,
    );

    // Outer fast-paths (no direct async children), no outer fallback
    assert.equal(root.querySelector(".outer-fallback"), null, "Outer must not show fallback");
    // Inner fallback is shown (inner has async child)
    assert.ok(root.querySelector(".inner-fallback"), "Inner fallback shown");

    await waitFor(250);
    assert.ok(root.querySelector(".inner-done"), "Inner resolved");
    assert.equal(root.querySelector(".inner-fallback"), null, "Inner fallback gone");
  });
});

// ============================================================================
// AC5: Null / falsy fallback — only markers while pending
// ============================================================================

describe("AC5: Null fallback — only markers while pending", () => {
  it("shows only comment markers when fallback is null", async () => {
    createTestDOM();
    const root = createRoot();

    function AsyncChild() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.p({ class: "done" }, "Done")), 100),
          ),
      );
    }

    await runMount(Boundary.suspend({ fallback: null }, [AsyncChild()]), root);

    // Only markers, no visible content
    assert.equal(
      root.textContent?.trim(),
      "",
      "No visible content while pending with null fallback",
    );
    const markers = getSuspenseComments(root);
    assert.equal(markers.length, 2, "Comment markers present");

    // Swap still happens
    await waitFor(200);
    assert.ok(root.querySelector(".done"), "Resolved content visible after swap");
    assert.equal(getSuspenseComments(root).length, 0, "Markers cleaned up");
  });

  it("shows only comment markers when fallback is undefined (omitted)", async () => {
    createTestDOM();
    const root = createRoot();

    function AsyncChild() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.p({ class: "done" }, "Done")), 100),
          ),
      );
    }

    await runMount(Boundary.suspend({}, [AsyncChild()]), root);

    assert.equal(root.textContent?.trim(), "", "No visible content");
    assert.equal(getSuspenseComments(root).length, 2);

    await waitFor(200);
    assert.ok(root.querySelector(".done"));
  });
});

// ============================================================================
// AC6: Effect<ElementDescriptor> component triggers suspension
// ============================================================================

describe("AC6: Function component returning Effect<ElementDescriptor> triggers suspension", () => {
  it("register is called before Effect runs, settle called exactly once", async () => {
    createTestDOM();
    const root = createRoot();

    // Verify register/settle contract through observable boundary behaviour:
    // - register fires  → boundary becomes pending → fallback shown immediately
    // - settle fires    → boundary swaps once       → fallback gone, content visible
    // (SuspenseContext is internal; direct call-count injection would require
    //  exposing test seams not present in the current API.)
    function EffectChild() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) => {
            setTimeout(() => resolve(h.span({ class: "content" }, "OK")), 100);
          }),
      );
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Waiting") }, [EffectChild()]),
      root,
    );

    // register happened → boundary is pending → fallback shown
    assert.ok(root.querySelector(".fallback"), "Boundary must be pending (register was called)");

    await waitFor(200);
    // settle happened → boundary swapped exactly once
    assert.equal(root.querySelector(".fallback"), null, "Boundary must settle (settle was called)");
    assert.ok(root.querySelector(".content"), "Resolved content visible after settle");
  });

  it("settle fires exactly once — two Effect siblings each settle independently", async () => {
    createTestDOM();
    const root = createRoot();

    // If register/settle were broken (e.g. settle called twice for one child, or
    // register skipped for a child), the boundary counter would be wrong and the
    // swap would fire at the wrong time.  Two children with different delays makes
    // any register/settle count mismatch observable as a premature or missed swap.
    function ChildA() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.span({ class: "a" }, "A")), 80),
          ),
      );
    }

    function ChildB() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.span({ class: "b" }, "B")), 200),
          ),
      );
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Waiting") }, [
        ChildA(),
        ChildB(),
      ]),
      root,
    );

    // Both registered → boundary pending
    assert.ok(root.querySelector(".fallback"), "Pending while both children are unresolved");

    // ChildA settled (80ms) but ChildB hasn't — swap must NOT have fired yet.
    // If settle were called twice for ChildA, pendingCount would go to -1 (≤0)
    // and allSettled would fire prematurely.
    await waitFor(130);
    assert.ok(
      root.querySelector(".fallback"),
      "Fallback persists — ChildA settling must not trigger swap while ChildB is pending",
    );

    // Both settled → single swap
    await waitFor(150);
    assert.equal(root.querySelector(".fallback"), null, "Fallback gone after both settle");
    assert.ok(root.querySelector(".a"), "ChildA content visible");
    assert.ok(root.querySelector(".b"), "ChildB content visible");
    assert.equal(getSuspenseComments(root).length, 0, "Markers cleaned up");
  });
});

// ============================================================================
// AC7: Stream<ElementDescriptor> component — settle on first emission
// ============================================================================

describe("AC7: Function component returning Stream<ElementDescriptor> triggers suspension", () => {
  it("settle called on first emission; subsequent emissions do not re-show fallback", async () => {
    createTestDOM();
    const root = createRoot();

    // Stream that emits multiple values over time
    function StreamChild() {
      return Stream.callback<unknown>((queue) =>
        Effect.sync(() => {
          setTimeout(() => Queue.offerUnsafe(queue, h.span({ class: "v1" }, "V1")), 100);
          setTimeout(() => Queue.offerUnsafe(queue, h.span({ class: "v2" }, "V2")), 250);
          setTimeout(() => Queue.endUnsafe(queue), 300);
        }),
      );
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Waiting") }, [StreamChild()]),
      root,
    );

    // Pending
    assert.ok(root.querySelector(".fallback"), "Fallback shown before first emission");

    // After first emission (100ms) — swap
    await waitFor(160);
    assert.equal(root.querySelector(".fallback"), null, "Fallback removed on first emission");
    assert.ok(root.querySelector(".v1"), "First value visible");

    // Second emission (250ms) — reactive update, no fallback re-shown
    await waitFor(200);
    assert.ok(root.querySelector(".v2"), "Second emission updates content");
    assert.equal(
      root.querySelector(".fallback"),
      null,
      "Fallback not re-shown for subsequent emissions",
    );
    assert.equal(root.querySelector(".v1"), null, "First value replaced");
  });
});

// ============================================================================
// AC8: Non-component reactive values do NOT trigger suspension
// ============================================================================

describe("AC8: Non-component reactive values do not trigger suspension", () => {
  it("inline stream child does not register with Suspense", async () => {
    createTestDOM();
    const root = createRoot();

    // A stream used as an inline child (not via a function component)
    const inlineStream = Stream.callback<string>((queue) =>
      Effect.sync(() => {
        setTimeout(() => {
          Queue.offerUnsafe(queue, "Hello");
          Queue.endUnsafe(queue);
        }, 100);
      }),
    );

    // AsyncComponent DOES trigger suspension
    function AsyncComponent() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.span({ class: "async" }, "Async")), 200),
          ),
      );
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Waiting") }, [
        h.div({}, [inlineStream]),
        AsyncComponent(),
      ]),
      root,
    );

    // The boundary waits only for AsyncComponent (not the inline stream)
    // Fallback shown while AsyncComponent is pending (200ms)
    assert.ok(root.querySelector(".fallback"), "Boundary pending because of AsyncComponent");

    // At 150ms: inlineStream has emitted but AsyncComponent hasn't settled yet
    await waitFor(150);
    assert.ok(root.querySelector(".fallback"), "Fallback still shown (AsyncComponent not settled)");

    // At 300ms: AsyncComponent settled → swap
    await waitFor(150);
    assert.equal(
      root.querySelector(".fallback"),
      null,
      "Fallback gone after AsyncComponent settles",
    );
    assert.ok(root.querySelector(".async"), "Async content visible");
  });

  it("stream prop on element does not trigger suspension", async () => {
    createTestDOM();
    const root = createRoot();

    const classStream = Stream.callback<string>((queue) =>
      Effect.sync(() => {
        setTimeout(() => {
          Queue.offerUnsafe(queue, "active");
          Queue.endUnsafe(queue);
        }, 50);
      }),
    );

    // Without any async function component child, the boundary should fast-path
    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Waiting") }, [
        h.div({ class: classStream }, "Content"),
      ]),
      root,
    );

    // No async function component → fast path → no fallback
    assert.equal(root.querySelector(".fallback"), null, "Stream prop must not trigger suspension");
    assert.ok(root.querySelector("div"), "Content rendered directly");
  });
});

// ============================================================================
// AC9: Scope close while pending — clean interruption
// ============================================================================

describe("AC9: Scope close while pending — clean interruption", () => {
  it("unmount while pending interrupts swap fiber without error", async () => {
    createTestDOM();
    const root = createRoot();

    function NeverSettles() {
      // An Effect that never resolves
      return Effect.never as unknown as Effect.Effect<unknown>;
    }

    const handle = await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Forever loading") }, [
        NeverSettles(),
      ]),
      root,
    );

    // Boundary is pending
    assert.ok(root.querySelector(".fallback"), "Boundary pending");

    // Unmount — must not throw
    await assert.doesNotReject(
      () => Effect.runPromise(handle.unmount()),
      "Unmounting while Suspense is pending must not throw",
    );
  });

  it("unmount while pending does not cause error after timeout", async () => {
    createTestDOM();
    const root = createRoot();

    function SlowChild() {
      return Effect.promise(
        () => new Promise<unknown>((resolve) => setTimeout(() => resolve(h.span({}, "Done")), 500)),
      );
    }

    const handle = await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Loading") }, [SlowChild()]),
      root,
    );

    // Unmount at 100ms (before child settles at 500ms)
    await waitFor(100);
    await Effect.runPromise(handle.unmount());

    // Wait past when the child would have settled — no error
    await waitFor(500);
    assert.ok(true, "No error after scope-close interrupts the pending boundary");
  });
});

// ============================================================================
// AC10: Sentinel prevents premature settlement
// ============================================================================

describe("AC10: Sentinel prevents premature settlement", () => {
  it("fast-resolving child does not trigger swap before siblings register", async () => {
    createTestDOM();
    const root = createRoot();

    // FastChild resolves synchronously via Effect.sync
    function FastChild() {
      return Effect.sync(() => h.span({ class: "fast" }, "Fast"));
    }

    // SlowChild is genuinely async
    function SlowChild() {
      return Effect.promise(
        () =>
          new Promise<unknown>((resolve) =>
            setTimeout(() => resolve(h.span({ class: "slow" }, "Slow")), 150),
          ),
      );
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Loading") }, [
        FastChild(),
        SlowChild(),
      ]),
      root,
    );

    // Despite FastChild being very fast, boundary should be pending
    // (SlowChild is still registered but not settled)
    assert.ok(
      root.querySelector(".fallback"),
      "Fallback shown — sentinel prevented premature swap",
    );

    await waitFor(250);
    // Both should now be resolved
    assert.equal(root.querySelector(".fallback"), null, "Fallback gone after all settle");
    assert.ok(root.querySelector(".fast"), "Fast child visible");
    assert.ok(root.querySelector(".slow"), "Slow child visible");
  });

  it("boundary with only sync children fast-paths immediately (no fallback ever shown)", async () => {
    createTestDOM();
    const root = createRoot();

    function SyncChild() {
      return h.span({ class: "sync" }, "Sync");
    }

    await runMount(
      Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Loading") }, [SyncChild()]),
      root,
    );

    // Sentinel released with no async children → allSettled fires → fast path
    assert.equal(root.querySelector(".fallback"), null, "No fallback for sync-only children");
    assert.ok(root.querySelector(".sync"), "Sync child rendered directly");
    assert.equal(getSuspenseComments(root).length, 0, "No markers for sync-only boundary");
  });
});

// ============================================================================
// Round-trip: SSR → patch execution → hydrate
// ============================================================================

describe("Round-trip: SSR → patch script → hydrate", () => {
  /**
   * Verifies the complete integration path:
   * 1. `renderToStringHydratable` emits fallback + comment markers + patch template/script
   * 2. JSDOM with `runScripts:"dangerously"` executes the patch script (simulates browser)
   * 3. Patch script replaces the fallback with the resolved children (stream markers intact)
   * 4. `hydrate` adopts the resolved DOM — no HydrationMismatchError, no flicker
   */
  it("SSR emits fallback+patch; script resolves DOM; hydrate adopts without mismatch", async () => {
    // A component that returns an async Effect — triggers SSR suspension in renderToStreamHydratable.
    function Card() {
      return Effect.gen(function* () {
        yield* Effect.sleep("1 millis"); // ensures async path for SSR stream markers (v4 runs sleep(0) synchronously)
        return yield* h.div({ class: "card" }, "Card content");
      });
    }

    const app = Boundary.suspend({ fallback: h.span({ class: "fallback" }, "Loading") }, [Card()]);

    // ── 1. SSR ───────────────────────────────────────────────────────────────
    const ssrHtml = await Effect.runPromise(renderToStringHydratable(app));

    assert.ok(ssrHtml.includes("<!-- suspense-start-1 -->"), "SSR: start marker emitted");
    assert.ok(ssrHtml.includes("<!-- suspense-end-1 -->"), "SSR: end marker emitted");
    assert.ok(ssrHtml.includes("Loading"), "SSR: fallback in initial HTML");
    assert.ok(ssrHtml.includes('<template id="ef-s-1">'), "SSR: patch template emitted");
    assert.ok(ssrHtml.includes("Card content"), "SSR: resolved content inside patch template");
    // Stream markers wrap the async child's content inside the patch template
    assert.ok(ssrHtml.includes("stream-start-"), "SSR: stream markers inside patch (for hydrate)");

    // ── 2. Inject into JSDOM and run scripts ─────────────────────────────────
    // Wrap the SSR fragment in a full page so JSDOM can execute inline scripts.
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body><div id="root">${ssrHtml}</div></body></html>`,
      { runScripts: "dangerously" },
    );

    // Point Node globals to the JSDOM window so DOM APIs in WeftApp.hydrate(WeftApp.make(), ) work.
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Comment = dom.window.Comment;
    global.Text = dom.window.Text;

    const root = dom.window.document.getElementById("root") as HTMLElement;

    // ── 3. Verify DOM is resolved after script execution ──────────────────────
    assert.equal(root.querySelector(".fallback"), null, "Fallback removed by patch script");
    assert.ok(root.querySelector(".card"), "Resolved content present in DOM");
    // Template element was removed by the script
    assert.equal(
      root.querySelector('template[id^="ef-s-"]'),
      null,
      "Template element removed by patch script",
    );
    // No suspense markers remain (they were cleaned up by the script)
    const suspenseComments = getComments(root).filter((c) => c.data.includes("suspense"));
    assert.equal(suspenseComments.length, 0, "No suspense comment markers remain");
    // Stream markers from the resolved children ARE still present (hydrate needs them)
    const streamComments = getComments(root).filter((c) => c.data.includes("stream-"));
    assert.ok(streamComments.length >= 2, "Stream-region markers present for hydrate");

    // ── 4. Hydrate — must adopt the resolved DOM without mismatch errors ──────
    // hydrate walks the JSX tree, sees the Boundary.suspend node, treats it as transparent
    // (boundary already resolved), and hydrates the children against the DOM.
    const handle = await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    // DOM structure unchanged after hydration (node identity preserved)
    assert.ok(root.querySelector(".card"), "Card still in DOM after hydrate");
    assert.equal(root.querySelector(".fallback"), null, "No fallback after hydrate");

    await Effect.runPromise(handle.unmount());
  });

  it("nested boundaries: both patches resolve; hydrate adopts both", async () => {
    function Inner() {
      return Effect.succeed(h.p({ class: "inner-content" }, "Inner resolved"));
    }
    function Outer() {
      return Effect.succeed(
        h.div({ class: "outer-content" }, [
          Boundary.suspend({ fallback: h.span({ class: "inner-fallback" }, "Inner loading") }, [
            Inner(),
          ]),
        ]),
      );
    }

    const app = Boundary.suspend(
      { fallback: h.span({ class: "outer-fallback" }, "Outer loading") },
      [Outer()],
    );

    // SSR
    const ssrHtml = await Effect.runPromise(renderToStringHydratable(app));
    assert.ok(ssrHtml.includes('<template id="ef-s-1">'), "outer patch present");
    assert.ok(ssrHtml.includes('<template id="ef-s-2">'), "inner patch present");

    // Inject and run scripts
    const dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body><div id="root">${ssrHtml}</div></body></html>`,
      { runScripts: "dangerously" },
    );
    global.document = dom.window.document as unknown as Document;
    global.HTMLElement = dom.window.HTMLElement;
    global.Comment = dom.window.Comment;
    global.Text = dom.window.Text;

    const root = dom.window.document.getElementById("root") as HTMLElement;

    // Both boundaries resolved
    assert.equal(root.querySelector(".outer-fallback"), null, "Outer fallback removed");
    assert.equal(root.querySelector(".inner-fallback"), null, "Inner fallback removed");
    assert.ok(root.querySelector(".inner-content"), "Inner content present");
    assert.equal(root.querySelectorAll('template[id^="ef-s-"]').length, 0, "All templates removed");

    // Hydrate
    const handle = await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));
    assert.ok(root.querySelector(".inner-content"), "Inner content still present after hydrate");

    await Effect.runPromise(handle.unmount());
  });
});
