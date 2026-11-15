import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Effect, Stream, SubscriptionRef } from "effect";
import type { Renderable } from "@weftui/core/types";
import { h } from "@weftui/core";
import { renderToString as _renderToString } from "./render-to-string";
import { NoRpc } from "../__tests__/rpc-stub";

// Boundary-free trees: shadow `renderToString` with the no-op `NoRpc` layer
// pre-provided (the render fn requires an AppRpcClientTag unconditionally).
const renderToString = (n: Renderable) => Effect.provide(_renderToString(n), NoRpc);

const run = (node: Renderable) => Effect.runPromise(renderToString(node));

describe("renderToString - elements", () => {
  it("renders a simple element with escaped text content", async () => {
    const html = await run(h.p({}, "hello <b> & 'world'"));
    assert.equal(html, "<p>hello &lt;b&gt; &amp; &#x27;world&#x27;</p>");
  });

  it("renders an empty element", async () => {
    assert.equal(await run(h.div({})), "<div></div>");
  });

  it("renders nested elements and fragment children", async () => {
    const html = await run(h.div({}, [h.span({}, "a"), "b"]));
    assert.equal(html, "<div><span>a</span>b</div>");
  });
});

describe("renderToString - attributes", () => {
  it("serializes a string attribute and escapes its value", async () => {
    const html = await run(h.a({ href: 'x"&<>y' }, "link"));
    assert.equal(html, '<a href="x&quot;&amp;&lt;&gt;y">link</a>');
  });

  it('emits truthy boolean attributes as name="" and omits falsy ones', async () => {
    assert.equal(await run(h.input({ disabled: true })), '<input disabled="">');
    assert.equal(await run(h.input({ disabled: false })), "<input>");
  });

  it("skips null and undefined attributes", async () => {
    assert.equal(await run(h.div({ title: undefined })), "<div></div>");
    // `null` is not in the AttributeValue type, but must still be skipped at runtime.
    assert.equal(await run({ type: "div", props: { id: null } } as Renderable), "<div></div>");
  });

  it("skips children, ref, and event handler props", async () => {
    const html = await run(h.button({ onclick: () => {}, ref: undefined, id: "go" }, "x"));
    assert.equal(html, '<button id="go">x</button>');
  });
});

describe("renderToString - style", () => {
  it("serializes a style string", async () => {
    const html = await run(h.div({ style: "color: red" }));
    assert.equal(html, '<div style="color: red"></div>');
  });

  it("serializes a style object with camelCase keys", async () => {
    const html = await run(h.div({ style: { backgroundColor: "blue", fontWeight: 700 } }));
    assert.equal(html, '<div style="background-color: blue; font-weight: 700"></div>');
  });

  it("skips null/undefined style object values", async () => {
    const html = await run(h.div({ style: { color: undefined, margin: "0" } }));
    assert.equal(html, '<div style="margin: 0"></div>');
  });
});

describe("renderToString - reactive attributes", () => {
  it("AC-R1: resolves a Stream attribute to its first/current value", async () => {
    const html = await run(h.div({ id: Stream.make("a", "b", "c") }));
    assert.equal(html, '<div id="a"></div>');
  });

  it("AC-R2: resolves an Effect attribute value", async () => {
    const html = await run(h.div({ id: Effect.succeed("eff") }));
    assert.equal(html, '<div id="eff"></div>');
  });

  it("resolves a Stream style object property to its first/current value", async () => {
    const html = await run(h.div({ style: { color: Stream.make("red", "green") } }));
    assert.equal(html, '<div style="color: red"></div>');
  });

  it("AC-R4: resolves a non-terminating Stream attribute to its current value without hanging", async () => {
    const ref = await Effect.runPromise(SubscriptionRef.make("live"));
    const html = await run(h.div({ id: SubscriptionRef.changes(ref) }));
    assert.equal(html, '<div id="live"></div>');
  });
});

describe("renderToString - void elements", () => {
  it("renders void elements without a closing tag", async () => {
    assert.equal(await run(h.br({})), "<br>");
    assert.equal(await run(h.img({ src: "/a.png" })), '<img src="/a.png">');
  });

  it("ignores children on void elements", async () => {
    // Void elements accept no children in the JSX types, so build the node directly.
    assert.equal(
      await run({ type: "input", props: { children: "nope" } } as Renderable),
      "<input>",
    );
  });
});

describe("renderToString - svg", () => {
  it("serializes svg markup as-is (an HTML parser assigns the SVG namespace)", async () => {
    assert.equal(
      await run(
        h.svg({ viewBox: "0 0 10 10" }, [
          h.path({ d: "M0 0" }),
          h.foreignObject({}, [h.div({}, "x")]),
        ]),
      ),
      '<svg viewBox="0 0 10 10"><path d="M0 0"></path><foreignObject><div>x</div></foreignObject></svg>',
    );
  });
});
