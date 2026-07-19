import * as assert from "node:assert/strict";
import { Boundary, h } from "@weftui/core";
import type { Renderable } from "@weftui/core/types";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Scope, Stream } from "effect";
import { describe, it } from "vite-plus/test";
import { renderToStreamHydratable } from "./render-to-stream";
import { renderToStringHydratable } from "./render-to-string";
import { renderToHydratableShell } from "./streaming-shell";
import { SuspenseFailureHandlerTag, type SuspenseFailureHandler } from "./suspense-failure-handler";
import { NoRpc } from "../__tests__/rpc-stub";

/** A `type` that is neither string, FRAGMENT, nor function: fails the walk (AC-ST4 parity). */
const badNode = { type: 42, props: {} } as unknown as Renderable;

/** Renders the shell and fully drains the patch stream inside one scope. */
const runShell = (node: Renderable, handler?: SuspenseFailureHandler) => {
  const layers =
    handler === undefined
      ? NoRpc
      : Layer.mergeAll(NoRpc, Layer.succeed(SuspenseFailureHandlerTag, handler));
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const { shell, patches } = yield* Effect.provide(renderToHydratableShell(node), layers);
        const patchHtml = yield* Stream.mkString(patches);
        return { shell, patchHtml };
      }),
    ),
  );
};

describe("renderToHydratableShell: shell split", () => {
  it("AC-SH1: shell + patches recombine to exactly the combined-stream output", async () => {
    const makeTree = () =>
      h.div({}, [
        h.span({}, "before"),
        Boundary.suspend({ fallback: h.span({}, "loading") }, [
          Effect.succeed(h.p({}, "resolved")).pipe(Effect.delay("5 millis")),
        ]),
        h.span({}, "after"),
      ]);

    const { shell, patchHtml } = await runShell(makeTree());
    const combined = await Effect.runPromise(
      Stream.mkString(Stream.provide(renderToStreamHydratable(makeTree()), NoRpc)),
    );
    assert.equal(shell + patchHtml, combined);
    assert.ok(shell.includes("loading"));
    assert.ok(!shell.includes("resolved"));
    assert.ok(patchHtml.includes("resolved"));
  });

  it("AC-SH2: an error during the main walk fails the Effect and tears down pending resolution fibers", async () => {
    // The boundary holds a resolution that never settles (`Effect.never`). If a
    // walk error let its fiber outlive the shell, the enclosing `Effect.scoped`
    // would hang awaiting it: so the scoped Effect *completing* is the no-leak
    // guarantee. (Effect 4 forks resolution fibers lazily via `Effect.forkIn`, so
    // when the walk fails before the fiber's first step it is discarded
    // un-started; an `onInterrupt` proxy on the child never fires, unlike v3.)
    const exit = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const tree = h.div({}, [
            Boundary.suspend({ fallback: h.span({}, "loading") }, [Effect.never]),
            badNode,
          ]);
          return yield* Effect.exit(Effect.provide(renderToHydratableShell(tree), NoRpc));
        }),
      ),
    );
    assert.ok(Exit.isFailure(exit));
  });

  it("AC-SH3: patches are emitted in resolution order, not document order", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const dA = yield* Deferred.make<void>();
          const dB = yield* Deferred.make<void>();
          const tree = h.div({}, [
            Boundary.suspend({ fallback: "fa" }, [
              Deferred.await(dA).pipe(Effect.as(h.p({}, "content-A"))),
            ]),
            Boundary.suspend({ fallback: "fb" }, [
              Deferred.await(dB).pipe(Effect.as(h.p({}, "content-B"))),
            ]),
          ]);
          const { patches } = yield* Effect.provide(renderToHydratableShell(tree), NoRpc);
          const pull = yield* Stream.toPull(patches);

          // Resolve the *second* boundary first: its patch must arrive first.
          yield* Deferred.succeed(dB, void 0);
          const first = (yield* pull).join("");
          assert.ok(first.includes("content-B"));
          assert.ok(first.includes('id="ef-s-2"'));

          yield* Deferred.succeed(dA, void 0);
          const second = (yield* pull).join("");
          assert.ok(second.includes("content-A"));
          assert.ok(second.includes('id="ef-s-1"'));
        }),
      ),
    );
  });

  it("AC-SH4: a tree without Boundary.suspend yields an immediately-complete empty patch stream and a renderToStringHydratable-equal shell", async () => {
    const makeTree = () => h.div({}, [h.span({}, "static"), Effect.succeed(h.p({}, "sync"))]);
    const { shell, patchHtml } = await runShell(makeTree());
    assert.equal(patchHtml, "");
    const buffered = await Effect.runPromise(
      Effect.provide(renderToStringHydratable(makeTree()), NoRpc),
    );
    assert.equal(shell, buffered);
  });

  it("AC-SH5: the shell resolves promptly even when a suspended child never resolves", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const tree = h.div({}, [
            Boundary.suspend({ fallback: h.span({}, "loading") }, [Effect.never]),
          ]);
          const { shell } = yield* Effect.provide(renderToHydratableShell(tree), NoRpc);
          assert.ok(shell.includes("loading"));
          // Patches deliberately not consumed: closing the scope on exit
          // interrupts the pending resolution fiber.
        }),
      ),
    );
  });

  it("AC-SH6: closing the scope interrupts pending fibers and terminates the patch stream", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        const tree = h.div({}, [
          Boundary.suspend({ fallback: h.span({}, "loading") }, [Effect.never]),
        ]);
        const { patches } = yield* Effect.provide(renderToHydratableShell(tree), NoRpc).pipe(
          Scope.provide(scope),
        );
        const collector = yield* Effect.forkChild(Stream.runCollect(patches));
        yield* Scope.close(scope, Exit.void);
        const collected = yield* Fiber.join(collector);
        assert.equal(collected.length, 0);
      }),
    );
  });
});

describe("SuspenseFailureHandlerTag: late-failure seam", () => {
  it("AC-FH1: the handler is invoked exactly once per failed boundary, with that boundary's cause", async () => {
    const causes: Array<Cause.Cause<unknown>> = [];
    const handler: SuspenseFailureHandler = {
      handle: (cause) => {
        causes.push(cause);
        return Option.none();
      },
    };
    const tree = h.div({}, [
      Boundary.suspend({ fallback: "fa" }, [Effect.fail(new Error("boom-a"))]),
      Boundary.suspend({ fallback: "fb" }, [Effect.fail(new Error("boom-b"))]),
    ]);
    const { patchHtml } = await runShell(tree, handler);
    assert.equal(patchHtml, "");
    assert.equal(causes.length, 2);
    const messages = causes
      .flatMap((c) => c.reasons.filter(Cause.isFailReason).map((r) => r.error))
      .map((e) => (e as Error).message)
      .sort();
    assert.deepEqual(messages, ["boom-a", "boom-b"]);
  });

  it("AC-FH2: a Some substitute is rendered as the boundary's patch and the stream terminates", async () => {
    const handler: SuspenseFailureHandler = {
      handle: () => Option.some({ content: h.p({}, "substituted"), markNoindex: false }),
    };
    const tree = h.div({}, [
      Boundary.suspend({ fallback: h.span({}, "loading") }, [Effect.fail(new Error("boom"))]),
    ]);
    const { shell, patchHtml } = await runShell(tree, handler);
    assert.ok(shell.includes("loading"));
    assert.ok(patchHtml.includes('id="ef-s-1"'));
    assert.ok(patchHtml.includes("<p>substituted</p>"));
  });

  it("AC-FH3: markNoindex injects a robots meta into document.head before the swap; false does not", async () => {
    const make = (markNoindex: boolean): SuspenseFailureHandler => ({
      handle: () => Option.some({ content: h.p({}, "nf"), markNoindex }),
    });
    const tree = () =>
      h.div({}, [Boundary.suspend({ fallback: "f" }, [Effect.fail(new Error("boom"))])]);

    const noindexed = await runShell(tree(), make(true));
    assert.ok(noindexed.patchHtml.includes("document.head.appendChild"));
    assert.ok(noindexed.patchHtml.includes("noindex"));

    const plain = await runShell(tree(), make(false));
    assert.ok(!plain.patchHtml.includes("noindex"));
  });

  it("AC-FH4: handler absent or returning None keeps the swallow default: no patch, stream still terminates", async () => {
    const tree = () =>
      h.div({}, [
        Boundary.suspend({ fallback: h.span({}, "fallback stays") }, [
          Effect.fail(new Error("boom")),
        ]),
      ]);

    // Seam absent entirely (existing behaviour, render-to-stream AC-ST8).
    const absent = await runShell(tree());
    assert.ok(absent.shell.includes("fallback stays"));
    assert.equal(absent.patchHtml, "");

    // Seam present but declining.
    const declined = await runShell(tree(), { handle: () => Option.none() });
    assert.equal(declined.patchHtml, "");
  });

  it("AC-FH5: a failure Boundary inside the suspended children takes precedence: the seam is not consulted", async () => {
    let calls = 0;
    const handler: SuspenseFailureHandler = {
      handle: () => {
        calls += 1;
        return Option.some({ content: h.p({}, "seam"), markNoindex: false });
      },
    };
    const tree = h.div({}, [
      Boundary.suspend({ fallback: "f" }, [
        Boundary.catch({ fallback: () => h.span({}, "caught inline") }, [
          Effect.fail(new Error("boom")),
        ]),
      ]),
    ]);
    const { patchHtml } = await runShell(tree, handler);
    assert.equal(calls, 0);
    assert.ok(patchHtml.includes("caught inline"));
    assert.ok(!patchHtml.includes("seam"));
  });

  it("AC-FH6: a substitute whose render fails degrades to the swallow default", async () => {
    const handler: SuspenseFailureHandler = {
      handle: () => Option.some({ content: badNode, markNoindex: true }),
    };
    const tree = h.div({}, [Boundary.suspend({ fallback: "f" }, [Effect.fail(new Error("boom"))])]);
    const { patchHtml } = await runShell(tree, handler);
    assert.equal(patchHtml, "");
  });

  it("AC-FH7: a substitute with failureReplay emits the failure-replay patch: retained markers + sentinel script", async () => {
    const handler: SuspenseFailureHandler = {
      handle: () =>
        Option.some({
          content: h.p({}, "substituted"),
          markNoindex: true,
          failureReplay: { _tag: "RouterNotFound", path: "/late" },
        }),
    };
    const tree = h.div({}, [Boundary.suspend({ fallback: "f" }, [Effect.fail(new Error("boom"))])]);
    const { patchHtml } = await runShell(tree, handler);

    // Sentinel script (inert application/json) prepended to the substituted content.
    assert.ok(
      patchHtml.includes(
        '<script type="application/json" data-weft-suspense-failure>' +
          '{"error":{"_tag":"RouterNotFound","path":"/late"}}</script><p>substituted</p>',
      ),
    );
    // Markers retained: the swap script must not remove the start/end comments.
    assert.ok(!patchHtml.includes("p.removeChild(s)"));
    assert.ok(!patchHtml.includes("p.removeChild(e)"));
    // AC-FH3 composes with the replay variant.
    assert.ok(patchHtml.includes("noindex"));
  });

  it("AC-FH7: a substitute without failureReplay keeps today's patch format exactly", async () => {
    const handler: SuspenseFailureHandler = {
      handle: () => Option.some({ content: h.p({}, "substituted"), markNoindex: false }),
    };
    const tree = h.div({}, [Boundary.suspend({ fallback: "f" }, [Effect.fail(new Error("boom"))])]);
    const { patchHtml } = await runShell(tree, handler);
    assert.ok(!patchHtml.includes("data-weft-suspense-failure"));
    // Standard script removes both markers after the swap.
    assert.ok(patchHtml.includes("p.removeChild(s);p.removeChild(e);"));
  });

  it("the seam also applies to the combined renderToStreamHydratable stream", async () => {
    const handler: SuspenseFailureHandler = {
      handle: () => Option.some({ content: h.p({}, "substituted"), markNoindex: false }),
    };
    const tree = h.div({}, [Boundary.suspend({ fallback: "f" }, [Effect.fail(new Error("boom"))])]);
    const html = await Effect.runPromise(
      Stream.mkString(
        Stream.provide(
          renderToStreamHydratable(tree),
          Layer.mergeAll(NoRpc, Layer.succeed(SuspenseFailureHandlerTag, handler)),
        ),
      ),
    );
    assert.ok(html.includes("<p>substituted</p>"));
  });
});
