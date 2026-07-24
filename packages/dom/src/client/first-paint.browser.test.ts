import { h, List } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import { Effect, Stream, SubscriptionRef, pipe } from "effect";
import { expect, it, vi } from "vite-plus/test";

// Permanent guard for issue #182 (first-paint.specs.md FP4/FP5, AS1): a reactive
// region whose source delivers synchronously must be in the DOM the instant
// `mount` resolves, not a macrotask later.
//
// These assertions are deliberately NOT wrapped in `vi.waitFor`. The whole claim
// is *when* the paint happens, and `vi.waitFor` would retry until the deferred
// path had also painted, so the guard would pass even with the bug present. The
// DOM is snapshotted synchronously, before any further await.

interface Row {
  readonly id: number;
}

const rowsOf = (n: number): readonly Row[] => Array.from({ length: n }, (_, id) => ({ id }));

/** Yields `n` microtasks without ever reaching the macrotask queue. */
async function drainMicrotasks(n = 200): Promise<void> {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

it("FP4/FP5: every synchronously available region is painted when mount resolves", async () => {
  const container = document.createElement("div");
  document.body.append(container);

  const source = Effect.runSync(SubscriptionRef.make(rowsOf(10)));
  const app = WeftApp.make();

  const handle = await Effect.runPromise(
    WeftApp.mount(
      app,
      h.div([
        // Plain synchronous sibling: the baseline everything else must match.
        h.p({ id: "sibling" }, "sync"),
        // (a) static-array List.each
        h.ul({ id: "static-list" }, [
          List.each({ of: rowsOf(10), by: (row: Row) => row.id }, (row) =>
            h.li({ "data-static-item": String(row.id) }, String(row.id)),
          ),
        ]),
        // (b) SubscriptionRef List.each (the idiomatic Weft form)
        h.ul({ id: "ref-list" }, [
          List.each({ of: SubscriptionRef.changes(source), by: (row: Row) => row.id }, (row) =>
            h.li({ "data-ref-item": String(row.id) }, String(row.id)),
          ),
        ]),
        // (c) generic synchronously available sources: a stream child, an Effect
        // child, and a reactive prop.
        h.span({ id: "stream-child" }, [Stream.make("stream")]),
        h.span({ id: "effect-child" }, [Effect.succeed("effect")]),
        h.span({ id: "propped", class: Stream.make("ready") }, "prop"),
        // Negative control: a cold async source must still be deferred.
        h.span({ id: "async-child" }, [
          Stream.fromEffect(pipe(Effect.sleep("20 millis"), Effect.as("late"))),
        ]),
      ]),
      container,
    ),
  );

  // Synchronous snapshot: no await between mount resolving and reading the DOM.
  const atResolve = {
    sibling: container.querySelector("#sibling")?.textContent ?? null,
    staticItems: container.querySelectorAll("[data-static-item]").length,
    refItems: container.querySelectorAll("[data-ref-item]").length,
    streamChild: container.querySelector("#stream-child")?.textContent ?? null,
    effectChild: container.querySelector("#effect-child")?.textContent ?? null,
    propClass: container.querySelector("#propped")?.getAttribute("class") ?? null,
    asyncChild: container.querySelector("#async-child")?.textContent ?? null,
  };

  expect(atResolve.sibling).toBe("sync");
  expect(atResolve.staticItems).toBe(10);
  expect(atResolve.refItems).toBe(10);
  expect(atResolve.streamChild).toBe("stream");
  expect(atResolve.effectChild).toBe("effect");
  expect(atResolve.propClass).toBe("ready");
  // AS1 negative control: present as an element, but with no content yet.
  expect(atResolve.asyncChild).toBe("");

  // Still deferred after a full microtask drain: only a macrotask releases it.
  await drainMicrotasks();
  expect(container.querySelector("#async-child")?.textContent).toBe("");

  await vi.waitFor(() => expect(container.querySelector("#async-child")?.textContent).toBe("late"));

  await Effect.runPromise(handle.unmount());
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
});

it("FP6: a region that painted inline still reconciles later emissions", async () => {
  const container = document.createElement("div");
  document.body.append(container);

  const source = Effect.runSync(SubscriptionRef.make(rowsOf(3)));
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

  expect(container.querySelectorAll("li")).toHaveLength(3);

  await Effect.runPromise(SubscriptionRef.set(source, rowsOf(6)));
  await vi.waitFor(() => expect(container.querySelectorAll("li")).toHaveLength(6));

  await Effect.runPromise(SubscriptionRef.set(source, rowsOf(2)));
  await vi.waitFor(() => expect(container.querySelectorAll("li")).toHaveLength(2));

  await Effect.runPromise(handle.unmount());
  await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
});
