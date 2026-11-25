import { h, List } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { expect, it, onTestFinished, vi } from "vite-plus/test";

// Scale guard for issue #178 (list-mount-fast-path.specs.md FE7): a 10k-row mount
// is structurally correct and stays linear. Structural assertions are primary. The
// timing bound catches superlinear growth only; per-item rendering dominates, so it
// cannot (and does not claim to) detect changes to keyed bookkeeping.

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

it("FE7: 10k static rows mount in order without superlinear cost", async () => {
  const rows: readonly Row[] = Array.from({ length: ROWS }, (_, id) => ({ id }));

  // Baseline: the same 10k rows as plain array children (no keyed region), on
  // this same machine/browser, so the comparison controls for host speed.
  const plainContainer = document.createElement("div");
  document.body.append(plainContainer);
  const plainApp = WeftApp.make();
  onTestFinished(async () => {
    await Effect.runPromise(WeftApp.dispose(plainApp));
    plainContainer.remove();
  });
  const plainStarted = performance.now();
  await Effect.runPromise(
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

  // A static array `of` emits once, so its only commit is a mount.
  const listContainer = document.createElement("div");
  document.body.append(listContainer);
  const listApp = WeftApp.make();
  onTestFinished(async () => {
    await Effect.runPromise(WeftApp.dispose(listApp));
    listContainer.remove();
  });
  const listStarted = performance.now();
  await Effect.runPromise(
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

  // Floored so a very fast baseline cannot make the bound flaky.
  expect(listMs).toBeLessThan(Math.max(plainMs, 50) * 6);
}, 120_000);
