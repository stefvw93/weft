import { AppRpcClientTag, type Node, Subscribable } from "@weftui/core";
import {
  renderToHydratableShell,
  renderToStringHydratable,
  SuspenseFailureHandlerTag,
  type SuspenseFailureHandler,
} from "@weftui/dom/server";
import { HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { type RpcGroup, RpcSerialization, RpcServer, RpcTest } from "effect/unstable/rpc";
import { Cause, Effect, Exit, Layer, Option, Schema, Scope, Stream } from "effect";
import type { RouterDef } from "../compile";
import { isRouterNotFound, RouterNotFound } from "../errors";
import type { RouteMatch } from "../matcher";
import { outletNode } from "../outlet";
import type { ComponentSlot } from "../route-tree";
import { type NavState, Router } from "../router-service";

/**
 * Server-side rendering for a {@link RouterDef}. Dispatch runs through the
 * authoritative `HttpApi` spine via `HttpApiBuilder`: platform owns request→leaf
 * matching and path/query decode, then each leaf handler builds a fixed-match
 * server `Router`, renders the universal outlet to hydratable HTML, and replies
 * `text/html`. Status comes from the platform pipeline: a no-match (platform's
 * `RouteNotFound`) and a page-raised `RouterNotFound` both render the configured
 * `notFound` page at HTTP 404, so there is no render-time status side-channel.
 */
export namespace RouterServer {
  /** Path the in-process rpc web handler claims; mirrors `RouterLive`'s client URL. */
  const RPC_PATH = "/_eui/rpc";

  /**
   * The app's `Boundary.rpc` data foundation: the merged `RpcGroup` contract plus
   * its server-only handler `Layer`. Wired explicitly (no co-located `load`, no
   * registry): `toWebHandler` serves it at `POST /_eui/rpc`, and an in-process
   * client over the same handlers resolves SSR boundaries in-process.
   */
  export interface RpcOptions {
    /** The app's merged `RpcGroup` (pure Schema contract; shared with the client). */
    // oxlint-disable-next-line typescript/no-explicit-any
    readonly group: RpcGroup.RpcGroup<any>;
    /** The server-only handler Layer (`group.toLayer(...)` ⊕ its dependencies). */
    // oxlint-disable-next-line typescript/no-explicit-any
    readonly handlers: Layer.Layer<any, never, never>;
  }

  /**
   * Shared server options. The document shell is a {@link ComponentSlot} that splices
   * the app via `yield* Router.Outlet` (the router provides it per request),
   * typically `<html><head>…</head><body><div id="root">{app}</div><script …></body></html>`.
   * The router provides both `Router.Outlet` (the app, per request) and `Router` (to read
   * params), so the document may use either. Mirrors the route/layout `component` slot,
   * so it accepts both a plain thunk and a `Component.make` / `Component.gen` component.
   * `<!DOCTYPE html>` is prepended at serialize time.
   *
   * `context` is the render-time provide seam (spec:
   * `ambient-context-propagation.specs.md`): an app-wide `Layer` provided to the
   * document shell **and** every route/layout leaf. It is required exactly when the
   * def carries residual app services ({@link AppServices}: its aggregate `R` minus
   * the `Router` / `Router.Outlet` / `AppRpcClientTag` the router already threads) and
   * disallowed otherwise, so a missing provide is a compile error and `rpc`-only /
   * no-service apps stay unchanged (surfaced via {@link ContextOption} at each entry).
   */
  export interface Options {
    /** The document shell slot; reads the app to splice via `yield* Router.Outlet`. */
    readonly document: ComponentSlot;
    /**
     * The app's `Boundary.rpc` foundation (contract + server handlers). Optional:
     * omit when the app has no `Boundary.rpc`. Then `POST /_eui/rpc` is not
     * served (it falls through to page dispatch) and a stray `Boundary.rpc`
     * fails with a descriptive error instead of rendering.
     */
    readonly rpc?: RpcOptions;
  }

  /**
   * The residual app services a caller must still provide through the {@link Options.context}
   * seam: a def's aggregate requirement `R` **minus** the services the router already
   * threads in per render: `Router` and `Router.Outlet` (provided by the outlet /
   * document plumbing) and `AppRpcClientTag` (provided from the `rpc` option). When this
   * resolves to `never` the app has no app-wide service to inject and `context` is disallowed.
   */
  export type AppServices<R> = Exclude<R, Router | Router.Outlet | AppRpcClientTag>;

  /** True only for the exact `any` type: a loosely-typed `RouterDef<any, any>`. */
  // oxlint-disable-next-line typescript/no-explicit-any
  type IsAny<T> = 0 extends 1 & T ? true : false;

  /**
   * Conditionally shapes the `context` field at each entry point: **required** (a
   * `Layer` supplying every residual {@link AppServices}) when the def has statically
   * known app-wide services, **absent** when it has none, and **optional** for a
   * loosely-typed `RouterDef<any, any>` (residual services can't be tracked, so the
   * seam is not forced). This makes a missing provide a compile error for a precisely
   * typed def (AC2) while keeping no-service / loosely-typed apps unchanged (AC3).
   */
  export type ContextOption<R> = [AppServices<R>] extends [never]
    ? { readonly context?: undefined }
    : IsAny<AppServices<R>> extends true
      ? // oxlint-disable-next-line typescript/no-explicit-any
        { readonly context?: Layer.Layer<any, never, never> }
      : { readonly context: Layer.Layer<AppServices<R>, never, never> };

  /** Internal options shape once the caller's `context` is erased to a loose `Layer`. */
  type RenderOptions = Options & {
    // oxlint-disable-next-line typescript/no-explicit-any
    readonly context?: Layer.Layer<any, never, never>;
  };

  /** The result of {@link render}. */
  export interface Rendered {
    readonly html: string;
    readonly status: number;
  }

  /** `text/html` response options at a given status. */
  function htmlResponse(html: string, status: number): HttpServerResponse.HttpServerResponse {
    return HttpServerResponse.text(`<!DOCTYPE html>\n${html}`, {
      status,
      contentType: "text/html; charset=utf-8",
    });
  }

  /** Builds the fixed per-request `Router` from an already-resolved match; `navigate` is a no-op on the server. */
  function serverRouter(matched: RouteMatch): Router["Service"] {
    // Server render is buffered, so navigation state is a client-only concern: a
    // constant `Idle` keeps the service shape sound on both sides (AC-N10).
    const idle: NavState = { _tag: "Idle" };
    return Router.of({
      currentMatch: Subscribable.make({
        get: Effect.succeed(matched),
        changes: Stream.make(matched),
      }),
      navigate: () => Effect.void,
      // The server is the origin; no derived client (network work is a client concern).
      httpApiClient: Option.none(),
      navigating: Subscribable.make({
        get: Effect.succeed(idle),
        changes: Stream.make(idle),
      }),
    });
  }

  /**
   * In-process {@link AppRpcClientTag} Layer over the app's handler Layer
   * ({@link RpcTest.makeClient}, flat, no protocol/serialization). SSR
   * `Boundary.rpc` resolution calls `call(tag, payload())` against this: the rpc
   * runs in-process, never over the network.
   *
   * The render path requires the tag unconditionally, so with no `rpc` configured
   * a stub is provided whose `call` fails descriptively. A `Boundary.rpc` in an
   * rpc-less app then surfaces the misconfiguration instead of dying opaquely.
   */
  function appRpcClientLayer(rpc: RpcOptions | undefined): Layer.Layer<AppRpcClientTag> {
    if (rpc === undefined) {
      return Layer.succeed(
        AppRpcClientTag,
        AppRpcClientTag.of({
          call: (tag) =>
            Effect.fail(
              new Error(
                `Boundary.rpc "${tag}" cannot resolve: no \`rpc\` option was passed to RouterServer`,
              ),
            ),
        }),
      );
    }
    return Layer.effect(
      AppRpcClientTag,
      Effect.map(
        // The group is `RpcGroup<any>` (runtime-assembled by the app); the flat
        // client is reached through the same loosening the seam documents.
        // oxlint-disable-next-line typescript/no-explicit-any
        RpcTest.makeClient(rpc.group, { flatten: true }) as Effect.Effect<any, never, any>,
        // oxlint-disable-next-line typescript/no-explicit-any
        (flat: any) => AppRpcClientTag.of({ call: (tag, payload) => flat(tag, payload) }),
      ),
    ).pipe(Layer.provide(rpc.handlers)) as Layer.Layer<AppRpcClientTag>;
  }

  /**
   * Renders the document shell (with `app` spliced via `Router.Outlet`) to a
   * hydratable HTML string. The whole tree (shell + every route/layout leaf) drains
   * in this one `renderToStringHydratable` context, so the app-wide `options.context`
   * Layer provided here reaches the leaves too (the render-time provide seam). No
   * context ⇒ `Layer.empty`, a no-op.
   */
  function renderDocument(
    options: RenderOptions,
    app: Node<never, never>,
    router: Router["Service"],
  ): Effect.Effect<string, Error> {
    const document = Effect.provideService(options.document({}), Router.Outlet, app);
    return renderToStringHydratable(document).pipe(
      Effect.provideService(Router, router),
      Effect.provide(appRpcClientLayer(options.rpc)),
      Effect.provide(options.context ?? Layer.empty),
    );
  }

  /**
   * Renders the configured `notFound` page **directly** in the shell (no nested
   * outlet, no reactive-region markers) at `status`. Mirrors the client's internal
   * not-found boundary fallback, which replaces the whole outlet subtree, so the
   * page-raised-404 HTML aligns for hydration.
   */
  function renderNotFoundDirect(
    def: RouterDef,
    options: RenderOptions,
    url: string,
    status: number,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, Error> {
    const router = serverRouter({ _tag: "NotFound", url });
    const app = def.compiled.notFound() as Node<never, never>;
    return renderDocument(options, app, router).pipe(
      Effect.map((html) => htmlResponse(html, status)),
    );
  }

  /**
   * Renders the no-match case: the bare {@link outletNode} with a `NotFound` match,
   * so the `notFound` page renders **inside** the level-0 reactive region (markers
   * present) at HTTP 404, matching what the client outlet produces for an
   * unmatched URL.
   */
  function renderNoMatch(
    def: RouterDef,
    options: RenderOptions,
    url: string,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, Error> {
    const router = serverRouter({ _tag: "NotFound", url });
    const app = outletNode(def) as Node<never, never>;
    return renderDocument(options, app, router).pipe(Effect.map((html) => htmlResponse(html, 404)));
  }

  /**
   * Renders one matched leaf: the bare {@link outletNode} with the platform-decoded
   * match, replying `text/html` at 200. A page that raises `RouterNotFound` is
   * caught here (the server omits `RouterApp`'s boundary so the failure surfaces)
   * and re-rendered as the not-found page at 404 via {@link renderNotFoundDirect}.
   */
  function renderLeaf(
    def: RouterDef,
    options: RenderOptions,
    matched: Extract<RouteMatch, { _tag: "Matched" }>,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, Error> {
    const router = serverRouter(matched);
    const app = outletNode(def) as Node<never, never>;
    return renderDocument(options, app, router).pipe(
      Effect.map((html) => htmlResponse(html, 200)),
      Effect.catchIf(isRouterNotFound, () => renderNotFoundDirect(def, options, matched.url, 404)),
    );
  }

  /**
   * The streaming pass's {@link SuspenseFailureHandlerTag} (SW1 late-404 row):
   * a `RouterNotFound` escaping `Boundary.suspend` children after the shell has
   * flushed is substituted with the router's `notFound` page plus a
   * client-injected `<meta name="robots" content="noindex">` (Next.js soft-404
   * parity). Any other cause keeps the dom swallow default (AC-ST8).
   *
   * The substitute also carries the `Schema`-encoded `RouterNotFound` as
   * `failureReplay` (SW8), so the patch is the failure-replay variant
   * (`streaming-shell.specs.md` AC-FH7) and a later `hydrate` replays the
   * failure into `RouterApp`'s boundary instead of mismatching.
   */
  function notFoundSuspenseHandler(def: RouterDef): SuspenseFailureHandler {
    return {
      handle: (cause) => {
        const failure = Cause.findErrorOption(cause);
        return Option.isSome(failure) && isRouterNotFound(failure.value)
          ? Option.some({
              content: def.compiled.notFound() as Node<never, never>,
              markNoindex: true,
              failureReplay: Schema.encodeSync(RouterNotFound)(failure.value),
            })
          : Option.none();
      },
    };
  }

  /**
   * Streaming counterpart of {@link renderLeaf} (SW1 … SW6): renders the
   * document via the dom shell-split API, decides the status off the buffered
   * shell, then streams `<!DOCTYPE html>\n` + shell as the first chunk and the
   * Suspense patches after it. A `RouterNotFound` raised during the shell walk
   * is caught (nothing flushed yet) and re-rendered buffered at 404.
   */
  function renderLeafStreaming(
    def: RouterDef,
    options: RenderOptions,
    matched: Extract<RouteMatch, { _tag: "Matched" }>,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, Error> {
    const router = serverRouter(matched);
    const app = outletNode(def) as Node<never, never>;
    return Effect.gen(function* () {
      // The scope spans the response: resolution fibers fork into it, and it
      // closes when the body stream ends or the consumer disconnects (SW5).
      const scope = yield* Scope.make();
      const documentNode = Effect.provideService(options.document({}), Router.Outlet, app);
      const { shell, patches } = yield* renderToHydratableShell(documentNode).pipe(
        Effect.provideService(Router, router),
        Effect.provideService(SuspenseFailureHandlerTag, notFoundSuspenseHandler(def)),
        Effect.provide(appRpcClientLayer(options.rpc)),
        // Same render-time provide seam as the buffered path (renderDocument): the
        // shell walk and every leaf drain in this context, so app-wide services reach them.
        Effect.provide(options.context ?? Layer.empty),
        Scope.provide(scope),
        Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause))),
      );
      const body = Stream.make(`<!DOCTYPE html>\n${shell}`).pipe(
        Stream.concat(patches),
        Stream.ensuring(Scope.close(scope, Exit.void)),
        Stream.encodeText,
      );
      return HttpServerResponse.stream(body, {
        status: 200,
        contentType: "text/html; charset=utf-8",
      });
    }).pipe(
      Effect.catchIf(isRouterNotFound, () => renderNotFoundDirect(def, options, matched.url, 404)),
    );
  }

  /** Memoized platform web handlers, keyed by `(def, document)`. */
  const handlerCache = new WeakMap<
    RouterDef,
    WeakMap<ComponentSlot, (request: Request) => Promise<Response>>
  >();

  /** Streaming handlers are memoized separately from the buffered ones. */
  const streamingHandlerCache = new WeakMap<
    RouterDef,
    WeakMap<ComponentSlot, (request: Request) => Promise<Response>>
  >();

  /**
   * Builds (and memoizes) the platform `(Request) => Promise<Response>` handler for
   * `def`. Dispatch runs through a **server-local** `HttpApi`: `def.httpApi`
   * (pristine: the client and the spec read it) extended with a second `"fallback"`
   * group holding one catch-all `"*"` endpoint. Platform owns matching: a request
   * routes to the specific leaf endpoint, or, when nothing matches, to the
   * catch-all, which renders the configured not-found page at 404. (Platform's own
   * unmatched path resolves a default empty 404 before any response hook can rewrite
   * it, so the catch-all is the route that keeps no-match rendering ours.)
   */
  function webHandlerWith(
    def: RouterDef,
    options: RenderOptions,
    cache: WeakMap<RouterDef, WeakMap<ComponentSlot, (request: Request) => Promise<Response>>>,
    leafRenderer: (
      def: RouterDef,
      options: RenderOptions,
      matched: Extract<RouteMatch, { _tag: "Matched" }>,
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse, Error>,
  ): (request: Request) => Promise<Response> {
    const perDef = cache.get(def) ?? new WeakMap();
    cache.set(def, perDef);
    const cached = perDef.get(options.document);
    if (cached !== undefined) return cached;

    const leaves = def.compiled.leaves;
    // `def.httpApi` is typed `HttpApi.Top`; the concrete group/endpoint shapes are
    // only known at runtime (assembled in a loop), so `group`/`api` are invoked
    // loosely: a precise static type across the runtime loop is not expressible.
    // oxlint-disable-next-line typescript/no-explicit-any
    const builder = HttpApiBuilder as any;
    // The catch-all matches any URL no specific leaf endpoint claims (platform
    // ranks static/param routes above the `"*"` wildcard).
    const fallbackGroup = HttpApiGroup.make("fallback").add(
      // `"*"` (platform's match-any path) is not a `/${string}` literal; the cast is
      // the same loosening `buildHttpApi` uses for concrete leaf patterns.
      HttpApiEndpoint.get("catchAll", "*" as `/${string}`, { success: Schema.String }),
    );
    // oxlint-disable-next-line typescript/no-explicit-any
    const api = (def.httpApi as any).add(fallbackGroup);

    const pagesLayer = builder.group(
      api,
      "pages",
      // oxlint-disable-next-line typescript/no-explicit-any
      (handlers: any) =>
        leaves.reduce(
          // oxlint-disable-next-line typescript/no-explicit-any
          (h: any, leaf) =>
            // oxlint-disable-next-line typescript/no-explicit-any
            h.handle(leaf.id, (request: any) =>
              leafRenderer(def, options, {
                _tag: "Matched",
                leaf,
                path: request.params as Record<string, unknown>,
                query: request.query as Record<string, unknown>,
                url: (request.request as HttpServerRequest.HttpServerRequest).url,
              }),
            ),
          handlers,
        ),
    );
    const fallbackLayer = builder.group(
      api,
      "fallback",
      // oxlint-disable-next-line typescript/no-explicit-any
      (handlers: any) =>
        // oxlint-disable-next-line typescript/no-explicit-any
        handlers.handle("catchAll", (request: any) =>
          renderNoMatch(def, options, (request.request as HttpServerRequest.HttpServerRequest).url),
        ),
    );
    // Register the HttpApi page routes into the ambient `HttpRouter`, provided
    // with the page + fallback group handlers.
    const apiRoutes = HttpApiBuilder.layer(api).pipe(
      Layer.provide(Layer.mergeAll(pagesLayer, fallbackLayer)),
    );

    // `Boundary.rpc` data is served in-band: the app's merged `RpcGroup` (+ JSON
    // serialization) registers an rpc route at `POST /_eui/rpc` on the same
    // `HttpRouter` as the page routes; the router dispatches by path, so the rpc
    // route wins over the catch-all page dispatch. With no `rpc` configured the
    // route is not registered and `/_eui/rpc` falls through to page dispatch (404).
    const rpc = options.rpc;
    const rpcRoutes =
      rpc !== undefined
        ? RpcServer.layerHttp({ group: rpc.group, path: RPC_PATH, protocol: "http" }).pipe(
            // oxlint-disable-next-line typescript/no-explicit-any
            Layer.provide(Layer.mergeAll(rpc.handlers, RpcSerialization.layerNdjson) as any),
          )
        : Layer.empty;

    // A single buffered web handler over the merged router (page + rpc routes)
    // plus the platform services those layers require.
    const { handler } = HttpRouter.toWebHandler(
      // oxlint-disable-next-line typescript/no-explicit-any
      Layer.mergeAll(apiRoutes, rpcRoutes, HttpServer.layerServices) as any,
    );

    perDef.set(options.document, handler);
    return handler;
  }

  /** The buffered platform web handler (S2a). */
  function webHandler(
    def: RouterDef,
    options: RenderOptions,
  ): (request: Request) => Promise<Response> {
    return webHandlerWith(def, options, handlerCache, renderLeaf);
  }

  /** Coerces a possibly-relative URL/path into an absolute URL for a synthetic `Request`. */
  function absoluteUrl(url: string): string {
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `http://localhost${url.startsWith("/") ? url : `/${url}`}`;
  }

  /**
   * Renders the route matched by `options.url` to a hydratable HTML document
   * (S1/S2) by driving the platform {@link webHandler}. Returns `{ html, status }`
   * with `<!DOCTYPE html>` prepended and the status sourced from the platform
   * pipeline (200, or 404 for a no-match / page-raised `RouterNotFound`).
   */
  export function render<R>(
    def: RouterDef<any, R>,
    options: Options & { readonly url: string } & ContextOption<R>,
  ): Effect.Effect<Rendered, Error> {
    // The public signature discharges the def's residual `R` via `ContextOption`; the
    // conditional shape is erased to the loose `RenderOptions` for the runtime plumbing.
    const opts = options as RenderOptions & { readonly url: string };
    return Effect.tryPromise({
      try: async () => {
        const response = await webHandler(def, opts)(new Request(absoluteUrl(opts.url)));
        return { html: await response.text(), status: response.status };
      },
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    });
  }

  /**
   * The platform web `fetch`-style handler `(Request) => Promise<Response>` that
   * dispatches through `HttpApiBuilder` and renders the matched route to
   * `text/html`. Suitable for bridging into a dev server (e.g. Vite) or any
   * Web-platform server.
   */
  export function toWebHandler<R>(
    def: RouterDef<any, R>,
    options: Options & ContextOption<R>,
  ): (request: Request) => Promise<Response> {
    return webHandler(def, options as RenderOptions);
  }

  /**
   * Streaming variant of {@link toWebHandler} (spec: "Streaming SSR" in
   * `router.specs.md`, SW1 … SW7). Same `Options`, memoized separately. Per
   * matched leaf the document renders via the dom shell-split API
   * (`renderToHydratableShell`): the buffered shell decides the HTTP status
   * before any bytes flush, then streams as the first chunk with the Suspense
   * patch chunks after it. A `RouterNotFound` escaping `Boundary.suspend`
   * children after the flush keeps 200 and patches in the `notFound` page plus
   * a noindex robots meta (soft-404). No-match and shell-raised
   * `RouterNotFound` stay real 404s; `POST /_eui/rpc` delegation is unchanged.
   * `render` and `toWebHandler` remain fully buffered.
   */
  export function toStreamingWebHandler<R>(
    def: RouterDef<any, R>,
    options: Options & ContextOption<R>,
  ): (request: Request) => Promise<Response> {
    return webHandlerWith(
      def,
      options as RenderOptions,
      streamingHandlerCache,
      renderLeafStreaming,
    );
  }
}
