/**
 * Unit tests for `Router.lazy` (spec: `lazy-component.specs.md`).
 *
 * The slot, invoked by the router at render time, must await its `load` and render the
 * resolved component's node. These render through `@weftui/dom/server`'s `renderToString`
 * (node env, no DOM): the app has no `Boundary.rpc`, so the ambient `AppRpcClientTag`
 * seam is discharged with a no-op. Flash-free hydration + client-nav are covered by the
 * browser e2e phase; here we assert the core render + loader semantics.
 */

import * as assert from "node:assert/strict";
import { AppRpcClientTag, Component, h } from "@weftui/core";
import type { Node } from "@weftui/core";
import { renderToString } from "@weftui/dom/server";
import { Effect, Exit, Layer } from "effect";
import { describe, it } from "vite-plus/test";
import { Router } from "~/index";
import { getPreload } from "~/route-tree";

/** No `Boundary.rpc` in these pages; discharge the ambient rpc seam with a dying stub. */
const NoRpc = Layer.succeed(AppRpcClientTag, {
  call: () => Effect.die(new Error("no rpc in this test")),
});

/** Renders a node to HTML in node (server render), discharging the rpc seam. */
function render(node: Node<never, never>): Promise<string> {
  return Effect.runPromise(Effect.provide(renderToString(node), NoRpc));
}

describe("Router.lazy: unit", () => {
  it("awaits the loader, then renders the resolved component", async () => {
    let calls = 0;
    const slot = Router.lazy(() => {
      calls += 1;
      return Promise.resolve(Component.make(() => h.div({}, "lazy-body")));
    });
    // The router invokes the slot with no args; the returned node awaits `load`.
    const html = await render(slot());
    assert.match(html, /lazy-body/);
    assert.equal(calls, 1);
  });

  it("renders a resolved component that reads its own props/params like an eager one", async () => {
    // A component that yields an Effect before returning: mirrors a real page body.
    const slot = Router.lazy(() =>
      Promise.resolve(
        Component.gen(function* () {
          const label = yield* Effect.succeed("from-effect");
          return yield* h.span({}, label);
        }),
      ),
    );
    const html = await render(slot());
    assert.match(html, /from-effect/);
  });

  it("memoizes the load per slot: the loader runs once across repeated renders (AC-C2)", async () => {
    let calls = 0;
    const slot = Router.lazy(() => {
      calls += 1;
      return Promise.resolve(Component.make(() => h.div({}, "x")));
    });
    // Two renders of the same slot instance (as a re-render / back-navigation would do):
    // the chunk loads once; the second reuses the resolved module.
    const first = await render(slot());
    const second = await render(slot());
    assert.match(first, /x/);
    assert.match(second, /x/);
    assert.equal(calls, 1);
  });

  it("exposes a preload that populates the memo so a later invocation renders synchronously (AC-N2/AC-N4)", async () => {
    let calls = 0;
    const slot = Router.lazy(() => {
      calls += 1;
      return Promise.resolve(Component.make(() => h.div({}, "sync-body")));
    });
    const preload = getPreload(slot);
    assert.ok(preload !== undefined, "a lazy slot must expose a preload capability");
    await preload();
    // Post-preload the slot returns a synchronously-resolvable node (the DOM renderer's
    // `runSyncExit` probe succeeds → atomic swap, no blank).
    const exit = Effect.runSyncExit(slot() as unknown as Effect.Effect<unknown, never, never>);
    assert.ok(Exit.isSuccess(exit), "post-preload slot must render synchronously");
    // The preload and the render share the single memoized load: the loader runs once.
    assert.equal(calls, 1);
  });

  it("a preloaded slot still renders the resolved component to HTML", async () => {
    const slot = Router.lazy(() => Promise.resolve(Component.make(() => h.div({}, "preloaded"))));
    await getPreload(slot)!();
    const html = await render(slot());
    assert.match(html, /preloaded/);
  });

  it("an eager slot has no preload capability", () => {
    const eager = Component.make(() => h.div({}, "eager"));
    assert.equal(getPreload(eager), undefined);
  });
});
