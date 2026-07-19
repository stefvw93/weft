import * as assert from "node:assert/strict";
import { Cause, Effect, Exit, Stream } from "effect";
import { JSDOM } from "jsdom";
import { describe, it } from "vite-plus/test";
import { h } from "@weftui/core";
import { HydrationMismatchError } from "~/data";
import * as WeftApp from "./weft-app";
import {
  renderToString as _renderToString,
  renderToStringHydratable as _renderToStringHydratable,
} from "~/server";
import type { Renderable } from "@weftui/core/types";
import { NoRpc } from "../__tests__/rpc-stub";

// These trees contain no `Boundary.rpc`; shadow the SSR fns with the no-op `NoRpc`
// layer pre-provided (they require an AppRpcClientTag unconditionally).
const renderToString = (n: Renderable) => Effect.provide(_renderToString(n), NoRpc);
const renderToStringHydratable = (n: Renderable) =>
  Effect.provide(_renderToStringHydratable(n), NoRpc);

// ============================================================================
// Test setup
// ============================================================================

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

/** Renders `app` to hydratable HTML and seeds it into a fresh root. */
async function seedServerHtml(app: Renderable): Promise<HTMLElement> {
  const root = createRoot();
  const html = await Effect.runPromise(renderToStringHydratable(app));
  root.innerHTML = html;
  return root;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// AC-H10: server marker output
// ============================================================================

describe("AC-H10: hydratable server markers", () => {
  it("matches plain renderToString when there are no reactive regions", async () => {
    const app = h.div({ class: "card" }, [h.span({}, "hello")]);
    const plain = await Effect.runPromise(renderToString(app));
    const hydratable = await Effect.runPromise(renderToStringHydratable(app));
    assert.equal(hydratable, plain);
  });

  it("wraps a reactive region in stream-start/stream-end markers", async () => {
    const app = h.div({}, [Stream.make("x")]);
    const html = await Effect.runPromise(renderToStringHydratable(app));
    assert.equal(html, "<div><!-- stream-start-1 -->x<!-- stream-end-1 --></div>");
  });

  it("emits an empty marker pair for a region with no last emission", async () => {
    const app = h.div({}, [Stream.empty]);
    const html = await Effect.runPromise(renderToStringHydratable(app));
    assert.equal(html, "<div><!-- stream-start-1 --><!-- stream-end-1 --></div>");
  });
});

// ============================================================================
// AC-H1 / AC-H2: adopt static DOM without clearing
// ============================================================================

describe("AC-H1/AC-H2: static adoption", () => {
  it("hydrates static structure without re-creating nodes", async () => {
    createTestDOM();
    const app = h.div({ class: "card" }, [h.span({}, "hello")]);
    const root = await seedServerHtml(app);

    const serverDiv = root.firstChild as HTMLElement;
    const serverSpan = serverDiv.firstChild as HTMLElement;
    (serverDiv as unknown as { __sentinel?: boolean }).__sentinel = true;

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    // Same node objects survive hydration (root not cleared).
    assert.equal(root.firstChild, serverDiv);
    assert.equal((serverDiv as unknown as { __sentinel?: boolean }).__sentinel, true);
    assert.equal(serverDiv.firstChild, serverSpan);
    assert.equal(serverSpan.textContent, "hello");
  });
});

// ============================================================================
// AC-H3: event handlers attach during hydration
// ============================================================================

describe("AC-H3: event handlers", () => {
  it("attaches an Effect-returning click handler that fires post-hydrate", async () => {
    const dom = createTestDOM();
    let fired = 0;
    const app = h.button(
      {
        onclick: () =>
          Effect.sync(() => {
            fired++;
          }),
      },
      "click",
    );
    const root = await seedServerHtml(app);

    // Server HTML carries no handler attribute.
    assert.equal(root.innerHTML, "<button>click</button>");

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    const button = root.querySelector("button");
    assert.ok(button);
    button?.dispatchEvent(new dom.window.Event("click"));
    await waitFor(50);

    assert.equal(fired, 1);
  });
});

// ============================================================================
// AC-H4: reactive children patch within their markers
// ============================================================================

describe("AC-H4: reactive children", () => {
  it("patches only between markers, leaving sibling text intact", async () => {
    createTestDOM();
    const app = h.div({}, ["x", Stream.make("a", "b"), "y"]);
    const root = await seedServerHtml(app);

    const div = root.firstChild as HTMLElement;
    const before = div.firstChild as Text; // "x"
    const after = div.lastChild as Text; // "y"

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));
    await waitFor(50);

    // Sibling text nodes are the same objects (untouched by the region update).
    assert.equal(div.firstChild, before);
    assert.equal(div.lastChild, after);
    assert.equal(before.data, "x");
    assert.equal(after.data, "y");

    // Region settled on the stream's last emission.
    assert.equal(div.textContent, "xby");
  });
});

// ============================================================================
// AC-H5: reactive attributes re-subscribe
// ============================================================================

describe("AC-H5: reactive attributes", () => {
  it("re-subscribes to a reactive attribute on the adopted element", async () => {
    createTestDOM();
    const app = h.div({ id: Stream.make("a", "b") }, "hi");
    const root = await seedServerHtml(app);

    const serverDiv = root.firstChild as HTMLElement;
    assert.equal(serverDiv.id, "a"); // server collapsed to first/current emission

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));
    await waitFor(50);

    // Same element, subscription drove it to the stream's last emission.
    assert.equal(root.firstChild, serverDiv);
    assert.equal(serverDiv.id, "b");
  });
});

// ============================================================================
// AC-H6: coalesced adjacent text
// ============================================================================

describe("AC-H6: adjacent text splitting", () => {
  it("splits a coalesced text node across adjacent text children", async () => {
    createTestDOM();
    const app = h.div({}, ["a", "b"]);
    const root = await seedServerHtml(app);

    const div = root.firstChild as HTMLElement;
    assert.equal(div.childNodes.length, 1); // server coalesced "a"+"b" into one node

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));

    assert.equal(div.textContent, "ab");
    assert.equal(div.childNodes.length, 2); // split into two adopted text nodes
  });
});

// ============================================================================
// AC-H7: empty reactive region
// ============================================================================

describe("AC-H7: empty reactive region", () => {
  it("hydrates an empty marker pair without error", async () => {
    createTestDOM();
    const app = h.div({}, [h.span({}, "keep"), Stream.empty]);
    const root = await seedServerHtml(app);

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));
    await waitFor(50);

    const div = root.firstChild as HTMLElement;
    assert.equal(div.querySelector("span")?.textContent, "keep");
    // Both markers preserved as the empty region's anchors.
    const comments = Array.from(div.childNodes).filter((n) => n.nodeType === 8);
    assert.equal(comments.length, 2);
  });
});

// ============================================================================
// AC-H8: structural mismatch fails
// ============================================================================

describe("AC-H8: structural mismatch", () => {
  it("fails with HydrationMismatchError on a tag mismatch", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = "<span>hi</span>";

    const exit = await Effect.runPromiseExit(
      WeftApp.hydrate(WeftApp.make(), h.div({}, "hi"), root),
    );
    assert.ok(Exit.isFailure(exit));
    const error = Cause.squash(exit.cause);
    assert.ok(error instanceof HydrationMismatchError);
    assert.equal((error as HydrationMismatchError).expected, "<div>");
  });

  it("fails when a reactive marker is missing", async () => {
    createTestDOM();
    const root = createRoot();
    root.innerHTML = "<div>plain</div>"; // no markers

    const exit = await Effect.runPromiseExit(
      WeftApp.hydrate(WeftApp.make(), h.div({}, [Stream.make("x")]), root),
    );
    assert.ok(Exit.isFailure(exit));
    const error = Cause.squash(exit.cause);
    assert.ok(error instanceof HydrationMismatchError);
  });
});

// ============================================================================
// AC-H9: unmount parity
// ============================================================================

describe("AC-H9: unmount", () => {
  it("returns an idempotent unmount handle", async () => {
    createTestDOM();
    const app = h.div({ id: Stream.make("a", "b") }, "hi");
    const root = await seedServerHtml(app);

    const handle = await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));
    // Effect 4 forks the reactive-prop subscription lazily, so let it drain the
    // synchronous stream (settling the id to "b") before unmount tears it down.
    await waitFor(50);
    await Effect.runPromise(handle.unmount());
    // Second call must be a no-op (idempotent), not throw.
    await Effect.runPromise(handle.unmount());

    assert.equal((root.firstChild as HTMLElement).id, "b");
  });
});

// ============================================================================
// AC-H11: flash-free resume (first emission hydrated in place)
// ============================================================================

describe("AC-H11: flash-free resume", () => {
  it("preserves node identity when the first emission matches the adopted DOM", async () => {
    createTestDOM();
    const app = h.div({}, [Stream.make(h.span({}, "hi"))]);
    const root = await seedServerHtml(app);

    // The server-rendered <span> sits between the region's markers; tag it so we
    // can tell whether hydration adopts it (flash-free) or re-creates it.
    const serverSpan = root.querySelector("span");
    assert.ok(serverSpan);
    (serverSpan as unknown as { __sentinel?: boolean }).__sentinel = true;

    await Effect.runPromise(WeftApp.hydrate(WeftApp.make(), app, root));
    await waitFor(50);

    // Same node object survives the first emission — adopted, not re-rendered.
    const span = root.querySelector("span");
    assert.equal(span, serverSpan);
    assert.equal((span as unknown as { __sentinel?: boolean }).__sentinel, true);
    assert.equal(span?.textContent, "hi");
  });
});

// ============================================================================
// AC-H12: graceful divergence (patch + console.error, no failure)
// ============================================================================

describe("AC-H12: graceful divergence", () => {
  it("patches the region and logs when the first emission diverges", async () => {
    createTestDOM();
    const root = createRoot();
    // Seed a region whose interior diverges from the app's first emission.
    root.innerHTML = "<div><!-- stream-start-1 --><span>OLD</span><!-- stream-end-1 --></div>";

    const app = h.div({}, [Stream.make(h.span({}, "NEW"))]);

    const originalError = console.error;
    let errorCalls = 0;
    console.error = () => {
      errorCalls++;
    };

    try {
      const exit = await Effect.runPromiseExit(WeftApp.hydrate(WeftApp.make(), app, root));
      await waitFor(50);

      // No HydrationMismatchError surfaced: the region is recoverable.
      assert.ok(Exit.isSuccess(exit));
      // Region patched to the correct first value.
      assert.equal(root.querySelector("span")?.textContent, "NEW");
      // Divergence was reported.
      assert.equal(errorCalls, 1);
    } finally {
      console.error = originalError;
    }
  });
});
