import * as assert from "node:assert/strict";
import { Boundary, Component, h } from "@weftui/core";
import type { Node } from "@weftui/core";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Context, Deferred, Effect, Layer, Schema } from "effect";
import { describe, test } from "vite-plus/test";
import { Router, notFound } from "~/index";
import { RouterServer } from "~/server/router-server";

/** Minimal rpc foundation: these pages have no `Boundary.rpc`, so `rpc` is optional but exercised. */
const NoopRpc = Rpc.make("Noop", { payload: Schema.Void, success: Schema.Void });
const NoopRpcs = RpcGroup.make(NoopRpc);
const NoopLive = NoopRpcs.toLayer({ Noop: () => Effect.void });
const rpc = { group: NoopRpcs, handlers: NoopLive } as const;

const Home = () => h.h1({}, "Home page");
const About = () => h.h1({}, "About page");
const Gone = () => notFound("/gone");
const NotFound = () => h.h1({}, "404: not found");

/** A passthrough layout `component`: renders the injected outlet directly. */
const passthroughLayout = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* outlet;
});

/** Reads its `:id` path param through the live match: proves platform-decoded path reaches render. */
const User = Component.gen(function* () {
  const { id } = yield* Router.params({ id: Schema.String });
  return yield* h.h1({}, `User ${id}`);
});

const def = Router.router(
  Router.layout(
    {
      component: Component.gen(function* () {
        const outlet = yield* Router.Outlet;
        return yield* h.div({ class: "shell" }, [outlet]);
      }),
    },
    [
      Router.route("", { component: Home }),
      Router.route("about", { component: About }),
      Router.route("gone", { component: Gone }),
      Router.route("users/:id", { component: User, path: { id: Schema.String } }),
      // Handler-arg props form: the leaf reads the live match's decoded `{ path, query }`
      // directly as props (no `Router.params`). Proves the outlet passes them in.
      Router.route("orders/:oid", {
        path: { oid: Schema.NumberFromString },
        query: { page: Schema.optional(Schema.NumberFromString) },
        component: ({ path, query }) => h.h1({}, `Order ${path.oid} page ${query.page ?? 0}`),
      }),
    ],
  ),
  { notFound: NotFound },
);

/** The document shell `component`: splices the app via the injected `Router.Outlet`. */
const document = Component.gen(function* () {
  const app = yield* Router.Outlet;
  return yield* h.html([h.head([h.title({}, "Test")]), h.body([h.div({ id: "root" }, [app])])]);
});

describe("RouterServer.render (dispatch via HttpApiBuilder)", () => {
  test("S1: platform matches the route and renders a hydratable document at status 200", async () => {
    const { html, status } = await Effect.runPromise(
      RouterServer.render(def, { document, rpc, url: "/about" }),
    );
    assert.equal(status, 200);
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(html.includes("About page"));
    assert.ok(html.includes('class="shell"'));
  });

  test("S1: platform-decoded path params reach the rendered page", async () => {
    const { html, status } = await Effect.runPromise(
      RouterServer.render(def, { document, rpc, url: "/users/42" }),
    );
    assert.equal(status, 200);
    assert.ok(html.includes("User 42"));
    assert.ok(html.includes('class="shell"'));
  });

  test("P1: leaf component receives the decoded handler-arg props (path + query)", async () => {
    const { html, status } = await Effect.runPromise(
      RouterServer.render(def, { document, rpc, url: "/orders/7?page=3" }),
    );
    assert.equal(status, 200);
    // Props passed in (not undefined) and decoded (`page` absent ⇒ default).
    assert.ok(html.includes("Order 7 page 3"));
    const noQuery = await Effect.runPromise(
      RouterServer.render(def, { document, rpc, url: "/orders/7" }),
    );
    assert.ok(noQuery.html.includes("Order 7 page 0"));
  });

  test("S2: no matching route ⇒ the not-found page with status 404 (sourced from platform)", async () => {
    const { html, status } = await Effect.runPromise(
      RouterServer.render(def, { document, rpc, url: "/missing" }),
    );
    assert.equal(status, 404);
    assert.ok(html.includes("404: not found"));
  });

  test("S2: a page raising RouterNotFound ⇒ not-found page with status 404", async () => {
    const { html, status } = await Effect.runPromise(
      RouterServer.render(def, { document, rpc, url: "/gone" }),
    );
    assert.equal(status, 404);
    assert.ok(html.includes("404: not found"));
  });

  test("toWebHandler: returns a text/html Response dispatched through the builder", async () => {
    const handler = RouterServer.toWebHandler(def, { document, rpc });
    const res = await handler(new Request("http://localhost/about"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    assert.ok((await res.text()).includes("About page"));
  });

  test("toWebHandler: a no-match request is served the not-found page at 404", async () => {
    const handler = RouterServer.toWebHandler(def, { document, rpc });
    const res = await handler(new Request("http://localhost/missing"));
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    assert.ok((await res.text()).includes("404: not found"));
  });
});

describe("RouterServer without rpc (rpc optional)", () => {
  // Fresh defs per test group: the web handler is memoized by (def, document), so
  // reusing the shared `def` would replay the rpc-configured handler from cache.
  const defNoRpc = Router.router(
    Router.layout({ component: passthroughLayout }, [Router.route("about", { component: About })]),
    { notFound: NotFound },
  );

  test("S1: renders pages normally when `rpc` is omitted", async () => {
    const { html, status } = await Effect.runPromise(
      RouterServer.render(defNoRpc, { document, url: "/about" }),
    );
    assert.equal(status, 200);
    assert.ok(html.includes("About page"));
  });

  test("a request to /_eui/rpc falls through to page dispatch (not-found page at 404)", async () => {
    const handler = RouterServer.toWebHandler(defNoRpc, { document });
    const res = await handler(new Request("http://localhost/_eui/rpc", { method: "POST" }));
    assert.equal(res.status, 404);
  });

  test("a Boundary.rpc page without `rpc` fails with a descriptive error", async () => {
    const defWithBoundary = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("stock", {
          component: () =>
            Boundary.rpc(
              NoopRpc,
              () => undefined,
              () => h.div({}, "stock"),
            ),
        }),
      ]),
      { notFound: NotFound },
    );
    const { html, status } = await Effect.runPromise(
      RouterServer.render(defWithBoundary, { document, url: "/stock" }),
    );
    // The descriptive stub failure surfaces as a server error, never a silent render.
    assert.equal(status, 500);
    assert.ok(!html.includes("stock"));
  });
});

describe("RouterServer.toStreamingWebHandler (streaming SSR)", () => {
  test("SW1/SW4: a no-suspense page streams a single-chunk body identical to the buffered handler's", async () => {
    const streaming = RouterServer.toStreamingWebHandler(def, { document, rpc });
    const res = await streaming(new Request("http://localhost/about"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    const body = await res.text();
    assert.ok(body.startsWith("<!DOCTYPE html>\n"));
    const buffered = await RouterServer.toWebHandler(def, { document, rpc })(
      new Request("http://localhost/about"),
    );
    assert.equal(body, await buffered.text());
  });

  test("SW1: a platform no-match streams the not-found page at 404", async () => {
    const streaming = RouterServer.toStreamingWebHandler(def, { document, rpc });
    const res = await streaming(new Request("http://localhost/missing"));
    assert.equal(res.status, 404);
    assert.ok((await res.text()).includes("404: not found"));
  });

  test("SW1: RouterNotFound raised during the shell walk is a real 404 (nothing flushed yet)", async () => {
    const streaming = RouterServer.toStreamingWebHandler(def, { document, rpc });
    const res = await streaming(new Request("http://localhost/gone"));
    assert.equal(res.status, 404);
    assert.ok((await res.text()).includes("404: not found"));
  });

  test("SW1: RouterNotFound inside Boundary.suspend after flush keeps 200 and patches in the notFound page + noindex", async () => {
    const lateDef = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("late", {
          component: () =>
            h.div({}, [
              Boundary.suspend({ fallback: h.p({}, "loading late") }, [notFound("/late")]),
            ]),
        }),
      ]),
      { notFound: NotFound },
    );
    const streaming = RouterServer.toStreamingWebHandler(lateDef, { document, rpc });
    const res = await streaming(new Request("http://localhost/late"));
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes("loading late"));
    assert.ok(body.includes("404: not found"));
    assert.ok(body.includes("noindex"));
    assert.ok(body.includes("document.head.appendChild"));
    // SW8: the patch is the failure-replay variant, a sentinel script carrying the
    // encoded RouterNotFound, and the suspense markers retained by the swap.
    assert.ok(body.includes("data-weft-suspense-failure>"));
    assert.ok(body.includes('"_tag":"RouterNotFound"'));
    assert.ok(body.includes('"path":"/late"'));
    assert.ok(!body.includes("p.removeChild(s)"));
  });

  test("a non-RouterNotFound cause inside Boundary.suspend keeps the dom swallow default (no patch)", async () => {
    const failDef = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("broken", {
          component: () =>
            h.div({}, [
              Boundary.suspend({ fallback: h.p({}, "fallback stays") }, [
                Effect.fail(new Error("unrelated")),
              ]),
            ]),
        }),
      ]),
      { notFound: NotFound },
    );
    const streaming = RouterServer.toStreamingWebHandler(failDef, { document, rpc });
    const res = await streaming(new Request("http://localhost/broken"));
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes("fallback stays"));
    assert.ok(!body.includes("<template"));
  });

  test("SW2/SW3: the shell flushes before a pending boundary resolves; the stream ends after its patch", async () => {
    const gate = await Effect.runPromise(Deferred.make<void>());
    const slowDef = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("slow", {
          component: () =>
            h.div({}, [
              Boundary.suspend({ fallback: h.p({}, "shell-fallback") }, [
                Deferred.await(gate).pipe(Effect.as(h.p({}, "slow-content"))),
              ]),
            ]),
        }),
      ]),
      { notFound: NotFound },
    );
    const streaming = RouterServer.toStreamingWebHandler(slowDef, { document, rpc });
    const res = await streaming(new Request("http://localhost/slow"));
    // Status and shell are decided/flushed while the boundary is still pending.
    assert.equal(res.status, 200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    assert.ok(first.startsWith("<!DOCTYPE html>\n"));
    assert.ok(first.includes("shell-fallback"));
    assert.ok(!first.includes("slow-content"));

    await Effect.runPromise(Deferred.succeed(gate, void 0));
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value);
    }
    assert.ok(rest.includes("slow-content"));
  });

  test("SW5: consumer disconnect interrupts pending resolution fibers", async () => {
    const interrupted = await Effect.runPromise(Deferred.make<boolean>());
    const hangDef = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("hang", {
          component: () =>
            h.div({}, [
              Boundary.suspend({ fallback: h.p({}, "hanging") }, [
                Effect.never.pipe(Effect.onInterrupt(() => Deferred.succeed(interrupted, true))),
              ]),
            ]),
        }),
      ]),
      { notFound: NotFound },
    );
    const streaming = RouterServer.toStreamingWebHandler(hangDef, { document, rpc });
    const res = await streaming(new Request("http://localhost/hang"));
    const reader = res.body!.getReader();
    await reader.read(); // shell flushed
    await reader.cancel();
    assert.ok(await Effect.runPromise(Deferred.await(interrupted)));
  });

  test("SW6: Boundary.rpc blocks the shell: resolved inline, never patched (parity with the buffered handler)", async () => {
    const Echo = Rpc.make("Echo", { payload: Schema.Void, success: Schema.String });
    const EchoRpcs = RpcGroup.make(Echo);
    const EchoLive = EchoRpcs.toLayer({ Echo: () => Effect.succeed("stock-77") });
    const echoRpc = { group: EchoRpcs, handlers: EchoLive } as const;
    const fromValue =
      (f: (s: string) => Node<never, never>) => (resource: Boundary.Resource<string>) =>
        Effect.gen(function* () {
          const data = yield* resource.value.get;
          return yield* f(data);
        });
    const stockDef = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("stock", {
          component: () =>
            Boundary.rpc(
              Echo,
              () => undefined,
              fromValue((s) => h.div({}, s)),
            ),
        }),
      ]),
      { notFound: NotFound },
    );
    const streaming = RouterServer.toStreamingWebHandler(stockDef, { document, rpc: echoRpc });
    const res = await streaming(new Request("http://localhost/stock"));
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes("stock-77"));
    assert.ok(!body.includes("<template"));
    const buffered = await RouterServer.toWebHandler(stockDef, { document, rpc: echoRpc })(
      new Request("http://localhost/stock"),
    );
    assert.equal(body, await buffered.text());
  });

  test("SW7: /_eui/rpc delegation matches the buffered handler (and falls through to 404 without rpc)", async () => {
    const post = () => new Request("http://localhost/_eui/rpc", { method: "POST" });
    const streamingRes = await RouterServer.toStreamingWebHandler(def, { document, rpc })(post());
    const bufferedRes = await RouterServer.toWebHandler(def, { document, rpc })(post());
    assert.equal(streamingRes.status, bufferedRes.status);

    const defNoRpc = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("about", { component: About }),
      ]),
      { notFound: NotFound },
    );
    const noRpcRes = await RouterServer.toStreamingWebHandler(defNoRpc, { document })(post());
    assert.equal(noRpcRes.status, 404);
  });

  test("memoization: streaming and buffered handlers are cached separately per (def, document)", async () => {
    const a = RouterServer.toStreamingWebHandler(def, { document, rpc });
    const b = RouterServer.toStreamingWebHandler(def, { document, rpc });
    const buffered = RouterServer.toWebHandler(def, { document, rpc });
    assert.equal(a, b);
    assert.notEqual(a, buffered);
  });
});

// ── Render-time provide seam (ambient-context-propagation.specs.md, AC1) ───────

/** An app-wide service that must reach the shell, layouts, and route leaves. */
class Greeting extends Context.Service<Greeting, { readonly text: string }>()("test/Greeting") {}

/** A leaf that reads the app service: the core failing case from the spec. */
const GreetingLeaf = Component.gen(function* () {
  const g = yield* Greeting;
  return yield* h.h1({}, g.text);
});

/** A layout that reads the app service alongside the injected outlet. */
const GreetingLayout = Component.gen(function* () {
  const g = yield* Greeting;
  const outlet = yield* Router.Outlet;
  return yield* h.div({ class: "greet-shell", "data-greet": g.text }, [outlet]);
});

const ctxDef = Router.router(
  Router.layout({ component: GreetingLayout }, [Router.route("", { component: GreetingLeaf })]),
  { notFound: NotFound },
);

/** The document shell also reads the app service (via the same seam). */
const greetDocument = Component.gen(function* () {
  const g = yield* Greeting;
  const app = yield* Router.Outlet;
  return yield* h.html([h.head([h.title({}, g.text)]), h.body([h.div({ id: "root" }, [app])])]);
});

const GreetingLive = Layer.succeed(Greeting, { text: "hello-from-context" });

describe("RouterServer render-time context seam (AC1)", () => {
  test("AC1: a context-provided service is read by the leaf, layout, and document shell (render)", async () => {
    const { html, status } = await Effect.runPromise(
      RouterServer.render(ctxDef, { document: greetDocument, url: "/", context: GreetingLive }),
    );
    assert.equal(status, 200);
    assert.ok(html.includes("<title>hello-from-context</title>")); // shell
    assert.ok(html.includes('data-greet="hello-from-context"')); // layout
    assert.ok(html.includes("<h1>hello-from-context</h1>")); // leaf
  });

  test("AC1: the seam works through toWebHandler", async () => {
    const handler = RouterServer.toWebHandler(ctxDef, {
      document: greetDocument,
      context: GreetingLive,
    });
    const res = await handler(new Request("http://localhost/"));
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes("<h1>hello-from-context</h1>"));
  });

  test("AC1: the seam works through toStreamingWebHandler", async () => {
    const handler = RouterServer.toStreamingWebHandler(ctxDef, {
      document: greetDocument,
      context: GreetingLive,
    });
    const res = await handler(new Request("http://localhost/"));
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes("<h1>hello-from-context</h1>"));
  });
});
