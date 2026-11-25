import * as assert from "node:assert/strict";
import { Boundary, Component, h, Subscribable } from "@weftui/core";
import type { Node } from "@weftui/core";
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http";
import { Rpc, RpcClient, RpcGroup, RpcSerialization } from "effect/rpc";
import { Context, Deferred, Effect, Layer, Schema } from "effect";
import { describe, test } from "vite-plus/test";
import { Router, notFound } from "~/index";
import { RouterServer } from "~/server/router-server";

// Spec: `router-server-layer.specs.md`. L22 (existing entry points unchanged) is
// covered by `router-server.test.ts` passing unmodified; L23 is structural and
// checked at review. L2/L16/L17 typing lives in `__type-tests__/router-server-layer.tst.ts`.

const Home = () => h.h1({}, "Home page");
const About = () => h.h1({}, "About page");
const Gone = () => notFound("/gone");
const NotFound = () => h.h1({}, "404: not found");

/** A passthrough layout `component`: renders the injected outlet directly. */
const passthroughLayout = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* outlet;
});

const User = Component.gen(function* () {
  const { id } = yield* Router.params({ id: Schema.String });
  return yield* h.h1({}, `User ${id}`);
});

/** A page whose content sits behind a `Boundary.suspend` gated on `gate`. */
const slowPage = (gate: Deferred.Deferred<void>) => () =>
  h.div({}, [
    Boundary.suspend({ fallback: h.p({}, "shell-fallback") }, [
      Deferred.await(gate).pipe(Effect.as(h.p({}, "slow-content"))),
    ]),
  ]);

const def = Router.router(
  Router.layout({ component: passthroughLayout }, [
    Router.route("", { component: Home }),
    Router.route("about", { component: About }),
    Router.route("gone", { component: Gone }),
    Router.route("users/:id", { component: User, path: { id: Schema.String } }),
    Router.route("orders/:oid", {
      path: { oid: Schema.NumberFromString },
      query: { page: Schema.optional(Schema.NumberFromString) },
      component: ({ path, query }) => h.h1({}, `Order ${path.oid} page ${query.page ?? 0}`),
    }),
  ]),
  { notFound: NotFound },
);

/** The document shell `component`: splices the app via the injected `Router.Outlet`. */
const document = Component.gen(function* () {
  const app = yield* Router.Outlet;
  return yield* h.html([h.head([h.title({}, "Test")]), h.body([h.div({ id: "root" }, [app])])]);
});

/** Serves a fully provided route Layer as a web handler (Effect's own adapter). */
const serve = (routes: Layer.Layer<never, never, HttpRouter.HttpRouter>) =>
  HttpRouter.toWebHandler(routes, { disableLogger: true });

const get = (path: string) => new Request(`http://localhost${path}`);

/** Drains a response body into its chunks, decoded as text. */
const readChunks = async (res: Response): Promise<readonly string[]> => {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(decoder.decode(value));
  }
};

describe("RouterServer.layer: shape and page dispatch", () => {
  test("L1: the Layer registers routes into the ambient HttpRouter and serves via HttpRouter.toWebHandler", async () => {
    const { handler, dispose } = serve(RouterServer.layer(def, { document }));
    const res = await handler(get("/"));
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes("Home page"));
    await dispose();
  });

  test("L3: a matched route replies text/html at 200 with the doctype and platform-decoded path params", async () => {
    const { handler } = serve(RouterServer.layer(def, { document }));
    const res = await handler(get("/users/42"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    const body = await res.text();
    assert.ok(body.startsWith("<!DOCTYPE html>\n"));
    assert.ok(body.includes("User 42"));
  });

  test("L3: query params are decoded by the platform", async () => {
    const { handler } = serve(RouterServer.layer(def, { document }));
    const res = await handler(get("/orders/7?page=2"));
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes("Order 7 page 2"));
  });

  test("L4: an unclaimed GET replies the notFound page at 404, inside the outlet region", async () => {
    const { handler } = serve(RouterServer.layer(def, { document }));
    const res = await handler(get("/missing"));
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.ok(body.includes("404: not found"));
    // Same document as the existing handler: not-found rendered inside the level-0 region.
    const existing = await RouterServer.toWebHandler(def, { document })(get("/missing"));
    assert.equal(body, await existing.text());
  });

  test("L5: a page raising RouterNotFound during the shell walk replies the notFound page at 404, direct in the shell", async () => {
    const { handler } = serve(RouterServer.layer(def, { document }));
    const res = await handler(get("/gone"));
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.ok(body.includes("404: not found"));
    const existing = await RouterServer.toWebHandler(def, { document })(get("/gone"));
    assert.equal(body, await existing.text());
  });
});

describe("RouterServer.layer: render mode", () => {
  test("L6 (SW2/SW3): streaming is the default: the shell flushes before a pending boundary resolves", async () => {
    const gate = await Effect.runPromise(Deferred.make<void>());
    const slowDef = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("slow", { component: slowPage(gate) }),
      ]),
      { notFound: NotFound },
    );
    const { handler } = serve(RouterServer.layer(slowDef, { document }));
    const res = await handler(get("/slow"));
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

  test("L6: `streaming: true` behaves the same as the default", async () => {
    const gate = await Effect.runPromise(Deferred.make<void>());
    const slowDef = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("slow", { component: slowPage(gate) }),
      ]),
      { notFound: NotFound },
    );
    const { handler } = serve(RouterServer.layer(slowDef, { document, streaming: true }));
    const res = await handler(get("/slow"));
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.ok(first.includes("shell-fallback"));
    assert.ok(!first.includes("slow-content"));
    await Effect.runPromise(Deferred.succeed(gate, void 0));
    await reader.cancel();
  });

  test("L6 (SW1/SW8): RouterNotFound inside Boundary.suspend after flush keeps 200 and patches in the notFound page", async () => {
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
    const { handler } = serve(RouterServer.layer(lateDef, { document }));
    const res = await handler(get("/late"));
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes("loading late"));
    assert.ok(body.includes("404: not found"));
    assert.ok(body.includes("noindex"));
    // SW8: the failure-replay sentinel carries the encoded RouterNotFound.
    assert.ok(body.includes("data-weft-suspense-failure>"));
    assert.ok(body.includes('"_tag":"RouterNotFound"'));
  });

  test("L6 (SW5): consumer disconnect interrupts pending resolution fibers", async () => {
    const interrupted = await Effect.runPromise(Deferred.make<boolean>());
    const started = await Effect.runPromise(Deferred.make<boolean>());
    const hangDef = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("hang", {
          component: () =>
            h.div({}, [
              Boundary.suspend({ fallback: h.p({}, "hanging") }, [
                Deferred.succeed(started, true).pipe(
                  Effect.andThen(Effect.never),
                  Effect.onInterrupt(() => Deferred.succeed(interrupted, true)),
                ),
              ]),
            ]),
        }),
      ]),
      { notFound: NotFound },
    );
    const { handler } = serve(RouterServer.layer(hangDef, { document }));
    const res = await handler(get("/hang"));
    const reader = res.body!.getReader();
    await reader.read();
    await Effect.runPromise(Deferred.await(started));
    await reader.cancel();
    assert.equal(await Effect.runPromise(Deferred.await(interrupted)), true);
  });

  test("L7: `streaming: false` buffers the whole body, byte-identical to toWebHandler", async () => {
    const gate = await Effect.runPromise(Deferred.make<void>());
    await Effect.runPromise(Deferred.succeed(gate, void 0));
    const slowDef = Router.router(
      Router.layout({ component: passthroughLayout }, [
        Router.route("slow", { component: slowPage(gate) }),
      ]),
      { notFound: NotFound },
    );
    const { handler } = serve(RouterServer.layer(slowDef, { document, streaming: false }));
    const res = await handler(get("/slow"));
    assert.equal(res.status, 200);
    const chunks = await readChunks(res);
    const body = chunks.join("");
    assert.ok(body.includes("slow-content"));
    const existing = await RouterServer.toWebHandler(slowDef, { document })(get("/slow"));
    assert.equal(body, await existing.text());
  });

  test("L8 (SW4): a page with no Boundary.suspend produces the same body in both modes", async () => {
    const streaming = serve(RouterServer.layer(def, { document }));
    const buffered = serve(RouterServer.layer(def, { document, streaming: false }));
    const streamed = await readChunks(await streaming.handler(get("/about")));
    assert.equal(streamed.length, 1);
    assert.equal(streamed.join(""), await (await buffered.handler(get("/about"))).text());
  });
});

describe("RouterServer.layer: composition with user routes", () => {
  const UserRoutes = Layer.mergeAll(
    HttpRouter.add("GET", "/health", HttpServerResponse.text("ok")),
    HttpRouter.add("GET", "/api/*", HttpServerResponse.text("api-miss", { status: 404 })),
    HttpRouter.add("POST", "/api/items", HttpServerResponse.text("created", { status: 201 })),
  );
  const app = () => serve(Layer.mergeAll(RouterServer.layer(def, { document }), UserRoutes));

  test("L9: a merged user route responds on its own path and pages keep responding", async () => {
    const { handler } = app();
    const created = await handler(new Request("http://localhost/api/items", { method: "POST" }));
    assert.equal(created.status, 201);
    assert.equal(await created.text(), "created");
    const page = await handler(get("/about"));
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes("About page"));
  });

  test("L10: a user GET route on a path no page claims wins over the not-found fallback", async () => {
    const { handler } = app();
    const res = await handler(get("/health"));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
  });

  test("L11: a user prefix catch-all outranks the page fallback", async () => {
    const { handler } = app();
    const res = await handler(get("/api/missing"));
    assert.equal(res.status, 404);
    assert.equal(await res.text(), "api-miss");
  });

  test("L12: the page fallback claims only GET; an unmatched non-GET gets the platform 404", async () => {
    const { handler } = serve(RouterServer.layer(def, { document }));
    const res = await handler(new Request("http://localhost/missing", { method: "POST" }));
    assert.equal(res.status, 404);
    assert.ok(!(await res.text()).includes("404: not found"));
  });
});

// ── Services through the requirements channel ─────────────────────────────────

class Greeting extends Context.Service<Greeting, { readonly text: string }>()("test/Greeting") {}

const greetDef = Router.router(
  Router.layout(
    {
      component: Component.gen(function* () {
        const outlet = yield* Router.Outlet;
        const { text } = yield* Greeting;
        return yield* h.div({ class: "layout" }, [h.span({}, `layout:${text}`), outlet]);
      }),
    },
    [
      Router.route("greet", {
        component: Component.gen(function* () {
          const { text } = yield* Greeting;
          return yield* h.h1({}, `leaf:${text}`);
        }),
      }),
    ],
  ),
  { notFound: NotFound },
);

const greetDocument = Component.gen(function* () {
  const app = yield* Router.Outlet;
  const { text } = yield* Greeting;
  return yield* h.html([h.head([h.title({}, `shell:${text}`)]), h.body([app])]);
});

describe("RouterServer.layer: services through the requirements channel", () => {
  test("L13: a provided app service reaches the document shell, layouts, and leaves", async () => {
    const GreetingLive = Layer.succeed(Greeting, { text: "hello" });
    const { handler } = serve(
      RouterServer.layer(greetDef, { document: greetDocument }).pipe(Layer.provide(GreetingLive)),
    );
    const res = await handler(get("/greet"));
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes("shell:hello"));
    assert.ok(body.includes("layout:hello"));
    assert.ok(body.includes("leaf:hello"));
  });

  test("L14: a provided service Layer is built once per server, not per request", async () => {
    let built = 0;
    const GreetingCounted = Layer.effect(
      Greeting,
      Effect.sync(() => {
        built += 1;
        return { text: "counted" };
      }),
    );
    const { handler } = serve(
      RouterServer.layer(greetDef, { document: greetDocument }).pipe(
        Layer.provide(GreetingCounted),
      ),
    );
    for (const _ of [1, 2, 3]) {
      const res = await handler(get("/greet"));
      assert.ok((await res.text()).includes("leaf:counted"));
    }
    assert.equal(built, 1);
  });

  test("L15: closing the server scope releases the provided services once", async () => {
    let released = 0;
    const GreetingScoped = Layer.effect(
      Greeting,
      Effect.acquireRelease(Effect.succeed({ text: "scoped" }), () =>
        Effect.sync(() => {
          released += 1;
        }),
      ),
    );
    const { handler, dispose } = serve(
      RouterServer.layer(greetDef, { document: greetDocument }).pipe(Layer.provide(GreetingScoped)),
    );
    await (await handler(get("/greet"))).text();
    await (await handler(get("/greet"))).text();
    assert.equal(released, 0);
    await dispose();
    assert.equal(released, 1);
  });
});

// ── Rpc ───────────────────────────────────────────────────────────────────────

const Echo = Rpc.make("Echo", { payload: Schema.Void, success: Schema.String });
const EchoRpcs = RpcGroup.make(Echo);

const fromValue = (f: (s: string) => Node<never, never>) => (resource: Boundary.Resource<string>) =>
  Effect.gen(function* () {
    const data = yield* Subscribable.get(resource.value);
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

/** Calls `Echo` over the real network protocol, routed into `handler` instead of the network. */
const callEchoOverHttp = (
  handler: (request: Request) => Promise<Response>,
  onRequest: (request: Request) => void = () => {},
): Promise<string> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(EchoRpcs);
        return yield* client.Echo();
      }),
    ).pipe(
      Effect.provide(
        RpcClient.layerProtocolHttp({ url: "http://localhost/_eui/rpc" }).pipe(
          Layer.provide(Layer.mergeAll(FetchHttpClient.layer, RpcSerialization.layerNdjson)),
        ),
      ),
      // `Fetch` is a reference read when a request runs, so it is provided to the
      // whole program, not merged beside the client Layer.
      Effect.provideService(FetchHttpClient.Fetch, ((
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const request = new Request(input, { ...init, duplex: "half" } as RequestInit);
        onRequest(request.clone());
        return handler(request);
      }) as typeof globalThis.fetch),
    ),
  );

describe("RouterServer.layer: rpc", () => {
  const EchoLive = EchoRpcs.toLayer({ Echo: () => Effect.succeed("stock-77") });

  test("L17: providing the handler Layer satisfies the rpc requirements", async () => {
    const { handler } = serve(
      RouterServer.layer(stockDef, { document, rpc: EchoRpcs }).pipe(Layer.provide(EchoLive)),
    );
    const res = await handler(get("/stock"));
    assert.equal(res.status, 200);
  });

  test("L18: POST /_eui/rpc is served on the same router, with toWebHandler's wire format", async () => {
    const { handler } = serve(
      RouterServer.layer(stockDef, { document, rpc: EchoRpcs }).pipe(Layer.provide(EchoLive)),
    );
    let wire: Request | undefined;
    const result = await callEchoOverHttp(handler, (request) => {
      wire = request;
    });
    assert.equal(result, "stock-77");

    // Replay the exact client bytes against both handlers: identical responses.
    assert.ok(wire !== undefined);
    // Effect's http protocol client appends a trailing slash to the endpoint.
    assert.equal(new URL(wire.url).pathname.replace(/\/$/, ""), "/_eui/rpc");
    const payload = await wire.text();
    const replay = () =>
      new Request(wire!.url, { method: "POST", headers: wire!.headers, body: payload });
    const fromLayer = await handler(replay());
    const existing = await RouterServer.toWebHandler(stockDef, {
      document,
      rpc: { group: EchoRpcs, handlers: EchoLive },
    })(replay());
    assert.equal(fromLayer.status, existing.status);
    assert.equal(fromLayer.headers.get("content-type"), existing.headers.get("content-type"));
    assert.equal(await fromLayer.text(), await existing.text());
  });

  test("L19: an SSR Boundary.rpc resolves in-process (no network) and serializes its payload", async () => {
    const { handler } = serve(
      RouterServer.layer(stockDef, { document, rpc: EchoRpcs }).pipe(Layer.provide(EchoLive)),
    );
    const realFetch = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = (() => {
      fetched += 1;
      return Promise.reject(new Error("network must not be used during SSR"));
    }) as typeof globalThis.fetch;
    try {
      const res = await handler(get("/stock"));
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes("<div>stock-77</div>"));
      assert.ok(body.includes('<script type="application/json"'));
      assert.equal(fetched, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("L19 (SW6): Boundary.rpc blocks the shell and is never patched", async () => {
    const { handler } = serve(
      RouterServer.layer(stockDef, { document, rpc: EchoRpcs }).pipe(Layer.provide(EchoLive)),
    );
    const chunks = await readChunks(await handler(get("/stock")));
    assert.equal(chunks.length, 1);
    assert.ok(!chunks.join("").includes("<template"));
  });

  test("L20: the handler Layer is built once, shared by SSR and POST /_eui/rpc", async () => {
    let built = 0;
    const EchoCounted = EchoRpcs.toLayer(
      Effect.sync(() => {
        built += 1;
        return { Echo: () => Effect.succeed("stock-shared") };
      }),
    );
    const { handler } = serve(
      RouterServer.layer(stockDef, { document, rpc: EchoRpcs }).pipe(Layer.provide(EchoCounted)),
    );
    assert.ok((await (await handler(get("/stock"))).text()).includes("stock-shared"));
    assert.ok((await (await handler(get("/stock"))).text()).includes("stock-shared"));
    assert.equal(await callEchoOverHttp(handler), "stock-shared");
    assert.equal(built, 1);
  });

  test("L21: without `rpc`, POST /_eui/rpc is not served", async () => {
    const { handler } = serve(RouterServer.layer(def, { document }));
    const res = await handler(new Request("http://localhost/_eui/rpc", { method: "POST" }));
    assert.equal(res.status, 404);
  });

  test("L21: without `rpc`, a stray Boundary.rpc fails as a server error, never a silent render", async () => {
    const { handler } = serve(RouterServer.layer(stockDef, { document }));
    const res = await handler(get("/stock"));
    assert.equal(res.status, 500);
    assert.ok(!(await res.text()).includes("stock-77"));
  });
});
