import { h, List } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { expect, it, vi } from "vite-plus/test";

// Permanent perf guard for issue #178 (list-mount-fast-path.specs.md FE7): the
// first emission of a large static `List.each` takes the bulk mount fast path
// (no prevIndex/drop-walk/LIS, single-pass insert) and materializes close to
// plain array children. Structural assertions are primary; a same-run plain-
// children baseline plus a generous absolute cap guard the timing without
// cross-run flakiness.

const ROWS = 10_000;

interface Row {
  readonly id: number;
}

/** Counts ` list-item-start-<id> ` comment markers under `container`. */
function countItemStartMarkers(container: Element): number {
  let count = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node as Comment).data.trim().startsWith("list-item-start")) count++;
  }
  return count;
}

it("FE7: 10k static rows first-render via the bulk mount fast path", async () => {
  const rows: readonly Row[] = Array.from({ length: ROWS }, (_, id) => ({ id }));

  // Baseline: the same 10k rows as plain array children (no keyed region), on
  // this same machine/browser, so the comparison controls for host speed.
  const plainContainer = document.createElement("div");
  document.body.append(plainContainer);
  const plainApp = WeftApp.make();
  const plainStarted = performance.now();
  const plainHandle = await Effect.runPromise(
    WeftApp.mount(
      plainApp,
      h.ul(rows.map((row) => h.li({ "data-row": String(row.id) }, String(row.id)))),
      plainContainer,
    ),
  );
  await vi.waitFor(() => expect(plainContainer.querySelectorAll("li")).toHaveLength(ROWS), {
    timeout: 30_000,
  });
  const plainMs = performance.now() - plainStarted;

  // Fast path: the same 10k rows through `List.each`. A static array `of`
  // emits once, so the first commit reconciles against empty state (the bulk
  // mount branch).
  const listContainer = document.createElement("div");
  document.body.append(listContainer);
  const listApp = WeftApp.make();
  const listStarted = performance.now();
  const listHandle = await Effect.runPromise(
    WeftApp.mount(
      listApp,
      h.ul([
        List.each({ of: rows, by: (row: Row) => row.id }, (row) =>
          h.li({ "data-row": String(row.id) }, String(row.id)),
        ),
      ]),
      listContainer,
    ),
  );
  await vi.waitFor(() => expect(listContainer.querySelectorAll("li")).toHaveLength(ROWS), {
    timeout: 30_000,
  });
  const listMs = performance.now() - listStarted;

  // Structural (primary): every row present, in order, each bracketed by its
  // own per-item start marker.
  const lis = listContainer.querySelectorAll("li");
  expect(lis).toHaveLength(ROWS);
  expect(lis[0]?.getAttribute("data-row")).toBe("0");
  expect(lis[ROWS - 1]?.getAttribute("data-row")).toBe(String(ROWS - 1));
  expect(countItemStartMarkers(listContainer)).toBe(ROWS);

  await Effect.runPromise(listHandle.unmount());
  await Effect.runPromise(WeftApp.dispose(listApp));
  await Effect.runPromise(plainHandle.unmount());
  await Effect.runPromise(WeftApp.dispose(plainApp));
  listContainer.remove();
  plainContainer.remove();

  // Generous absolute cap: catches a catastrophic regression to per-item
  // immutable-HashSet + LIS work on 10k rows.
  expect(listMs).toBeLessThan(20_000);
  // Same-run ratio: DOM-node creation dominates both mounts, so the keyed
  // fast path should stay within a small multiple of plain children. The 6x
  // bound is deliberately generous for CI noise while still catching a return
  // to the full reconcile walk. Guarded against a tiny/zero baseline.
  if (plainMs >= 50) {
    expect(listMs).toBeLessThan(plainMs * 6);
  }
}, 120_000);
