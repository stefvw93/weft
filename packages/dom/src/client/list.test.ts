import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Data, Effect, Stream, SubscriptionRef } from "effect";
import { Boundary, h, List } from "@weftui/core";
import { JSDOM } from "jsdom";
import * as WeftApp from "./weft-app";

// ============================================================================
// Test Setup (mirrors dom.test.ts)
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

/**
 * Tokenizes the region's child nodes into a structural snapshot of markers and
 * elements, so marker ordering (MR1) can be asserted compactly.
 */
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

// ============================================================================
// Mount (MR)
// ============================================================================

describe("List.each — Mount (MR)", () => {
  it("MR1: region + item markers bracket each item, in order", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      List.each({ of: [p("a"), p("b"), p("c")], by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, x.name),
      ),
      root,
    );
    await waitForStream();

    assert.deepEqual(structure(root), [
      "region-start",
      "item-start",
      "<li>",
      "item-end",
      "item-start",
      "<li>",
      "item-end",
      "item-start",
      "<li>",
      "item-end",
      "region-end",
    ]);
    assert.deepEqual(itemIds(root), ["a", "b", "c"]);
  });

  it("MR2: render runs exactly once per key", async () => {
    createTestDOM();
    const root = createRoot();
    let renders = 0;

    await runMount(
      List.each({ of: [p("a"), p("b")], by: (x) => x.id }, (x) => {
        renders++;
        return h.li({ id: x.id }, x.name);
      }),
      root,
    );
    await waitForStream();

    assert.equal(renders, 2);
  });

  it("MR3: empty emission shows only region markers; a later emission inserts items", async () => {
    createTestDOM();
    const root = createRoot();
    const ref = await Effect.runPromise(SubscriptionRef.make<readonly Person[]>([]));

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, x.name),
      ),
      root,
    );
    await waitForStream();

    assert.deepEqual(structure(root), ["region-start", "region-end"]);
    assert.deepEqual(itemIds(root), []);

    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("b")]));
    await waitForStreamUpdate();

    assert.deepEqual(itemIds(root), ["a", "b"]);
  });
});

// ============================================================================
// Keyed reconciliation (KR)
// ============================================================================

describe("List.each — Keyed reconciliation (KR)", () => {
  it("KR1: duplicate keys in one emission fail with a descriptive RenderError (caught by a Boundary)", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      Boundary.catch({ fallback: (e) => h.div({ id: "fallback" }, (e as Error).message) }, [
        List.each({ of: [p("a"), p("a")], by: (x) => x.id }, (x) => h.li({ id: x.id }, x.name)),
      ]),
      root,
    );
    await waitForStream();

    const fallback = root.querySelector("#fallback");
    assert.ok(fallback, "the boundary should have swapped to its fallback");
    assert.match(fallback.textContent ?? "", /duplicate key/i);
  });

  it("KR2: a new key is inserted at its position; existing items are untouched", async () => {
    createTestDOM();
    const root = createRoot();
    const renders = new Map<string, number>();
    const ref = await Effect.runPromise(SubscriptionRef.make<readonly Person[]>([p("a"), p("b")]));

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) => {
        renders.set(x.id, (renders.get(x.id) ?? 0) + 1);
        return h.li({ id: x.id }, x.name);
      }),
      root,
    );
    await waitForStream();

    const a0 = root.querySelector("#a");
    const b0 = root.querySelector("#b");

    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("x"), p("b")]));
    await waitForStreamUpdate();

    assert.deepEqual(itemIds(root), ["a", "x", "b"]);
    assert.equal(renders.get("x"), 1, "x rendered once");
    assert.equal(renders.get("a"), 1, "a not re-rendered");
    assert.equal(renders.get("b"), 1, "b not re-rendered");
    assert.strictEqual(root.querySelector("#a"), a0, "a is the same node");
    assert.strictEqual(root.querySelector("#b"), b0, "b is the same node");
  });

  it("KR3: re-emitting the same keys re-renders nothing and preserves node identity", async () => {
    createTestDOM();
    const root = createRoot();
    let renders = 0;
    const ref = await Effect.runPromise(SubscriptionRef.make<readonly Person[]>([p("a"), p("b")]));

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) => {
        renders++;
        return h.li({ id: x.id }, x.name);
      }),
      root,
    );
    await waitForStream();
    const nodes = itemIds(root).map((id) => root.querySelector(`#${id}`));

    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("b")]));
    await waitForStreamUpdate();

    assert.equal(renders, 2, "no re-render on a same-keys emission");
    assert.strictEqual(root.querySelector("#a"), nodes[0]);
    assert.strictEqual(root.querySelector("#b"), nodes[1]);
  });

  it("KR4: a dropped key has its scope closed (subscriptions interrupted) and its node range removed", async () => {
    createTestDOM();
    const root = createRoot();
    const cancelled = new Set<string>();
    const ref = await Effect.runPromise(
      SubscriptionRef.make<readonly Person[]>([p("a"), p("b"), p("c")]),
    );

    const itemStream = (id: string) =>
      Stream.concat(Stream.make(id), Stream.never).pipe(
        Stream.ensuring(Effect.sync(() => cancelled.add(id))),
      );

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, [itemStream(x.id)]),
      ),
      root,
    );
    await waitForStream();
    assert.equal(cancelled.size, 0);

    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("c")]));
    await waitForStreamUpdate();

    assert.deepEqual(itemIds(root), ["a", "c"]);
    assert.deepEqual([...cancelled], ["b"], "only b's subscription was interrupted");
    // Item markers for b are gone too (range removed, markers inclusive).
    assert.equal(structure(root).filter((t) => t === "item-start").length, 2);
  });

  it("KR5: a reorder issues minimal moves (only items outside the LIS move)", async () => {
    createTestDOM();
    const root = createRoot();
    const ref = await Effect.runPromise(
      SubscriptionRef.make<readonly Person[]>([p("a"), p("b"), p("c"), p("d")]),
    );

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, x.name),
      ),
      root,
    );
    await waitForStream();

    const before = Object.fromEntries(
      itemIds(root).map((id) => [id, root.querySelector(`#${id}`)]),
    );

    // Spy on the container's insertBefore: one moved item == its 3-node range
    // (item-start, <li>, item-end) == 3 calls. Two moves would be 6.
    const original = root.insertBefore.bind(root);
    let inserts = 0;
    root.insertBefore = ((node: Node, anchor: Node | null) => {
      inserts++;
      return original(node, anchor);
    }) as typeof root.insertBefore;

    await Effect.runPromise(SubscriptionRef.set(ref, [p("a"), p("c"), p("b"), p("d")]));
    await waitForStreamUpdate();

    assert.deepEqual(itemIds(root), ["a", "c", "b", "d"]);
    assert.equal(inserts, 3, "exactly one item (3-node range) moved");
    // All retained items keep their node identity (nothing rebuilt).
    for (const id of ["a", "b", "c", "d"]) {
      assert.strictEqual(root.querySelector(`#${id}`), before[id], `${id} kept its node`);
    }
  });

  it("KR6: a non-array Iterable (Set) is materialized and reconciled", async () => {
    createTestDOM();
    const root = createRoot();
    const set = new Set([p("a"), p("b"), p("c")]);

    await runMount(
      List.each({ of: set, by: (x) => x.id }, (x) => h.li({ id: x.id }, x.name)),
      root,
    );
    await waitForStream();

    assert.deepEqual(itemIds(root), ["a", "b", "c"]);
  });
});

// ============================================================================
// Scope & state preservation (SC)
// ============================================================================

describe("List.each — Scope & state preservation (SC)", () => {
  it("SC1: a retained item's subscription keeps running across a reorder", async () => {
    createTestDOM();
    const root = createRoot();

    // Per-key counter refs threaded into the item as a reactive child.
    const counters = new Map<string, SubscriptionRef.SubscriptionRef<number>>();
    for (const id of ["a", "b", "c"]) {
      counters.set(id, await Effect.runPromise(SubscriptionRef.make(0)));
    }
    const listRef = await Effect.runPromise(
      SubscriptionRef.make<readonly Person[]>([p("a"), p("b"), p("c")]),
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

    // Reorder — b moves but its scope/subscription must survive.
    await Effect.runPromise(SubscriptionRef.set(listRef, [p("c"), p("b"), p("a")]));
    await waitForStreamUpdate();
    assert.deepEqual(itemIds(root), ["c", "b", "a"]);
    assert.strictEqual(root.querySelector("#b"), bNode, "b kept its node");

    // The subscription is still live: a new emission updates the moved node.
    await Effect.runPromise(SubscriptionRef.set(counters.get("b")!, 6));
    await waitForStreamUpdate();
    assert.equal(root.querySelector("#b")?.textContent, "6", "counter continued after reorder");
  });

  it("SC2: focus and uncontrolled input value survive a reorder", async () => {
    createTestDOM();
    const root = createRoot();
    const ref = await Effect.runPromise(SubscriptionRef.make<readonly Person[]>([p("a"), p("b")]));

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, [h.input({ id: `input-${x.id}` })]),
      ),
      root,
    );
    await waitForStream();

    const input = root.querySelector<HTMLInputElement>("#input-a")!;
    input.value = "typed text";
    input.focus();
    assert.strictEqual(document.activeElement, input);

    await Effect.runPromise(SubscriptionRef.set(ref, [p("b"), p("a")]));
    await waitForStreamUpdate();

    assert.deepEqual(itemIds(root), ["b", "a"]);
    const after = root.querySelector<HTMLInputElement>("#input-a")!;
    assert.strictEqual(after, input, "the input node was moved, not recreated");
    assert.equal(after.value, "typed text", "uncontrolled value preserved");
    assert.strictEqual(document.activeElement, after, "focus preserved");
  });

  it("SC3: teardown closes every item scope (all subscriptions interrupted)", async () => {
    createTestDOM();
    const root = createRoot();
    const cancelled = new Set<string>();
    const itemStream = (id: string) =>
      Stream.concat(Stream.make(id), Stream.never).pipe(
        Stream.ensuring(Effect.sync(() => cancelled.add(id))),
      );

    const handle = await runMount(
      List.each({ of: [p("a"), p("b"), p("c")], by: (x) => x.id }, (x) =>
        h.li({ id: x.id }, [itemStream(x.id)]),
      ),
      root,
    );
    await waitForStream();
    assert.equal(cancelled.size, 0);

    await Effect.runPromise(handle.unmount());

    assert.deepEqual([...cancelled].sort(), ["a", "b", "c"]);
  });
});

// ============================================================================
// Identity (ID)
// ============================================================================

class PersonData extends Data.Class<{ readonly id: string; readonly name: string }> {}

describe("List.each — Identity (ID)", () => {
  it("ID1: with `by` omitted, structurally-equal Data items reconcile as the same key", async () => {
    createTestDOM();
    const root = createRoot();
    let renders = 0;
    const ref = await Effect.runPromise(
      SubscriptionRef.make<readonly PersonData[]>([new PersonData({ id: "a", name: "Ann" })]),
    );

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref) }, (x) => {
        renders++;
        return h.li({ id: x.id }, x.name);
      }),
      root,
    );
    await waitForStream();
    assert.equal(renders, 1);

    // A different instance with equal structure → same key → reused, no re-render.
    await Effect.runPromise(SubscriptionRef.set(ref, [new PersonData({ id: "a", name: "Ann" })]));
    await waitForStreamUpdate();

    assert.equal(renders, 1, "structurally-equal Data item reused (Effect Equal)");
  });

  it("ID2: with a `by` projection, a same-key item is reused and its content is NOT refreshed", async () => {
    createTestDOM();
    const root = createRoot();
    let renders = 0;
    const ref = await Effect.runPromise(SubscriptionRef.make<readonly Person[]>([p("a", "Ann")]));

    await runMount(
      List.each({ of: SubscriptionRef.changes(ref), by: (x) => x.id }, (x) => {
        renders++;
        return h.li({ id: x.id }, x.name);
      }),
      root,
    );
    await waitForStream();
    assert.equal(root.querySelector("#a")?.textContent, "Ann");

    // Same id, different name. Render-once: the kept node is NOT refreshed.
    await Effect.runPromise(SubscriptionRef.set(ref, [p("a", "Annabel")]));
    await waitForStreamUpdate();

    assert.equal(renders, 1, "render not re-invoked for a persisted key");
    assert.equal(
      root.querySelector("#a")?.textContent,
      "Ann",
      "content not refreshed (render-once)",
    );
  });
});

// ============================================================================
// Errors (ER)
// ============================================================================

describe("List.each — Errors (ER)", () => {
  it("ER1: a failing rendered item surfaces on the region channel and is caught by a Boundary", async () => {
    createTestDOM();
    const root = createRoot();

    await runMount(
      Boundary.catch({ fallback: () => h.div({ id: "fallback" }, "render failed") }, [
        // render returns a node whose `E` fails when the item is inserted.
        List.each({ of: [p("a")], by: (x) => x.id }, () => Effect.fail(new Error("render boom"))),
      ]),
      root,
    );
    await waitForStream();

    assert.ok(root.querySelector("#fallback"), "boundary swapped to fallback on render failure");
  });

  it("ER2: a source failure after the first emission is caught by a Boundary", async () => {
    createTestDOM();
    const root = createRoot();

    // Emits one good value, then fails.
    const of = Stream.concat(
      Stream.succeed([p("a")] as readonly Person[]),
      Stream.fail(new Error("source boom")),
    );

    await runMount(
      Boundary.catch({ fallback: () => h.div({ id: "fallback" }, "source failed") }, [
        List.each({ of, by: (x) => x.id }, (x) => h.li({ id: x.id }, x.name)),
      ]),
      root,
    );
    await waitForStreamUpdate();

    assert.ok(root.querySelector("#fallback"), "boundary swapped to fallback on source failure");
  });
});
