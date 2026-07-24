import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Effect, Stream, SubscriptionRef } from "effect";
import { Boundary, h, List } from "@weftui/core";
import { JSDOM } from "jsdom";
import * as WeftApp from "./weft-app";

// ============================================================================
// Monotonic-append reconcile fast path (AP) — see list-append-fast-path.specs.md.
//
// The fast path is a behavior-preserving optimization of reconcileList: when an
// emission is the previous order plus a new suffix, it skips the prevIndex diff,
// drop-set walk, and LIS, reusing the prefix in place and bulk-inserting the tail
// before the region end marker. It returns the SAME post-reconcile ListState the
// general path would, so these are equivalence/regression guards (green under
// both paths). AP2/AP3/AP6 overlap list.test.ts (KR2/KR3/SC1); this file adds the
// append-detection and non-append-fallthrough cases that suite does not isolate.
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

function itemIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll("li")).map((li) => li.id);
}

describe("List.each: monotonic-append fast path (AP)", () => {
  it("AP1/AP2: appending new keys renders only the tail and leaves the prefix untouched", async () => {
    createTestDOM();
    const root = createRoot();
    const renders = new Map<string, number>();
    const ref = await Effect.runPromise(
      SubscriptionRef.make<readonly Person[]>([p("a"), p("b"), p("c")]),
    );

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) => {
        renders.set(x.id, (renders.get(x.id) ?? 0) + 1);
        return h.li({ id: x.id }, x.name);
      }),
      root,
    );
    await waitForStream();
    const nodeA = root.querySelector("#a");
    const nodeB = root.querySelector("#b");
    const nodeC = root.querySelector("#c");

    // Pure append: same prefix + new tail [d, e].
    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("b"), p("c"), p("d"), p("e")]));
    await waitForStreamUpdate();

    assert.deepEqual(itemIds(root), ["a", "b", "c", "d", "e"]);
    assert.equal(renders.get("d"), 1, "d rendered once");
    assert.equal(renders.get("e"), 1, "e rendered once");
    assert.equal(renders.get("a"), 1, "a not re-rendered");
    assert.equal(renders.get("b"), 1, "b not re-rendered");
    assert.equal(renders.get("c"), 1, "c not re-rendered");
    assert.strictEqual(root.querySelector("#a"), nodeA, "a kept its node");
    assert.strictEqual(root.querySelector("#b"), nodeB, "b kept its node");
    assert.strictEqual(root.querySelector("#c"), nodeC, "c kept its node");
  });

  it("AP1: a single append onto a size-1 list works", async () => {
    createTestDOM();
    const root = createRoot();
    const ref = await Effect.runPromise(SubscriptionRef.make<readonly Person[]>([p("a")]));

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, x.name),
      ),
      root,
    );
    await waitForStream();
    const nodeA = root.querySelector("#a");

    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("b")]));
    await waitForStreamUpdate();

    assert.deepEqual(itemIds(root), ["a", "b"]);
    assert.strictEqual(root.querySelector("#a"), nodeA, "a kept its node");
  });

  it("AP3: after an append, a later reorder reconciles correctly (record-state parity)", async () => {
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

    // Append, then reorder: the reorder only works if the append built the
    // correct identity map for the tail keys.
    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("b"), p("c"), p("d")]));
    await waitForStreamUpdate();
    assert.deepEqual(itemIds(root), ["a", "b", "c", "d"]);
    const nodeC = root.querySelector("#c");

    await Effect.runPromise(SubscriptionRef.set(ref, [p("d"), p("c"), p("b"), p("a")]));
    await waitForStreamUpdate();
    assert.deepEqual(itemIds(root), ["d", "c", "b", "a"]);
    assert.strictEqual(root.querySelector("#c"), nodeC, "c kept its node across the reorder");
  });

  it("AP4: non-append emissions fall through to the general path", async () => {
    createTestDOM();
    const root = createRoot();
    const ref = await Effect.runPromise(
      SubscriptionRef.make<readonly Person[]>([p("a"), p("b"), p("c")]),
    );

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, x.name),
      ),
      root,
    );
    await waitForStream();

    // Mid-insert (grows, but prefix changes at index 1): not an append.
    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("x"), p("b"), p("c")]));
    await waitForStreamUpdate();
    assert.deepEqual(itemIds(root), ["a", "x", "b", "c"]);

    // Reorder (same length): not an append.
    await Effect.runPromise(SubscriptionRef.set(ref, [p("c"), p("b"), p("x"), p("a")]));
    await waitForStreamUpdate();
    assert.deepEqual(itemIds(root), ["c", "b", "x", "a"]);

    // Remove (shrinks): not an append.
    await Effect.runPromise(SubscriptionRef.set(ref, [p("c"), p("a")]));
    await waitForStreamUpdate();
    assert.deepEqual(itemIds(root), ["c", "a"]);

    // Grows but the leading key differs from the previous first key: not an
    // append (prefix mismatch), even though it is longer.
    await Effect.runPromise(SubscriptionRef.set(ref, [p("z"), p("c"), p("a")]));
    await waitForStreamUpdate();
    assert.deepEqual(itemIds(root), ["z", "c", "a"]);
  });

  it("AP5: a tail key duplicating a prefix key still fails with a duplicate-key RenderError", async () => {
    createTestDOM();
    const root = createRoot();
    const ref = await Effect.runPromise(SubscriptionRef.make<readonly Person[]>([p("a"), p("b")]));

    await runMount(
      Boundary.catch({ fallback: (e) => h.div({ id: "fallback" }, (e as Error).message) }, [
        List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
          h.li({ id: x.id }, x.name),
        ),
      ]),
      root,
    );
    await waitForStream();
    assert.deepEqual(itemIds(root), ["a", "b"]);

    // Looks like an append (grows, prefix [a,b] matches) but the tail duplicates
    // prefix key `a`: must be rejected by the duplicate guard, not fast-pathed.
    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("b"), p("a")]));
    await waitForStreamUpdate();

    const fallback = root.querySelector("#fallback");
    assert.ok(fallback, "the boundary should have swapped to its fallback");
    assert.match(fallback.textContent ?? "", /duplicate key/i);
  });

  it("AP6: a prefix item's subscription keeps running across appends", async () => {
    createTestDOM();
    const root = createRoot();
    const counters = new Map<string, SubscriptionRef.SubscriptionRef<number>>();
    for (const id of ["a", "b", "c", "d"]) {
      counters.set(id, await Effect.runPromise(SubscriptionRef.make(0)));
    }
    const listRef = await Effect.runPromise(
      SubscriptionRef.make<readonly Person[]>([p("a"), p("b")]),
    );

    await runMount(
      List.each({ of: SubscriptionRef.changes(listRef), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, [SubscriptionRef.changes(counters.get(x.id)!)]),
      ),
      root,
    );
    await waitForStream();

    await Effect.runPromise(SubscriptionRef.set(counters.get("b")!, 5));
    await waitForStreamUpdate();
    const bNode = root.querySelector("#b");
    assert.equal(bNode?.textContent, "5");

    // Append: b must keep its node and its live subscription.
    await Effect.runPromise(SubscriptionRef.set(listRef, [p("a"), p("b"), p("c"), p("d")]));
    await waitForStreamUpdate();
    assert.deepEqual(itemIds(root), ["a", "b", "c", "d"]);
    assert.strictEqual(root.querySelector("#b"), bNode, "b kept its node across the append");

    await Effect.runPromise(SubscriptionRef.set(counters.get("b")!, 6));
    await waitForStreamUpdate();
    assert.equal(root.querySelector("#b")?.textContent, "6", "b's counter still live after append");
  });

  it("AP2: appended items with their own subscriptions render and stay live", async () => {
    createTestDOM();
    const root = createRoot();
    const cancelled = new Set<string>();
    const itemStream = (id: string) =>
      Stream.concat(Stream.make(id), Stream.never).pipe(
        Stream.ensuring(Effect.sync(() => cancelled.add(id))),
      );
    const ref = await Effect.runPromise(SubscriptionRef.make<readonly Person[]>([p("a")]));

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, [itemStream(x.id)]),
      ),
      root,
    );
    await waitForStream();

    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("b"), p("c")]));
    await waitForStreamUpdate();

    assert.deepEqual(itemIds(root), ["a", "b", "c"]);
    assert.equal(cancelled.size, 0, "no appended or existing subscription was interrupted");
    assert.equal(root.querySelector("#b")?.textContent, "b", "appended b rendered its stream");
    assert.equal(root.querySelector("#c")?.textContent, "c", "appended c rendered its stream");
  });

  it("AP1: an append takes the single-pass fast path (every insert anchored at the region end)", async () => {
    createTestDOM();
    const root = createRoot();
    const ref = await Effect.runPromise(
      SubscriptionRef.make<readonly Person[]>([p("a"), p("b"), p("c")]),
    );

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, x.name),
      ),
      root,
    );
    await waitForStream();

    // Capture the anchor of every DOM insertion the append performs. The fast
    // path inserts each tail range before the one region end marker (a single
    // anchor). The general LIS path anchors each new item to the next one, so
    // it would use one distinct anchor per appended item. This distinguishes
    // the fast path from the behavior-identical general path: if the append
    // fast path is removed, this assertion fails (the DOM result is otherwise
    // the same).
    const original = root.insertBefore.bind(root);
    const anchors: (Node | null)[] = [];
    root.insertBefore = ((node: Node, anchor: Node | null) => {
      anchors.push(anchor);
      return original(node, anchor);
    }) as typeof root.insertBefore;

    // Append d and e (two new keys, so the general path would use two anchors).
    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("b"), p("c"), p("d"), p("e")]));
    await waitForStreamUpdate();
    root.insertBefore = original;

    assert.deepEqual(itemIds(root), ["a", "b", "c", "d", "e"]);
    assert.ok(anchors.length > 0, "the append inserted the tail");
    assert.equal(
      new Set(anchors).size,
      1,
      "all inserts share one anchor (the region end marker): the fast-path signature",
    );
  });
});
