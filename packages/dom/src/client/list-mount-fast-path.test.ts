import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Effect, SubscriptionRef } from "effect";
import { h, List } from "@weftui/core";
import { JSDOM } from "jsdom";
import * as WeftApp from "./weft-app";

// ============================================================================
// First-emission bulk mount fast path (FE) — see list-mount-fast-path.specs.md.
//
// The fast path is a behavior-preserving optimization of `reconcileList`: when a
// reconcile runs against empty previous state it builds the region in one pass
// (no move computation, single-pass insert) and returns the SAME post-mount
// `ListState` the general path would. So these are equivalence/regression
// guards, green against both the general path and the fast path.
//
// FE1/FE2/FE3/FE4/FE5 are already exercised by list.test.ts: every mount there
// starts from a non-empty `SubscriptionRef`, so its first commit already
// reconciles against empty state (the fast-path branch) before any `set(...)`.
// This file adds the cases that suite does not cover: empty->refill re-entry
// (FE6) and fast-path record-state parity at non-trivial scale (FE2).
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
  return await Effect.runPromise(WeftApp.mount(WeftApp.make(), app as never, root));
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const waitForStream = () => waitFor(100);
const waitForStreamUpdate = () => waitFor(150);

interface Person {
  readonly id: string;
  readonly name: string;
}

const p = (id: string, name = id.toUpperCase()): Person => ({ id, name });

/** Ordered `id` attributes of the `<li>` items currently in the DOM. */
function itemIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll("li")).map((li) => li.id);
}

/** Structural snapshot of the region's markers and elements (MR1-style). */
function structure(root: HTMLElement): string[] {
  const tokens: string[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 8) {
      const data = (node as Comment).data.trim();
      if (data.startsWith("stream-start")) tokens.push("region-start");
      else if (data.startsWith("stream-end")) tokens.push("region-end");
      else if (data.startsWith("list-item-start")) tokens.push("item-start");
      else if (data.startsWith("list-item-end")) tokens.push("item-end");
    } else if (node.nodeType === 1) {
      tokens.push(`<${(node as Element).tagName.toLowerCase()}>`);
    }
  }
  return tokens;
}

describe("List.each: first-emission bulk mount fast path (FE)", () => {
  it("FE6: a populated list emptied then refilled re-enters the fast path with fresh items", async () => {
    createTestDOM();
    const root = createRoot();
    const ref = await Effect.runPromise(SubscriptionRef.make<readonly Person[]>([p("a"), p("b")]));

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, x.name),
      ),
      root,
    );
    await waitForStream();
    assert.deepEqual(itemIds(root), ["a", "b"]);

    // Empty it: every item removed, region returns to empty previous state.
    await Effect.runPromise(SubscriptionRef.set(ref, []));
    await waitForStreamUpdate();
    assert.deepEqual(itemIds(root), []);
    assert.deepEqual(structure(root), ["region-start", "region-end"]);

    // Refill: empty previous state -> the mount fast path runs again.
    await Effect.runPromise(SubscriptionRef.set(ref, [p("c"), p("d")]));
    await waitForStreamUpdate();
    assert.deepEqual(itemIds(root), ["c", "d"]);
    assert.deepEqual(structure(root), [
      "region-start",
      "item-start",
      "<li>",
      "item-end",
      "item-start",
      "<li>",
      "item-end",
      "region-end",
    ]);
  });

  it("FE1: a bulk mount of many items yields all item markers in order", async () => {
    createTestDOM();
    const root = createRoot();
    const ids = Array.from({ length: 40 }, (_, i) => `k${i}`);
    const ref = await Effect.runPromise(
      SubscriptionRef.make<readonly Person[]>(ids.map((id) => p(id))),
    );

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, x.name),
      ),
      root,
    );
    await waitForStream();

    assert.deepEqual(itemIds(root), ids);
    assert.equal(
      structure(root).filter((t) => t === "item-start").length,
      40,
      "one item-start marker per row",
    );
  });

  it("FE2: after a fast-path mount, a reorder reuses every retained node (correct identity map)", async () => {
    createTestDOM();
    const root = createRoot();
    const ids = Array.from({ length: 40 }, (_, i) => `k${i}`);
    let renders = 0;
    const ref = await Effect.runPromise(
      SubscriptionRef.make<readonly Person[]>(ids.map((id) => p(id))),
    );

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) => {
        renders++;
        return h.li({ id: x.id }, x.name);
      }),
      root,
    );
    await waitForStream();
    assert.equal(renders, 40, "render once per key on the bulk mount");

    const firstNode = root.querySelector("#k0");
    const lastNode = root.querySelector("#k39");

    // Move the last item to the front: a pure reorder, no adds/removes. This
    // only reconciles correctly if the bulk-built HashMap resolved every key.
    const reordered = [p("k39"), ...ids.slice(0, 39).map((id) => p(id))];
    await Effect.runPromise(SubscriptionRef.set(ref, reordered));
    await waitForStreamUpdate();

    assert.equal(renders, 40, "no re-render on a pure reorder");
    assert.deepEqual(itemIds(root), ["k39", ...ids.slice(0, 39)]);
    assert.strictEqual(root.querySelector("#k0"), firstNode, "k0 kept its node");
    assert.strictEqual(root.querySelector("#k39"), lastNode, "k39 kept its node");
  });

  it("FE2: after a fast-path mount, a combined insert+remove+reorder reconciles correctly", async () => {
    createTestDOM();
    const root = createRoot();
    const ref = await Effect.runPromise(
      SubscriptionRef.make<readonly Person[]>([p("a"), p("b"), p("c"), p("d")]),
    );
    const renders = new Map<string, number>();

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) => {
        renders.set(x.id, (renders.get(x.id) ?? 0) + 1);
        return h.li({ id: x.id }, x.name);
      }),
      root,
    );
    await waitForStream();
    const nodeA = root.querySelector("#a");
    const nodeC = root.querySelector("#c");
    const nodeD = root.querySelector("#d");

    // [a,b,c,d] -> [d,a,e,c]: remove b, insert e, reorder d/a/c.
    await Effect.runPromise(SubscriptionRef.set(ref, [p("d"), p("a"), p("e"), p("c")]));
    await waitForStreamUpdate();

    assert.deepEqual(itemIds(root), ["d", "a", "e", "c"]);
    assert.equal(renders.get("e"), 1, "e rendered once");
    assert.equal(renders.get("a"), 1, "a not re-rendered");
    assert.strictEqual(root.querySelector("#a"), nodeA, "a kept its node");
    assert.strictEqual(root.querySelector("#c"), nodeC, "c kept its node");
    assert.strictEqual(root.querySelector("#d"), nodeD, "d kept its node");
    assert.equal(root.querySelector("#b"), null, "b removed");
  });
});
