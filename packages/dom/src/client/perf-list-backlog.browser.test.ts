import { h, List } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect, SubscriptionRef } from "effect";
import { expect, it, vi } from "vite-plus/test";

// Permanent perf guard for issue #168 (loom.specs.md LM26): a burst of list
// snapshots must conflate to few reconciles (latest-value-wins) instead of
// reconciling every queued snapshot. Structural assertions primary.

interface Row {
  readonly id: number;
}

it("LM26: 200 append snapshots onto 5k rows conflate reconciles and drain fast", async () => {
  const container = document.createElement("div");
  document.body.append(container);

  let rows: readonly Row[] = Array.from({ length: 5_000 }, (_, id) => ({ id }));
  const source = Effect.runSync(SubscriptionRef.make(rows));
  const app = WeftApp.make();
  const handle = await Effect.runPromise(
    WeftApp.mount(
      app,
      h.ul([
        List.each({ of: SubscriptionRef.changes(source), by: (row: Row) => row.id }, (row) =>
          h.li({ "data-row": String(row.id) }, String(row.id)),
        ),
      ]),
      container,
    ),
  );

  await vi.waitFor(() => expect(container.querySelectorAll("li")).toHaveLength(5_000), {
    timeout: 30_000,
  });
  const generationBefore = await Effect.runPromise(handle.commitGeneration);

  const started = performance.now();
  await Effect.runPromise(
    Effect.forEach(
      Array.from({ length: 200 }, (_, update) => update),
      (update) =>
        Effect.suspend(() => {
          rows = [...rows, { id: 5_000 + update }];
          return SubscriptionRef.set(source, rows);
        }),
      { discard: true },
    ),
  );

  await vi.waitFor(() => expect(container.querySelectorAll("li")).toHaveLength(5_200), {
    timeout: 15_000,
  });
  const drainMs = performance.now() - started;
  const generationAfter = await Effect.runPromise(handle.commitGeneration);

  await Effect.runPromise(handle.unmount());
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();

  // Snapshot burst conflates: far fewer committing passes than the 200
  // reconciles the pre-Loom renderer ran (one per queued snapshot).
  expect(generationAfter - generationBefore).toBeLessThanOrEqual(50);
  // Baseline drain for this burst was ~1.3s of serial reconciles; the cap is
  // generous for CI but far below the old worst case.
  expect(drainMs).toBeLessThan(10_000);
}, 120_000);
