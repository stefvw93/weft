import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Cause, Data, Deferred, Effect, Stream } from "effect";
import { Boundary, h } from "@weftui/core";
import type { Renderable } from "@weftui/core";
import { JSDOM } from "jsdom";
import { makeErrorLogCapture } from "../__tests__/log-capture";
import * as WeftApp from "./weft-app";

// ── Helpers ───────────────────────────────────────────────────────────────────

function createTestDOM(): JSDOM {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Comment = dom.window.Comment;
  global.Text = dom.window.Text;
  return dom;
}

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

/** Polls `predicate` until it holds or `ms` elapses. */
async function until(predicate: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) {
      throw new Error("condition not met in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Captures `console.error` calls for the duration of `run`. */
async function capturingConsoleError<A>(run: () => Promise<A>): Promise<{
  result: A;
  errors: unknown[][];
}> {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    const result = await run();
    return { result, errors };
  } finally {
    console.error = original;
  }
}

/**
 * Runs `hydrate` with a replacement logger that records every `Error`-level
 * log entry's `Cause` and annotations, so tests can assert that a no-boundary
 * region failure is reported by the runtime (with its `weft.region`
 * annotation) rather than silently swallowed.
 */
async function runHydrateCapturingErrors(app: Renderable, root: HTMLElement) {
  const { entries, logger } = makeErrorLogCapture();
  const handle = await Effect.runPromise(WeftApp.hydrate(WeftApp.make(logger), app, root));
  return { handle, entries };
}

class LateError extends Data.TaggedError("Late")<{ msg: string }> {}
class NopeError extends Data.TaggedError("Nope")<{ code: number }> {}
class MissingError extends Data.TaggedError("Missing")<{ msg: string }> {}

/**
 * A never-resolving suspended child whose error union carries
 * {@link MissingError}, so a `catchTag({ tag: "Missing" })` above it
 * type-checks. The replayed failure comes from the sentinel, never from this
 * effect: it must not run at hydrate.
 */
const neverChild = Effect.never as Effect.Effect<never, MissingError>;

/**
 * A reactive region whose first emission is `"ok"` (matching the server
 * snapshot) and whose stream fails with {@link LateError} once `trigger`
 * resolves: a deterministic post-hydrate live failure. The error union also
 * carries {@link NopeError} (never raised) so a `catchTag({ tag: "Nope" })`
 * type-checks while exercising the no-match propagation path.
 */
function failAfterFirst(
  trigger: Deferred.Deferred<void>,
): Stream.Stream<string, LateError | NopeError> {
  return Stream.make("ok").pipe(
    Stream.concat(
      Stream.fromEffect(
        Deferred.await(trigger).pipe(
          Effect.flatMap(() => Effect.fail(new LateError({ msg: "late-boom" }))),
        ),
      ),
    ),
  );
}

/** The hand-built server snapshot for `h.div({}, [<reactive region>])`. */
const SERVER_REGION_HTML = "<div><!-- stream-start-1 -->ok<!-- stream-end-1 --></div>";

// ── AC-H13: failure-boundary live machinery at hydrate ───────────────────────

describe("AC-H13: failure-boundary live machinery", () => {
  it("installs boundary markers and swaps the extent to the fallback on a reported live failure", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = SERVER_REGION_HTML;

    const trigger = await Effect.runPromise(Deferred.make<void>());
    const app = Boundary.catch({ fallback: () => h.p({ id: "fb" }, "recovered") }, [
      h.div({}, [failAfterFirst(trigger)]),
    ]);

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    // Success path: server snapshot adopted, boundary markers inserted (the only
    // success-path DOM mutation: AC-H11 note).
    assert.ok(root.textContent?.includes("ok"));
    assert.ok(root.innerHTML.includes("boundary-start"));
    assert.ok(root.innerHTML.includes("boundary-end"));
    assert.equal(root.querySelector("#fb"), null);

    // Live failure → recovery swap to the fallback, extent removed.
    await Effect.runPromise(Deferred.succeed(trigger, void 0));
    await until(() => root.querySelector("#fb") !== null);
    assert.equal(root.querySelector("div"), null);
    assert.equal(root.querySelector("#fb")?.textContent, "recovered");
  });

  it("a match returning null propagates the failure to the parent boundary (mount AC15 parity)", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = SERVER_REGION_HTML;

    const trigger = await Effect.runPromise(Deferred.make<void>());
    // The inner catchTag does not match LateError → null → parent handles.
    const inner = Boundary.catchTag(
      { tag: "Nope", fallback: () => h.p({ id: "inner" }, "inner") },
      [h.div({}, [failAfterFirst(trigger)])],
    );
    const app = Boundary.catch({ fallback: () => h.p({ id: "outer" }, "outer") }, [inner]);

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));
    await Effect.runPromise(Deferred.succeed(trigger, void 0));

    await until(() => root.querySelector("#outer") !== null);
    assert.equal(root.querySelector("#inner"), null);
    assert.equal(root.querySelector("div"), null);
  });

  it("AC-H8 unchanged: a static mismatch inside boundary children still hard-fails (not routed to match)", async () => {
    createTestDOM();
    const root = createRoot();
    // Server snapshot diverges structurally: a <span> where the tree has <div>.
    root.innerHTML = "<span>wrong</span>";

    const app = Boundary.catch({ fallback: () => h.p({ id: "fb" }, "nope") }, [h.div({}, "right")]);

    const exit = await Effect.runPromiseExit(WeftApp.hydrate(WeftApp.make(), app, root));
    assert.equal(exit._tag, "Failure");
    assert.equal(root.querySelector("#fb"), null);
  });
});

// ── AC-H14: substituted-suspense failure replay ───────────────────────────────

const SENTINEL =
  '<script type="application/json" data-weft-suspense-failure>' +
  '{"error":{"_tag":"Missing","msg":"gone"}}</script>';

/** The post-patch substituted region: retained markers + sentinel + content. */
const SUBSTITUTED_HTML =
  '<div id="layout"><!-- suspense-start-1 -->' +
  SENTINEL +
  '<p id="sub">substituted</p><!-- suspense-end-1 --></div>';

describe("AC-H14: substituted-suspense failure replay", () => {
  it("replays the sentinel failure to the nearest boundary and swaps the extent to the fallback", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = SUBSTITUTED_HTML;

    const app = Boundary.catchTag(
      { tag: "Missing", fallback: () => h.p({ id: "fb" }, "missing page") },
      [
        h.div({ id: "layout" }, [
          Boundary.suspend({ fallback: h.span({}, "loading") }, [neverChild]),
        ]),
      ],
    );

    // Resolves without HydrationMismatchError; the suspended child never runs.
    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    await until(() => root.querySelector("#fb") !== null);
    // The whole boundary extent (layout chrome + substituted region) is swapped.
    assert.equal(root.querySelector("#layout"), null);
    assert.equal(root.querySelector("#sub"), null);
    assert.equal(root.querySelector("#fb")?.textContent, "missing page");
  });

  it("with no enclosing boundary: logs and leaves the substituted static DOM standing", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = SUBSTITUTED_HTML;

    const app = h.div({ id: "layout" }, [
      Boundary.suspend({ fallback: h.span({}, "loading") }, [neverChild]),
    ]);

    const { errors } = await capturingConsoleError(() =>
      Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root)),
    );
    await waitFor(30);

    assert.ok(errors.length >= 1);
    assert.equal(root.querySelector("#sub")?.textContent, "substituted");
    assert.ok(root.innerHTML.includes("suspense-start-1"));
  });

  it("a sentinel that fails to parse logs and skips the region: never a hard hydrate failure", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML =
      '<div id="layout"><!-- suspense-start-1 -->' +
      '<script type="application/json" data-weft-suspense-failure>{not json</script>' +
      '<p id="sub">substituted</p><!-- suspense-end-1 --></div>';

    const app = Boundary.catch({ fallback: () => h.p({ id: "fb" }, "fb") }, [
      h.div({ id: "layout" }, [
        Boundary.suspend({ fallback: h.span({}, "loading") }, [neverChild]),
      ]),
    ]);

    const { errors } = await capturingConsoleError(() =>
      Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root)),
    );
    await waitFor(30);

    assert.ok(errors.length >= 1);
    // No replay happened: the static substituted DOM stands, no fallback swap.
    assert.equal(root.querySelector("#sub")?.textContent, "substituted");
    assert.equal(root.querySelector("#fb"), null);
  });

  it("a resolved (markers-removed) suspense boundary keeps the transparent walk", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = "<div><p>resolved</p></div>";

    const app = h.div({}, [
      Boundary.suspend({ fallback: h.span({}, "loading") }, [h.p({}, "resolved")]),
    ]);

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));
    assert.equal(root.querySelector("p")?.textContent, "resolved");
  });
});

// ── AC-H15: reactive-region failure routing ───────────────────────────────────

describe("AC-H15: reactive-region failure routing", () => {
  it("a region stream failure after hydrate reports to the nearest BoundaryContext", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = SERVER_REGION_HTML;

    const trigger = await Effect.runPromise(Deferred.make<void>());
    // The failing region sits under a nested static element: the report must
    // travel through the walk to the boundary installed above it.
    const app = Boundary.catch({ fallback: () => h.p({ id: "fb" }, "routed") }, [
      h.div({}, [failAfterFirst(trigger)]),
    ]);

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));
    await Effect.runPromise(Deferred.succeed(trigger, void 0));

    await until(() => root.querySelector("#fb") !== null);
    assert.equal(root.querySelector("#fb")?.textContent, "routed");
  });

  it("with no boundary the failure is reported by the runtime (region keeps its adopted content)", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = SERVER_REGION_HTML;

    const trigger = await Effect.runPromise(Deferred.make<void>());
    const app = h.div({}, [failAfterFirst(trigger)]);

    const { entries } = await runHydrateCapturingErrors(app, root);
    await Effect.runPromise(Deferred.succeed(trigger, void 0));
    await waitFor(50);

    // The adopted static DOM stands: no fallback, no teardown.
    assert.ok(root.textContent?.includes("ok"));
    // The failure is reported once at Error level, attributed to the region.
    assert.equal(entries.length, 1, "Exactly one unhandled failure should be reported");
    assert.ok(
      Cause.pretty(entries[0]!.cause).includes("Late"),
      "Logged cause should pretty-print the stream error's tag",
    );
    assert.match(
      String(entries[0]!.annotations["weft.region"]),
      /^hydrate:stream-1\b/,
      "Log should carry the weft.region annotation for the hydrated region",
    );
  });
});
