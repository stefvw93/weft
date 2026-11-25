import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Effect, Schedule, Stream, SubscriptionRef } from "effect";
import { h, List } from "@weftui/core";
import { JSDOM } from "jsdom";
import * as WeftApp from "./weft-app";

// ============================================================================
// Mounting against empty previous state (FE): see list-mount-fast-path.specs.md.
//
// Mounts skip the drop and move passes but must leave the same state behind as
// any other reconcile. FE1-FE5 are also exercised throughout list.test.ts; this
// file adds empty-to-refill re-entry (FE6), parity at scale (FE2), and scope
// cleanup after a failed render (FE8).
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

describe("List.each: mount against empty state (FE)", () => {
  it("FE6: a populated list emptied then refilled mounts fresh items", async () => {
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

    // Refill: empty previous state, so this is a mount again.
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

  it("FE1: a mount of many items yields all item markers in order", async () => {
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

  it("FE2: after a mount, a reorder reuses every retained node (correct identity map)", async () => {
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
    assert.equal(renders, 40, "render once per key on mount");

    const firstNode = root.querySelector("#k0");
    const lastNode = root.querySelector("#k39");

    // Move the last item to the front: a pure reorder, no adds/removes. This
    // only reconciles correctly if the mount's HashMap resolved every key.
    const reordered = [p("k39"), ...ids.slice(0, 39).map((id) => p(id))];
    await Effect.runPromise(SubscriptionRef.set(ref, reordered));
    await waitForStreamUpdate();

    assert.equal(renders, 40, "no re-render on a pure reorder");
    assert.deepEqual(itemIds(root), ["k39", ...ids.slice(0, 39)]);
    assert.strictEqual(root.querySelector("#k0"), firstNode, "k0 kept its node");
    assert.strictEqual(root.querySelector("#k39"), lastNode, "k39 kept its node");
  });

  it("FE2: after a mount, a combined insert+remove+reorder reconciles correctly", async () => {
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

  /** Renders ticking rows that throw at `c`; resolves the ticks seen per row. */
  async function ticksAfterFailure(initial: readonly Person[], next?: readonly Person[]) {
    createTestDOM();
    const root = createRoot();
    const ref = await Effect.runPromise(SubscriptionRef.make(initial));
    const ticks = new Map<string, number>();
    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) => {
        if (x.id === "c") throw new Error("render boom");
        return h.li({ id: x.id }, [
          Stream.map(Stream.fromSchedule(Schedule.spaced("5 millis")), (n) => {
            ticks.set(x.id, (ticks.get(x.id) ?? 0) + 1);
            return String(n);
          }),
        ]);
      }),
      root,
    );
    await waitForStream();
    if (next !== undefined) {
      await Effect.runPromise(SubscriptionRef.set(ref, next));
      await waitForStreamUpdate();
    }
    const settled = new Map(ticks);
    await waitFor(100);
    return { settled, ticks, root };
  }

  it("FE8: a failed mount closes the scopes of items it already rendered", async () => {
    const { settled, ticks, root } = await ticksAfterFailure([p("a"), p("b"), p("c")]);
    assert.deepEqual(itemIds(root), [], "no partial DOM");
    assert.deepEqual(ticks, settled, "no row subscription survives");
  });

  it("FE8: a failed update closes only the items it created", async () => {
    const { settled, ticks, root } = await ticksAfterFailure([p("a")], [p("a"), p("b"), p("c")]);
    assert.deepEqual(itemIds(root), ["a"], "no partial DOM");
    assert.equal(ticks.get("b"), settled.get("b"), "the new row's subscription is gone");
    assert.ok((ticks.get("a") ?? 0) > (settled.get("a") ?? 0), "the retained row keeps running");
  });
});
