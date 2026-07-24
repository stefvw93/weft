import type { Renderable } from "@weftui/core";
import { h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect, Stream, SubscriptionRef } from "effect";
import { expect, it, vi } from "vite-plus/test";

// Permanent perf guard for issue #167 (loom.specs.md LM25): a burst of child
// stream emissions must conflate (latest-value-wins) instead of rendering
// every stale tree. Structural assertions primary; timing caps generous.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deepTree(generation: number, depth: number): Renderable {
  let branch: Renderable = h.span({ "data-generation": String(generation) }, String(generation));
  for (let level = depth; level > 0; level--) {
    branch = h.div({ "data-depth": String(level) }, [branch]);
  }
  return branch;
}

it("LM25: a 200-publish burst into a depth-320 tree conflates commits and drains fast", async () => {
  const container = document.createElement("div");
  document.body.append(container);

  const generation = Effect.runSync(SubscriptionRef.make(0));
  const app = WeftApp.make();
  const handle = await Effect.runPromise(
    WeftApp.mount(
      app,
      h.div([Stream.map(SubscriptionRef.changes(generation), (value) => deepTree(value, 320))]),
      container,
    ),
  );

  await vi.waitFor(() =>
    expect(container.querySelector("[data-generation]")?.textContent).toBe("0"),
  );

  // Record every distinct generation actually committed to the DOM.
  const committed = new Set<string>();
  const observer = new MutationObserver(() => {
    const value = container.querySelector("[data-generation]")?.getAttribute("data-generation");
    if (value !== undefined && value !== null) {
      committed.add(value);
    }
  });
  observer.observe(container, { subtree: true, childList: true, attributes: true });

  const publishStart = performance.now();
  await Effect.runPromise(
    Effect.forEach(
      Array.from({ length: 200 }, (_, index) => index + 1),
      (value) => SubscriptionRef.set(generation, value),
      { discard: true },
    ),
  );

  // The DOM must reach the final generation...
  await vi.waitFor(
    () =>
      expect(container.querySelector("[data-generation]")?.getAttribute("data-generation")).toBe(
        "200",
      ),
    { timeout: 10_000 },
  );
  const drainMs = performance.now() - publishStart;

  // Give the observer a tick to flush its last batch.
  await sleep(50);
  observer.disconnect();

  await Effect.runPromise(handle.unmount());
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();

  // ...via far fewer commits than publishes (baseline before the Loom: 201).
  expect(committed.size).toBeLessThanOrEqual(50);
  // Drain promptly (baseline: ~2s DOM lag; cap is generous for CI).
  expect(drainMs).toBeLessThan(5_000);
}, 60_000);
