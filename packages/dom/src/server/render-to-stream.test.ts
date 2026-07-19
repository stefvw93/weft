import * as assert from "node:assert/strict";
import { Boundary, h } from "@weftui/core";
import type { Renderable } from "@weftui/core/types";
import { Deferred, Effect, Fiber, Stream, SubscriptionRef } from "effect";
import { describe, it } from "vite-plus/test";
import {
  renderToStream as _renderToStream,
  renderToStreamHydratable as _renderToStreamHydratable,
} from "./render-to-stream";
import { renderToString as _renderToString } from "./render-to-string";
import { NoRpc } from "../__tests__/rpc-stub";

// These tests render boundary-free trees; the render fns require an AppRpcClientTag
// unconditionally, so shadow them with the no-op `NoRpc` layer pre-provided.
const renderToStream = (n: Renderable) => Stream.provide(_renderToStream(n), NoRpc);
const renderToStreamHydratable = (n: Renderable) =>
  Stream.provide(_renderToStreamHydratable(n), NoRpc);
const renderToString = (n: Renderable) => Effect.provide(_renderToString(n), NoRpc);

const run = (node: Renderable) => Effect.runPromise(Stream.mkString(renderToStream(node)));

// Set OBSERVE_STREAM=1 to watch the HTML accumulate chunk-by-chunk in real time.
const OBSERVE = process.env.OBSERVE_STREAM === "1";

describe("renderToStream - serialization parity", () => {
  it("renders elements, attributes, and escaped text", async () => {
    assert.equal(
      await run(h.p({}, "hello <b> & 'world'")),
      "<p>hello &lt;b&gt; &amp; &#x27;world&#x27;</p>",
    );
    assert.equal(await run(h.div({})), "<div></div>");
    assert.equal(await run(h.div({}, [h.span({}, "a"), "b"])), "<div><span>a</span>b</div>");
    assert.equal(
      await run(h.a({ href: 'x"&<>y' }, "link")),
      '<a href="x&quot;&amp;&lt;&gt;y">link</a>',
    );
    assert.equal(await run(h.input({ disabled: true })), '<input disabled="">');
    assert.equal(await run(h.input({ disabled: false })), "<input>");
  });

  it("serializes style strings and objects", async () => {
    assert.equal(await run(h.div({ style: "color: red" })), '<div style="color: red"></div>');
    assert.equal(
      await run(h.div({ style: { backgroundColor: "blue", fontWeight: 700 } })),
      '<div style="background-color: blue; font-weight: 700"></div>',
    );
  });

  it("AC-R1/AC-R2: resolves reactive attributes to their first/current emission", async () => {
    assert.equal(await run(h.div({ id: Stream.make("a", "b", "c") })), '<div id="a"></div>');
    assert.equal(await run(h.div({ id: Effect.succeed("eff") })), '<div id="eff"></div>');
  });

  it("AC-R4: a non-terminating reactive attribute resolves to its current value without hanging", async () => {
    const ref = await Effect.runPromise(SubscriptionRef.make("live"));
    assert.equal(await run(h.div({ id: SubscriptionRef.changes(ref) })), '<div id="live"></div>');
  });

  it("renders void elements without a closing tag", async () => {
    assert.equal(await run(h.br({})), "<br>");
    assert.equal(await run(h.img({ src: "/a.png" })), '<img src="/a.png">');
  });

  it("AC-EQ1: stream output equals renderToString output", async () => {
    const node = h.div({ id: Stream.make("x", "y") }, [
      h.span({}, "a"),
      1,
      2,
      3,
      Effect.succeed(h.em({}, "e")),
    ]);
    const fromStream = await Effect.runPromise(Stream.mkString(renderToStream(node)));
    const fromString = await Effect.runPromise(renderToString(node));
    assert.equal(fromStream, fromString);
  });
});

describe("renderToStream - streaming behavior", () => {
  it("AC-ST1: emits chunks in document order", async () => {
    const chunks = await Effect.runPromise(
      Stream.runCollect(renderToStream(h.div({}, [h.span({}, "a"), "b"]))),
    );
    assert.deepEqual(chunks, ["<div>", "<span>", "a", "</span>", "b", "</div>"]);
  });

  it("AC-ST2: empty/boolean/null nodes contribute no chunks", async () => {
    for (const node of [null, undefined, true, false] as Renderable[]) {
      const chunks = await Effect.runPromise(Stream.runCollect(renderToStream(node)));
      assert.equal(chunks.length, 0);
    }
  });

  it("AC-ST3: flushes shell chunks before a delayed node resolves", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const reached = yield* Deferred.make<void>();
        const collected: string[] = [];

        const slow = Effect.gen(function* () {
          yield* Deferred.succeed(reached, undefined);
          yield* Deferred.await(gate);
          return "late";
        });

        const node = h.div({}, [h.span({}, "shell"), slow]);

        const fiber = yield* Effect.forkChild(
          Stream.runForEach(renderToStream(node), (chunk) =>
            Effect.sync(() => {
              collected.push(chunk);
            }),
          ),
        );

        yield* Deferred.await(reached);
        const beforeGate = collected.join("");
        assert.ok(beforeGate.includes("<span>shell</span>"), "shell flushed before delay resolved");
        assert.ok(!beforeGate.includes("late"), "delayed content not yet emitted");

        yield* Deferred.succeed(gate, undefined);
        yield* Fiber.join(fiber);
        assert.equal(collected.join(""), "<div><span>shell</span>late</div>");
      }),
    );
  });

  it("AC-ST4: fails the stream on an unsupported node type", async () => {
    const result = await Effect.runPromiseExit(
      Stream.runDrain(renderToStream({ type: 123, props: {} } as unknown as Renderable)),
    );
    assert.equal(result._tag, "Failure");
  });

  it("AC-ST5: builds a large tree with staggered async branches in document order", async () => {
    const delayed = (millis: number, node: Renderable) =>
      Effect.succeed(node).pipe(Effect.delay(`${millis} millis`));

    const tree = h.html({}, [
      h.head({}, [h.title({}, "Streaming demo")]),
      h.body({}, [
        h.header({}, [h.h1({}, "Shell")]),
        h.main({}, [
          delayed(40, h.section({ id: "a" }, "branch A")),
          delayed(120, h.section({ id: "b" }, "branch B")),
          h.ul(
            {},
            [1, 2, 3].map((n) => h.li({}, `item ${n}`)),
          ),
          delayed(80, h.footer({}, "branch C")),
        ]),
      ]),
    ]);

    let html = "";
    const result = await Effect.runPromise(
      renderToStream(tree).pipe(
        Stream.tap((chunk) =>
          Effect.sync(() => {
            html += chunk;
          }).pipe(
            Effect.andThen(
              OBSERVE ? Effect.log(`+${JSON.stringify(chunk)} | so far: ${html}`) : Effect.void,
            ),
          ),
        ),
        Stream.mkString,
      ),
    );

    assert.equal(result, html);
    assert.ok(result.startsWith("<html>") && result.endsWith("</html>"));
    assert.ok(result.includes('<section id="a">branch A</section>'));
    assert.ok(result.includes('<section id="b">branch B</section>'));
    assert.ok(result.includes("<footer>branch C</footer>"));
    assert.ok(result.indexOf('id="b"') < result.indexOf("branch C"));
  });
});

describe("renderToStream - function components", () => {
  it("AC-FC1/FC2: renders a component returning an element inline", async () => {
    const Greeting = () => h.p({}, "hello");
    assert.equal(await run(Greeting()), "<p>hello</p>");
  });

  it("AC-FC1: passes props verbatim to the component", async () => {
    const Greeting = ({ name }: { name: string }) => h.p({}, `hi ${name}`);
    assert.equal(await run(Greeting({ name: "ada" })), "<p>hi ada</p>");
  });

  it("AC-FC2: renders a component returning a fragment", async () => {
    const Pair = () => h.fragment([h.span({}, "a"), h.span({}, "b")]);
    assert.equal(await run(Pair()), "<span>a</span><span>b</span>");
  });

  it("AC-FC3: collapses a component returning an Effect/Stream to its first/current emission", async () => {
    const FromEffect = () => Effect.succeed(h.em({}, "e"));
    assert.equal(await run(FromEffect()), "<em>e</em>");

    const FromStream = () => Stream.make(h.em({}, "a"), h.em({}, "b"));
    assert.equal(await run(FromStream()), "<em>a</em>");
  });

  it("AC-FC4: renders nested components", async () => {
    const Inner = ({ label }: { label: string }) => h.span({}, label);
    const Outer = () => h.div({}, [Inner({ label: "x" }), Inner({ label: "y" })]);
    assert.equal(await run(Outer()), "<div><span>x</span><span>y</span></div>");
  });

  it("AC-FC3: hydratable wraps a component's reactive result in markers", async () => {
    const Live = () => Stream.make(h.em({}, "now"));
    const html = await Effect.runPromise(Stream.mkString(renderToStreamHydratable(Live())));
    assert.equal(html, "<!-- stream-start-1 --><em>now</em><!-- stream-end-1 -->");
  });
});

// ============================================================================
// SSR Suspense tests: AC-SS1 through AC-SS7
// ============================================================================

describe("renderToStream - Suspense SSR", () => {
  // Helper: async component backed by a Deferred gate so tests can control timing.
  function makeGatedComponent(gate: Deferred.Deferred<void>, content: Renderable) {
    return () =>
      Effect.gen(function* () {
        yield* Deferred.await(gate);
        return content;
      });
  }

  it("AC-SS1: renderToString emits fallback only: no markers, no patches", async () => {
    const SlowChild = () => Effect.succeed(h.p({}, "resolved"));
    const html = await Effect.runPromise(
      renderToString(Boundary.suspend({ fallback: h.span({}, "loading") }, [SlowChild()])),
    );
    assert.equal(html, "<span>loading</span>");
    assert.ok(!html.includes("suspense-start"), "no start marker");
    assert.ok(!html.includes("suspense-end"), "no end marker");
    assert.ok(!html.includes("<template"), "no template tag");
    assert.ok(!html.includes("<script"), "no script tag");
  });

  it("AC-SS1: renderToString renders nested Suspense fallback inline", async () => {
    const html = await Effect.runPromise(
      renderToString(
        Boundary.suspend({ fallback: h.div({}, "outer loading") }, [
          Boundary.suspend({ fallback: h.div({}, "inner loading") }, [
            Effect.succeed(h.p({}, "inner content")),
          ]),
        ]),
      ),
    );
    assert.equal(
      html,
      "<div>outer loading</div>",
      "only outer fallback rendered; inner boundary never reached",
    );
    assert.ok(!html.includes("suspense-start"));
    assert.ok(!html.includes("<template"));
  });

  it("AC-SS2: renderToStream emits fallback+markers inline, patch appended after main", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const GatedChild = makeGatedComponent(gate, h.p({}, "resolved"));

        const chunks: string[] = [];

        const fiber = yield* Effect.forkChild(
          Stream.runForEach(
            renderToStream(
              h.div({}, [Boundary.suspend({ fallback: h.span({}, "loading") }, [GatedChild()])]),
            ),
            (chunk) =>
              Effect.sync(() => {
                chunks.push(chunk);
              }),
          ),
        );

        yield* Effect.sleep("10 millis");
        const mainHtml = chunks.join("");

        assert.ok(mainHtml.includes("<div>"), "outer div present");
        assert.ok(mainHtml.includes("<!-- suspense-start-1 -->"), "start marker present");
        assert.ok(mainHtml.includes("<span>loading</span>"), "fallback present");
        assert.ok(mainHtml.includes("<!-- suspense-end-1 -->"), "end marker present");
        assert.ok(!mainHtml.includes("<template"), "patch not yet emitted");

        yield* Deferred.succeed(gate, undefined);
        yield* Fiber.join(fiber);

        const fullHtml = chunks.join("");
        assert.ok(fullHtml.includes('<template id="ef-s-1">'), "template patch present");
        assert.ok(fullHtml.includes("<p>resolved</p>"), "resolved content in patch");
        assert.ok(fullHtml.includes("<script>"), "swap script present");
        assert.ok(fullHtml.includes("suspense-start-1"), "start marker text in script");
        assert.ok(fullHtml.includes("suspense-end-1"), "end marker text in script");
      }),
    );
  });

  it("AC-SS2: renderToStream with sync child terminates immediately (no open tail)", async () => {
    const html = await Effect.runPromise(
      Stream.mkString(
        renderToStream(
          Boundary.suspend({ fallback: h.span({}, "loading") }, [Effect.succeed(h.p({}, "sync"))]),
        ),
      ),
    );
    assert.ok(html.includes("<!-- suspense-start-1 -->"), "start marker");
    assert.ok(html.includes("<!-- suspense-end-1 -->"), "end marker");
    assert.ok(html.includes('<template id="ef-s-1">'), "patch emitted");
    assert.ok(html.includes("<p>sync</p>"), "content in patch");
  });

  it("AC-SS3: renderToStreamHydratable: patch includes stream markers for reactive children", async () => {
    const html = await Effect.runPromise(
      Stream.mkString(
        renderToStreamHydratable(
          Boundary.suspend({ fallback: h.span({}, "loading") }, [
            Effect.succeed(h.div({}, [Stream.make("live")])),
          ]),
        ),
      ),
    );
    assert.ok(html.includes('<template id="ef-s-1">'), "patch present");
    assert.ok(html.includes("stream-start-"), "reactive markers in patch content");
    assert.ok(html.includes("stream-end-"), "reactive end marker in patch content");
    assert.ok(html.includes("live"), "reactive value in patch content");
  });

  it("AC-SS4: multiple boundaries: patches emitted in resolution order", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const gateA = yield* Deferred.make<void>();
        const gateB = yield* Deferred.make<void>();

        const SlowA = makeGatedComponent(gateA, h.p({}, "branch A"));
        const SlowB = makeGatedComponent(gateB, h.p({}, "branch B"));

        const html = yield* Effect.gen(function* () {
          const fiberHtml = yield* Effect.forkChild(
            Stream.mkString(
              renderToStream(
                h.fragment([
                  Boundary.suspend({ fallback: h.span({}, "loading A") }, [SlowA()]),
                  Boundary.suspend({ fallback: h.span({}, "loading B") }, [SlowB()]),
                ]),
              ),
            ),
          );

          yield* Effect.sleep("5 millis");
          yield* Deferred.succeed(gateB, undefined);
          yield* Effect.sleep("5 millis");
          yield* Deferred.succeed(gateA, undefined);

          return yield* Fiber.join(fiberHtml);
        });

        assert.ok(html.includes('<template id="ef-s-1">'), "patch for boundary 1");
        assert.ok(html.includes('<template id="ef-s-2">'), "patch for boundary 2");
        assert.ok(html.includes("<p>branch A</p>"), "branch A resolved");
        assert.ok(html.includes("<p>branch B</p>"), "branch B resolved");

        const idxB = html.indexOf('<template id="ef-s-2">');
        const idxA = html.indexOf('<template id="ef-s-1">');
        assert.ok(idxB < idxA, "B patch emitted before A patch (resolution order)");
      }),
    );
  });

  it("AC-SS5: nested Suspense: outer patch has inner fallback; inner patch emitted separately", async () => {
    const html = await Effect.runPromise(
      Stream.mkString(
        renderToStream(
          Boundary.suspend({ fallback: h.span({}, "outer loading") }, [
            Effect.succeed(
              Boundary.suspend({ fallback: h.span({}, "inner loading") }, [
                Effect.succeed(h.p({}, "inner content")),
              ]),
            ),
          ]),
        ),
      ),
    );

    const outerTemplateMatch = html.match(/<template id="ef-s-1">([\s\S]*?)<\/template>/);
    assert.ok(outerTemplateMatch, "outer template present");
    const outerContent = outerTemplateMatch?.[1] ?? "";
    assert.ok(outerContent.includes("suspense-start-2"), "outer patch has inner start marker");
    assert.ok(outerContent.includes("inner loading"), "outer patch has inner fallback");
    assert.ok(outerContent.includes("suspense-end-2"), "outer patch has inner end marker");

    const innerTemplateMatch = html.match(/<template id="ef-s-2">([\s\S]*?)<\/template>/);
    assert.ok(innerTemplateMatch, "inner template present");
    const innerContent = innerTemplateMatch?.[1] ?? "";
    assert.ok(innerContent.includes("<p>inner content</p>"), "inner patch has resolved content");
  });

  it("AC-SS6: never-resolving boundary keeps stream open (no timeout)", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const neverResolves = yield* Deferred.make<void>();
        const NeverChild = makeGatedComponent(neverResolves, h.p({}, "never"));

        const chunks: string[] = [];

        const fiber = yield* Effect.forkChild(
          Stream.runForEach(
            renderToStream(
              Boundary.suspend({ fallback: h.span({}, "forever loading") }, [NeverChild()]),
            ),
            (chunk) =>
              Effect.sync(() => {
                chunks.push(chunk);
              }),
          ),
        );

        yield* Effect.sleep("30 millis");
        const html = chunks.join("");

        assert.ok(html.includes("<!-- suspense-start-1 -->"), "start marker emitted");
        assert.ok(html.includes("<span>forever loading</span>"), "fallback emitted");
        assert.ok(html.includes("<!-- suspense-end-1 -->"), "end marker emitted");

        const poll = fiber.pollUnsafe();
        assert.ok(poll === undefined, "stream still open: patch not yet emitted");
        assert.ok(!html.includes("<template"), "no patch emitted yet");

        yield* Fiber.interrupt(fiber);
      }),
    );
  });

  it("AC-SS7: no Suspense in tree: output identical, stream terminates immediately", async () => {
    const node = h.div({}, [h.span({}, "hello"), Effect.succeed("world")]);

    const fromOldStream = "<div><span>hello</span>world</div>";
    const fromNew = await Effect.runPromise(Stream.mkString(renderToStream(node)));
    assert.equal(fromNew, fromOldStream, "output identical when no Suspense");
  });

  it("AC-SS7: no Suspense hydratable: output identical to pre-Suspense", async () => {
    const Live = () => Stream.make(h.em({}, "now"));
    const html = await Effect.runPromise(
      Stream.mkString(renderToStreamHydratable(h.div({}, [Live()]))),
    );
    assert.equal(html, "<div><!-- stream-start-1 --><em>now</em><!-- stream-end-1 --></div>");
  });
});
