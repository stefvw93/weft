import { h } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect, Stream, SubscriptionRef } from "effect";
import { expect, it, vi } from "vite-plus/test";

// Permanent perf guard for issue #169 (loom.specs.md LM27): thousands of
// streamed props sharing one source must conflate their attribute writes
// (latest-value-wins per prop cell), and teardown must stay bounded.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it("LM27: 3,000 tiles x 64 bumps conflate attribute writes; teardown is bounded", async () => {
  const container = document.createElement("div");
  document.body.append(container);

  const generation = Effect.runSync(SubscriptionRef.make(0));
  const changes = SubscriptionRef.changes(generation);
  const view = h.div(
    Array.from({ length: 3_000 }, (_, index) =>
      h.div({
        "data-tile": String(index),
        class: Stream.map(changes, (value) => `tile theme-${value % 4} generation-${value}`),
      }),
    ),
  );

  const app = WeftApp.make();
  const handle = await Effect.runPromise(WeftApp.mount(app, view, container));
  await vi.waitFor(() => expect(container.querySelectorAll(".tile")).toHaveLength(3_000), {
    timeout: 60_000,
  });

  // Count every attribute mutation the burst causes (records are queued per
  // mutation, so this is exact, not sampled).
  let attributeMutations = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        attributeMutations++;
      }
    }
  });
  observer.observe(container, { subtree: true, attributes: true });

  const updateStart = performance.now();
  await Effect.runPromise(
    Effect.forEach(
      Array.from({ length: 64 }, (_, index) => index + 1),
      (value) => SubscriptionRef.set(generation, value),
      { discard: true },
    ),
  );
  await vi.waitFor(() => expect(container.querySelectorAll(".generation-64")).toHaveLength(3_000), {
    timeout: 30_000,
  });
  const updateMs = performance.now() - updateStart;

  await sleep(100);
  observer.disconnect();

  const unmountStart = performance.now();
  await Effect.runPromise(handle.unmount());
  const unmountMs = performance.now() - unmountStart;

  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();

  // Conflation bound: the pre-Loom renderer wrote 3,000 x 64 = 192,000
  // attribute mutations; latest-value-wins must cut that by at least 4x.
  expect(attributeMutations).toBeLessThanOrEqual(3_000 * 16);
  expect(updateMs).toBeLessThan(15_000);
  // Sequential teardown cliff cap only (parallel teardown is follow-up work).
  expect(unmountMs).toBeLessThan(30_000);
}, 180_000);
