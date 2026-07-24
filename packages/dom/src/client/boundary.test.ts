import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Cause, Data, Deferred, Effect, Filter, Result, Stream } from "effect";
import { Boundary, h, List } from "@weftui/core";
import type { Renderable } from "@weftui/core";
import { JSDOM } from "jsdom";
import { makeErrorLogCapture } from "../__tests__/log-capture";
import * as WeftApp from "./weft-app";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function runMount(app: Renderable, root: HTMLElement) {
  return Effect.runPromise(WeftApp.mount(WeftApp.make(), app, root));
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBoundaryComments(el: Element): Comment[] {
  const result: Comment[] = [];
  const walker = document.createTreeWalker(el, 128);
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    const c = node as Comment;
    if (c.data.includes("boundary")) result.push(c);
  }
  return result;
}

/**
 * Runs `mount` with a replacement logger that records every `Error`-level log
 * entry (its `Cause`, message, and log annotations) so tests can assert that
 * an unhandled failure was surfaced (rather than silently swallowed) and
 * attributed via the `weft.region` annotation. Returns the mount handle and the
 * captured entries (populated asynchronously as post-mount failures occur).
 */
async function runMountCapturingErrors(app: Renderable, root: HTMLElement) {
  const { entries, logger } = makeErrorLogCapture();
  const handle = await Effect.runPromise(WeftApp.mount(WeftApp.make(logger), app, root));
  return { handle, entries };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

class FooError extends Data.TaggedError("Foo")<{ msg: string }> {}
class BarError extends Data.TaggedError("Bar")<{ code: number }> {}

/**
 * A child whose inferred error union is `FooError | BarError`, regardless of
 * which one it fails with at runtime. `which` picks the runtime error; the
 * static type always carries both tags.
 *
 * This lets `catchTag` reference a tag the child *can* produce ("Foo") while the
 * child actually fails with the *other* tag ("Bar"): exercising the re-raise
 * path with a fully type-checked `catchTag` call, no `as any` needed. (A child
 * typed `Effect<never, BarError>` would reject `catchTag({ tag: "Foo" })` at
 * compile time, since "Foo" is not in its error union.)
 */
function failWith(which: "Foo" | "Bar"): Effect.Effect<never, FooError | BarError> {
  return which === "Foo"
    ? Effect.fail(new FooError({ msg: "foo" }))
    : Effect.fail(new BarError({ code: 42 }));
}

/**
 * A boundary child that fails *synchronously* during construction (while
 * `renderNode` walks the subtree) rather than asynchronously post-mount.
 *
 * The public node builders (`h.*`, `Component.*`, bare `Effect`s) are all
 * consumed through the async stream path, so any error they raise surfaces
 * *after* mount, via `BoundaryContext`. To exercise `renderBoundary`'s
 * synchronous construction-time catch (spec AC1 / AC10–12) we hand the renderer
 * a function-component descriptor whose body throws. The throw becomes a
 * `Cause.die` at construction time, when the renderer invokes the component.
 *
 * A bare `ElementDescriptor` (`{ type, props }`) is a valid `Renderable`, so no
 * cast is needed: this drives the synchronous construction path directly.
 */
function throwsAtConstruction(error: unknown): Renderable {
  const component = () => {
    throw error;
  };
  return { type: component, props: {} };
}

// ── AC1 / AC10–12: Construction-time error → handled synchronously ────────────
// A child that throws while the subtree is being constructed fails the boundary
// synchronously, before its comment markers ever reach the DOM. `catchAllCause`
// sees the defect and renders the fallback in the same tick (no post-mount swap).

describe("AC1: construction-time error handled synchronously", () => {
  it("renders fallback synchronously when a child throws at construction", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(
      Boundary.catchCause({ fallback: () => h.span({ class: "fallback" }, "error!") }, [
        throwsAtConstruction(new Error("boom")),
      ]),
      root,
    );

    // No waitFor: the fallback is in place by the time mount resolves.
    assert.ok(root.querySelector(".fallback"), "Fallback should be rendered synchronously");
    assert.equal(root.querySelector(".fallback")?.textContent, "error!");

    await Effect.runPromise(handle.unmount());
  });

  it("does not render the failed children when the boundary catches at construction", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(
      Boundary.catchCause({ fallback: () => h.span({ class: "fallback" }, "error!") }, [
        throwsAtConstruction(new Error("boom")),
      ]),
      root,
    );

    assert.equal(root.querySelector(".content"), null, "Content must not be rendered");

    await Effect.runPromise(handle.unmount());
  });
});

// ── AC11: construction-time error, match returns null → propagates ────────────
// `catchAll` only catches typed failures, so a construction-time *defect*
// (Cause.die) makes its `match` return null. With no parent boundary the error
// re-raises out of `renderBoundary` and rejects the `mount` Effect.

describe("AC11: construction-time match returns null → mount fails", () => {
  it("rejects when no boundary handles a construction-time defect", async () => {
    createTestDOM();
    const root = createRoot();

    await assert.rejects(
      runMount(
        Boundary.catch({ fallback: () => h.span({}, "err") }, [
          throwsAtConstruction(new Error("unhandled")),
        ]),
        root,
      ),
    );
  });
});

// ── AC15: post-mount error, match returns null, no parent → surfaced ──────────
// After mount has resolved a post-mount failure cannot reject the mount Effect,
// so when the outermost boundary cannot handle it (match → null, no parent) the
// cause is surfaced as an unhandled boundary failure via Effect.logError rather
// than being silently swallowed.

describe("AC15: unhandled post-mount error is surfaced, not swallowed", () => {
  it("logs the cause when an async stream defect escapes the outermost boundary", async () => {
    createTestDOM();
    const root = createRoot();

    // A defect (die) → catchAll's match returns null. No parent boundary.
    const dyingStream = Stream.concat(
      Stream.make(h.div({ class: "content" }, "live")),
      Stream.die(new Error("async-defect")),
    );

    const { handle, entries } = await runMountCapturingErrors(
      Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "fb") }, [dyingStream]),
      root,
    );

    await waitFor(80);

    assert.equal(entries.length, 1, "Exactly one unhandled boundary failure should be surfaced");
    assert.ok(
      Cause.pretty(entries[0]!.cause).includes("async-defect"),
      "Logged cause should be the escaped defect",
    );
    assert.equal(
      root.querySelector(".fallback"),
      null,
      "No fallback renders for an unhandled defect",
    );

    await Effect.runPromise(handle.unmount());
  });
});

// ── AC16: Comment markers present in DOM ──────────────────────────────────────

describe("AC16: boundary comment markers in DOM", () => {
  it("start and end boundary markers are present after mount", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(
      Boundary.catch({ fallback: () => h.span({}, "err") }, [h.div({ class: "ok" }, "hello")]),
      root,
    );

    const comments = getBoundaryComments(root);
    assert.ok(
      comments.some((c) => c.data.includes("boundary-start")),
      "Start marker missing",
    );
    assert.ok(
      comments.some((c) => c.data.includes("boundary-end")),
      "End marker missing",
    );

    await Effect.runPromise(handle.unmount());
  });
});

// ── AC2: Post-mount stream failure → DOM swap ─────────────────────────────────
// A bare Effect/Stream child is consumed asynchronously, so its failure is
// reported to BoundaryContext after mount and triggers a DOM swap to the fallback.

describe("AC2: post-mount stream failure → DOM swap to fallback", () => {
  it("swaps DOM to fallback when a stream inside the boundary fails", async () => {
    createTestDOM();
    const root = createRoot();

    const failingStream = Stream.concat(
      Stream.make(h.div({ class: "content" }, "live")),
      Stream.fail(new FooError({ msg: "stream boom" })),
    );

    const handle = await runMount(
      Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "stream error") }, [
        failingStream,
      ]),
      root,
    );

    await waitFor(80);

    assert.ok(root.querySelector(".fallback"), "Fallback should appear after stream failure");
    assert.equal(root.querySelector(".content"), null, "Failed content must be removed on swap");

    await Effect.runPromise(handle.unmount());
  });

  it("catches an async stream failure nested inside an element", async () => {
    createTestDOM();
    const root = createRoot();

    const failingStream = Stream.concat(
      Stream.make(h.span({ class: "live" }, "x")),
      Stream.fail(new FooError({ msg: "deep" })),
    );

    const handle = await runMount(
      Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "caught") }, [
        h.div({ class: "wrapper" }, [failingStream]),
      ]),
      root,
    );

    await waitFor(80);

    assert.ok(
      root.querySelector(".fallback"),
      "Fallback should appear for a deeply nested failure",
    );
    assert.equal(root.querySelector(".wrapper"), null, "The whole subtree should be swapped out");

    await Effect.runPromise(handle.unmount());
  });

  it("catches a post-mount typed failure and renders the fallback", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(
      Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "error!") }, [
        Effect.fail(new FooError({ msg: "boom" })),
      ]),
      root,
    );

    await waitFor(50);

    assert.ok(root.querySelector(".fallback"), "Fallback should be rendered");
    assert.equal(root.querySelector(".fallback")?.textContent, "error!");

    await Effect.runPromise(handle.unmount());
  });
});

// ── AC5: BoundaryContext provided; inner shadows outer ────────────────────────

describe("AC5: BoundaryContext provided; inner boundary shadows outer", () => {
  it("inner boundary catches without triggering outer", async () => {
    createTestDOM();
    const root = createRoot();

    let outerTriggered = false;

    const handle = await runMount(
      Boundary.catch(
        {
          fallback: () => {
            outerTriggered = true;
            return h.span({ class: "outer-fallback" }, "outer");
          },
        },
        [
          Boundary.catch({ fallback: () => h.span({ class: "inner-fallback" }, "inner") }, [
            Effect.fail(new FooError({ msg: "inner" })),
          ]),
        ],
      ),
      root,
    );

    await waitFor(50);

    assert.ok(root.querySelector(".inner-fallback"), "Inner fallback should be rendered");
    assert.equal(root.querySelector(".outer-fallback"), null, "Outer fallback must not render");
    assert.equal(outerTriggered, false, "Outer boundary must not be triggered");

    await Effect.runPromise(handle.unmount());
  });
});

// ── AC6: catchTag re-raise (error propagates to parent) ──────────────────────
// The child's error union is `FooError | BarError`, so `catchTag({ tag: "Foo" })`
// type-checks. At runtime it fails with BarError, which the inner boundary does
// not handle, so the cause re-raises to the outer boundary.

describe("AC6: catchTag re-raise propagates to parent", () => {
  it("inner boundary re-raises when tag does not match, outer catches", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(
      Boundary.catch({ fallback: () => h.span({ class: "outer-fallback" }, "outer caught") }, [
        Boundary.catchTag(
          { tag: "Foo", fallback: () => h.span({ class: "inner-fallback" }, "inner") },
          [failWith("Bar")],
        ),
      ]),
      root,
    );

    await waitFor(80);

    assert.ok(root.querySelector(".outer-fallback"), "Outer fallback should catch re-raised error");
    assert.equal(root.querySelector(".inner-fallback"), null, "Inner fallback must not render");

    await Effect.runPromise(handle.unmount());
  });
});

// ── AC19: Markers remain after DOM swap ───────────────────────────────────────

describe("AC19: markers remain after swap", () => {
  it("boundary markers survive after post-mount stream failure swap", async () => {
    createTestDOM();
    const root = createRoot();

    // A deferred we can fail on demand to trigger the post-mount stream failure.
    const failSignal = await Effect.runPromise(Deferred.make<void, FooError>());
    const controlledStream = Stream.fromEffect(Deferred.await(failSignal));

    const handle = await runMount(
      Boundary.catch({ fallback: () => h.span({ class: "fallback" }, "err") }, [controlledStream]),
      root,
    );

    await Effect.runPromise(Deferred.fail(failSignal, new FooError({ msg: "go" })));
    await waitFor(80);

    const comments = getBoundaryComments(root);
    assert.ok(
      comments.some((c) => c.data.includes("boundary-start")),
      "Start marker should remain after swap",
    );
    assert.ok(
      comments.some((c) => c.data.includes("boundary-end")),
      "End marker should remain after swap",
    );

    await Effect.runPromise(handle.unmount());
  });
});

// ── catchFilter / catchIf with non-matching predicate re-raise ──────────────────

describe("edge: catchFilter non-matching re-raises to parent", () => {
  it("outer boundary catches when catchFilter declines", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(
      Boundary.catch({ fallback: () => h.span({ class: "outer-fallback" }, "outer") }, [
        Boundary.catchFilter(
          Filter.make((e) => Result.fail(e)),
          () => h.span({}),
          [Effect.fail(new FooError({ msg: "e" }))],
        ),
      ]),
      root,
    );

    await waitFor(80);

    assert.ok(root.querySelector(".outer-fallback"), "Outer should catch re-raised error");

    await Effect.runPromise(handle.unmount());
  });
});

describe("edge: catchIf false re-raises to parent", () => {
  it("outer boundary catches when catchIf predicate returns false", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(
      Boundary.catch({ fallback: () => h.span({ class: "outer-fallback" }, "outer") }, [
        Boundary.catchIf({ predicate: () => false, fallback: () => h.span({}, "inner") }, [
          Effect.fail(new FooError({ msg: "e" })),
        ]),
      ]),
      root,
    );

    await waitFor(80);

    assert.ok(root.querySelector(".outer-fallback"), "Outer should catch re-raised error");

    await Effect.runPromise(handle.unmount());
  });
});

// ── AC3: Event handler errors are NOT caught ──────────────────────────────────

describe("AC3: event handler errors are NOT caught by boundary", () => {
  it("boundary fallback does not render when event handler throws", async () => {
    createTestDOM();
    const root = createRoot();

    let fallbackRendered = false;

    const handle = await runMount(
      Boundary.catch(
        {
          fallback: () => {
            fallbackRendered = true;
            return h.span({ class: "fallback" }, "err");
          },
        },
        [
          h.button(
            {
              onclick: () => {
                throw new Error("handler error");
              },
            },
            "click me",
          ),
        ],
      ),
      root,
    );

    const btn = root.querySelector("button");
    assert.ok(btn, "Button should be rendered");

    // btn.click() triggers a click event in jsdom without needing the Event constructor.
    btn!.click();
    await waitFor(20);

    assert.equal(fallbackRendered, false, "Boundary fallback must not trigger for event errors");

    await Effect.runPromise(handle.unmount());
  });
});

// ── Nested: inner catches, outer not triggered ────────────────────────────────

describe("nested: inner catches, outer not triggered", () => {
  it("outer boundary is clean when inner boundary handles the error", async () => {
    createTestDOM();
    const root = createRoot();

    let outerCalled = false;

    const handle = await runMount(
      Boundary.catch(
        {
          fallback: () => {
            outerCalled = true;
            return h.span({}, "outer");
          },
        },
        [
          Boundary.catch({ fallback: () => h.span({ class: "inner-fb" }, "inner") }, [
            Effect.fail(new FooError({ msg: "inner" })),
          ]),
          h.span({ class: "sibling" }, "sibling"),
        ],
      ),
      root,
    );

    await waitFor(50);

    assert.ok(root.querySelector(".inner-fb"));
    assert.ok(root.querySelector(".sibling"), "Sibling outside inner boundary should render");
    assert.equal(outerCalled, false);

    await Effect.runPromise(handle.unmount());
  });
});

// ── Nested: inner re-raises, outer catches ────────────────────────────────────

describe("nested: inner re-raises, outer catches", () => {
  it("outer catches when inner boundary re-raises (wrong tag)", async () => {
    createTestDOM();
    const root = createRoot();

    const handle = await runMount(
      Boundary.catchCause({ fallback: () => h.span({ class: "outer-fb" }, "outer") }, [
        Boundary.catchTag({ tag: "Bar", fallback: () => h.span({ class: "inner-fb" }, "inner") }, [
          failWith("Foo"),
        ]),
      ]),
      root,
    );

    await waitFor(80);

    assert.ok(root.querySelector(".outer-fb"), "Outer should catch re-raised FooError");
    assert.equal(root.querySelector(".inner-fb"), null, "Inner fallback should not render");

    await Effect.runPromise(handle.unmount());
  });
});

// ── AC8: no boundary (failure exit left unobserved, runtime reports it) ───────
// With no enclosing Boundary the subscription fiber's failure exit is left
// unobserved; the Effect runtime logs "Fiber terminated with an unhandled
// error" at the "Error" level (raised from the default "Debug"), annotated with
// `weft.region` identifying the failing region/prop. Interruption stays silent.

describe("AC8: no boundary: runtime reports unhandled subscription failure", () => {
  it("logs exactly one Error entry with the cause and a child:stream-<id> region for a failing stream child", async () => {
    createTestDOM();
    const root = createRoot();

    const failing = Stream.concat(
      Stream.make(h.span({ class: "live" }, "live")),
      Stream.fail(new Error("child-boom")),
    );

    const { handle, entries } = await runMountCapturingErrors(h.div({}, [failing]), root);

    await waitFor(80);

    assert.equal(entries.length, 1, "Exactly one unhandled failure should be reported");
    assert.ok(
      Cause.pretty(entries[0]!.cause).includes("child-boom"),
      "Logged cause should pretty-print the stream error",
    );
    assert.match(
      String(entries[0]!.annotations["weft.region"]),
      /^child:stream-\d+$/,
      "Log should carry the weft.region annotation for the stream child region",
    );

    await Effect.runPromise(handle.unmount());
  });

  it("annotates a failing attribute stream with attribute:<name>", async () => {
    createTestDOM();
    const root = createRoot();

    const failing = Stream.concat(Stream.make("v1"), Stream.fail(new Error("attr-boom")));

    const { handle, entries } = await runMountCapturingErrors(
      h.div({ "data-x": failing }, "content"),
      root,
    );

    await waitFor(80);

    assert.equal(entries.length, 1, "Exactly one unhandled failure should be reported");
    assert.ok(Cause.pretty(entries[0]!.cause).includes("attr-boom"));
    assert.equal(entries[0]!.annotations["weft.region"], "attribute:data-x");

    await Effect.runPromise(handle.unmount());
  });

  it("annotates a failing List.each source with list:stream-<id>", async () => {
    createTestDOM();
    const root = createRoot();

    const failingSource = Stream.concat(
      Stream.make(["a", "b"]),
      Stream.fail(new Error("list-boom")),
    );

    const { handle, entries } = await runMountCapturingErrors(
      h.ul({}, [List.each({ of: failingSource, by: (x) => x }, (x) => h.li({ id: x }, x))]),
      root,
    );

    await waitFor(80);

    assert.equal(entries.length, 1, "Exactly one unhandled failure should be reported");
    assert.ok(Cause.pretty(entries[0]!.cause).includes("list-boom"));
    assert.match(
      String(entries[0]!.annotations["weft.region"]),
      /^list:stream-\d+$/,
      "Log should carry the weft.region annotation for the list region",
    );

    await Effect.runPromise(handle.unmount());
  });

  it("reports a defect (die) in a stream child, not just typed failures", async () => {
    createTestDOM();
    const root = createRoot();

    const dying = Stream.concat(
      Stream.make(h.span({ class: "live" }, "live")),
      Stream.die(new Error("defect-boom")),
    );

    const { handle, entries } = await runMountCapturingErrors(h.div({}, [dying]), root);

    await waitFor(80);

    assert.equal(entries.length, 1, "The defect should be reported");
    assert.ok(Cause.pretty(entries[0]!.cause).includes("defect-boom"));
    assert.match(String(entries[0]!.annotations["weft.region"]), /^child:stream-\d+$/);

    await Effect.runPromise(handle.unmount());
  });

  it("stays silent on unmount interruption (no Error logs for teardown)", async () => {
    createTestDOM();
    const root = createRoot();

    // A never-completing stream child: unmount interrupts its subscription fiber.
    const pending = Stream.concat(Stream.make(h.span({ class: "live" }, "live")), Stream.never);

    const { handle, entries } = await runMountCapturingErrors(h.div({}, [pending]), root);

    await waitFor(30);
    await Effect.runPromise(handle.unmount());
    await waitFor(50);

    assert.equal(entries.length, 0, "Interruption during unmount must not be reported");
  });

  it("emits no runtime Error log when an enclosing Boundary handles the failure", async () => {
    createTestDOM();
    const root = createRoot();

    const failing = Stream.concat(
      Stream.make(h.span({ class: "live" }, "live")),
      Stream.fail(new FooError({ msg: "handled-boom" })),
    );

    const { handle, entries } = await runMountCapturingErrors(
      Boundary.catchCause({ fallback: () => h.span({ class: "fallback" }, "fb") }, [failing]),
      root,
    );

    await waitFor(80);

    assert.ok(root.querySelector(".fallback"), "Boundary should swap to the fallback");
    assert.equal(entries.length, 0, "Boundary-handled failures must not produce a runtime log");

    await Effect.runPromise(handle.unmount());
  });
});

// ============================================================================
// LM18 (loom.specs.md): interrupt-only causes never trigger recovery
// ============================================================================

describe("LM18: interrupt-only causes do not trigger boundary recovery", () => {
  it("a pump ending with an interrupt-only cause leaves content untouched (no fallback)", async () => {
    createTestDOM();
    const root = createRoot();

    let fallbackCalls = 0;
    const interruptingStream = Stream.concat(
      Stream.make(h.div({ class: "content" }, "live")),
      Stream.fromEffect(Effect.interrupt),
    );

    const handle = await runMount(
      Boundary.catchCause(
        {
          fallback: () => {
            fallbackCalls++;
            return h.span({ class: "fallback" }, "fb");
          },
        },
        [interruptingStream],
      ),
      root,
    );

    await waitFor(80);
    assert.equal(fallbackCalls, 0, "Interrupt-only exit must not reach boundary recovery");
    assert.equal(root.querySelector(".fallback"), null, "No fallback for interrupt-only exit");
    assert.ok(root.querySelector(".content"), "Content stays as-is");

    await Effect.runPromise(handle.unmount());
  });

  it("unmounting a boundary-enclosed region does not trigger recovery", async () => {
    createTestDOM();
    const root = createRoot();

    let fallbackCalls = 0;
    const liveStream = Stream.concat(
      Stream.make(h.div({ class: "content" }, "live")),
      Stream.never as Stream.Stream<never>,
    );

    const handle = await runMount(
      Boundary.catchCause(
        {
          fallback: () => {
            fallbackCalls++;
            return h.span({ class: "fallback" }, "fb");
          },
        },
        [liveStream],
      ),
      root,
    );

    await waitFor(50);
    assert.ok(root.querySelector(".content"));

    await Effect.runPromise(handle.unmount());
    await waitFor(80);
    assert.equal(fallbackCalls, 0, "Unmount teardown must not invoke the boundary fallback");
    assert.equal(root.querySelector(".fallback"), null, "Unmount must not render the fallback");
  });
});
