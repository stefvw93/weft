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

// Permanent append-cost guard for issue #171 (#168 residual,
// list-append-fast-path.specs.md AP7): appending K rows to an N-row list in one
// emission takes the monotonic-append fast path. Only the K new item ranges are
// inserted; none of the N existing rows are moved. Structural (DOM-op count +
// node identity) is primary; the timing cap is generous.
it("AP7: appending K rows to an N-row list touches only the K new ranges", async () => {
  const N = 5_000;
  const K = 100;
  const container = document.createElement("div");
  document.body.append(container);

  const rows: Row[] = Array.from({ length: N }, (_, id) => ({ id }));
  const source = Effect.runSync(SubscriptionRef.make<readonly Row[]>(rows));
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

  await vi.waitFor(() => expect(container.querySelectorAll("li")).toHaveLength(N), {
    timeout: 30_000,
  });

  // Sample prefix nodes to prove they are moved neither in the DOM tree nor
  // recreated by the append.
  const firstBefore = container.querySelector('li[data-row="0"]');
  const lastBefore = container.querySelector(`li[data-row="${N - 1}"]`);

  // Count DOM insertions the append performs on the list container. Item ranges
  // are inserted before the region end marker, whose parent is the <ul>.
  const ul = container.querySelector("ul") as HTMLUListElement;
  const originalInsert = ul.insertBefore.bind(ul);
  let inserts = 0;
  const anchors: (Node | null)[] = [];
  ul.insertBefore = ((node: Node, anchor: Node | null) => {
    inserts++;
    anchors.push(anchor);
    return originalInsert(node, anchor);
  }) as typeof ul.insertBefore;

  // Single emission: previous order unchanged, K new keys appended.
  const appended: readonly Row[] = [
    ...rows,
    ...Array.from({ length: K }, (_, i) => ({ id: N + i })),
  ];
  const started = performance.now();
  await Effect.runPromise(SubscriptionRef.set(source, appended));
  await vi.waitFor(() => expect(container.querySelectorAll("li")).toHaveLength(N + K), {
    timeout: 15_000,
  });
  const appendMs = performance.now() - started;

  const ids = Array.from(container.querySelectorAll("li")).map((li) => li.getAttribute("data-row"));
  // Same node objects as before the append: the prefix was neither recreated
  // nor moved out and back.
  const firstAfter = container.querySelector('li[data-row="0"]');
  const lastAfter = container.querySelector(`li[data-row="${N - 1}"]`);

  await Effect.runPromise(handle.unmount());
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();

  // Order is correct end to end.
  expect(ids[0]).toBe("0");
  expect(ids[N - 1]).toBe(String(N - 1));
  expect(ids[N + K - 1]).toBe(String(N + K - 1));
  // Prefix node identity preserved.
  expect(firstAfter).toBe(firstBefore);
  expect(lastAfter).toBe(lastBefore);
  // Cost is proportional to K, not N: each appended item inserts its 3-node
  // range (start marker, <li>, end marker); no existing row is re-inserted.
  expect(inserts).toBeLessThanOrEqual(K * 3);
  expect(inserts).toBeLessThan(N);
  // Fast-path signature: every tail range is inserted before the single region
  // end marker (one anchor). The behavior-identical general LIS path anchors
  // each new item to the next one (K distinct anchors), so a single distinct
  // anchor is what proves the append fast path actually ran (and fails if it is
  // removed, which the DOM-op count and timing alone cannot detect).
  expect(new Set(anchors).size).toBe(1);
  // Generous timing cap: a full O(N) diff+LIS on 5k rows would be far slower.
  expect(appendMs).toBeLessThan(5_000);
}, 120_000);
