import { AppRpcClientTag, Subscribable } from "@weftui/core";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import type { RpcGroup } from "effect/unstable/rpc";
import type { Renderable } from "@weftui/core";
import {
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import type { RouterDef } from "../compile";
import { match, type RouteMatch } from "../matcher";
import { preRunLeaf, setResolvedCommit } from "../resolved-commit";
import { getPreload } from "../route-tree";
import {
  type NavigateOptions,
  type NavState,
  Router,
  type RouterHttpApiClient,
} from "../router-service";
import { installLinkInterceptor } from "./link";

/** Path the client rpc protocol posts to; mirrors `RouterServer`'s server route. */
const RPC_PATH = "/_eui/rpc";

/**
 * The residual app services a caller must still provide through the {@link RouterLiveOptions.context}
 * seam: a def's aggregate `R` minus the services `RouterLive` already threads
 * (`Router`, `Router.Outlet`, `AppRpcClientTag`). The client mirror of
 * `RouterServer.AppServices`; resolves to `never` for an app with no app-wide service.
 */
export type AppServices<R> = Exclude<R, Router | Router.Outlet | AppRpcClientTag>;

/** True only for the exact `any` type (a loosely-typed `RouterDef<any, any>`). */
// oxlint-disable-next-line typescript/no-explicit-any
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Conditionally shapes the `context` field: **required** when the def has statically
 * known residual {@link AppServices}, **absent** when it has none, and **optional**
 * for a loosely-typed `RouterDef<any, any>`. Client parity with the server seam (AC4)
 * is thus a compile-time guarantee, and no-service / loosely-typed apps stay unchanged (AC3).
 */
export type ContextOption<R> = [AppServices<R>] extends [never]
  ? { readonly context?: undefined }
  : IsAny<AppServices<R>> extends true
    ? // oxlint-disable-next-line typescript/no-explicit-any
      { readonly context?: Layer.Layer<any, never, never> }
    : { readonly context: Layer.Layer<AppServices<R>, never, never> };

/** Options for {@link RouterLive}. */
export interface RouterLiveOptions {
  /**
   * Base URL for the derived `HttpApiClient` (route prefetch) and the rpc client's
   * `POST /_eui/rpc` endpoint. Defaults to the document's same origin
   * (`window.location.origin`).
   */
  readonly baseUrl?: string | URL;
  /**
   * The app's `Boundary.rpc` foundation: the merged `RpcGroup` contract (shared
   * with the server handler Layer). Backs the {@link AppRpcClientTag} seam so a
   * hydrated boundary refetch (and a client-first SPA mount) resolve over the
   * network rpc client. Optional: omit when the app has no `Boundary.rpc`. Then
   * no network rpc client is built and a stray `Boundary.rpc` fails with a
   * descriptive error.
   */
  readonly rpc?: {
    /** The app's merged `RpcGroup` (pure Schema contract). */
    // oxlint-disable-next-line typescript/no-explicit-any
    readonly group: RpcGroup.RpcGroup<any>;
  };
}

/** Reads the current location as a normalized `path + search` string. */
function locationUrl(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** Normalizes a navigation target (absolute or relative) to `path + search`. */
function normalizeTo(to: string): string {
  const url = new URL(to, window.location.href);
  return `${url.pathname}${url.search}`;
}

/**
 * The client `Router` layer, backed by the History API. Seeds a
 * `SubscriptionRef` from `window.location`, listens for `popstate`, and exposes
 * `currentMatch` as the ref mapped through the shared matcher. `navigate` pushes
 * History state and updates the ref. Also installs the same-origin link click
 * interceptor for the layer's lifetime.
 *
 * It additionally derives a real {@link RouterHttpApiClient} from `def.httpApi`
 * (over `FetchHttpClient`, `baseUrl` default same-origin) and exposes it on the
 * `Router` service for network work. SPA URL→leaf resolution stays local via the
 * shared {@link match}er: both sides read the one `def.httpApi` definition.
 *
 * Alongside `Router` it provides the core {@link AppRpcClientTag} seam: a
 * **network** flat rpc client (`RpcClient.make` over `layerProtocolHttp` →
 * `POST /_eui/rpc`), so `@weftui/dom` can resolve a `Boundary.rpc` (hydrated
 * refetch and client-first mount) without depending on this package or
 * `effect/unstable/rpc`.
 */
export function RouterLive<R>(
  def: RouterDef<any, R>,
  options: RouterLiveOptions & ContextOption<R> = {} as RouterLiveOptions & ContextOption<R>,
): Layer.Layer<Router | AppRpcClientTag | AppServices<R>> {
  const core: Layer.Layer<Router | AppRpcClientTag> = Layer.effectContext(
    Effect.gen(function* () {
      const urlRef = yield* SubscriptionRef.make(locationUrl());
      // Reactive navigation state (`pending-navigation.specs.md`): `Navigating{to}`
      // while a deferred-commit navigation resolves its lazy chunk(s), else `Idle`.
      const navRef = yield* SubscriptionRef.make<NavState>({ _tag: "Idle" });
      const services = yield* Effect.context<never>();

      // The authoritative HttpApi is typed `HttpApi.Top` (runtime-assembled), so
      // `make` over it yields an opaque client and an unbounded requirement that
      // `FetchHttpClient.layer` discharges; the effect is asserted back to the
      // opaque `RouterHttpApiClient` with no residual context.
      const makeClient = HttpApiClient.make(
        // oxlint-disable-next-line typescript/no-explicit-any
        def.httpApi as any,
        { baseUrl: options.baseUrl ?? window.location.origin },
      ).pipe(
        Effect.provide(FetchHttpClient.layer),
      ) as unknown as Effect.Effect<RouterHttpApiClient>;
      const httpApiClient = yield* makeClient;

      // A monotonic token; only the newest navigation may commit or reset
      // `navigating` (latest-wins across in-flight lazy preloads, AC-N7, and
      // leaf pre-runs, `resolve-before-commit.specs.md` AC-R6).
      let latest = 0;

      // The in-flight leaf pre-run fiber, interrupted by a superseding
      // navigation (AC-R6), and the committed pre-run's scope, retained until a
      // later navigation replaces the leaf emission (AC-R12).
      let inflightPreRun: Fiber.Fiber<Exit.Exit<Renderable, unknown>> | undefined;
      let committedScope: Scope.Closeable | undefined;

      // Forward reference to the service instance built below: the pre-run needs
      // it for the staged view and the resolved-commit stash. `commitTo` only
      // runs after the layer is built, when the instance exists.
      let router!: Router["Service"];

      // The `Router.lazy` preloads for a matched branch (leaf component + each
      // layout in its chain); empty for an eager branch or a no-match, which take
      // the synchronous fast path.
      const collectPreloads = (m: RouteMatch): ReadonlyArray<() => Promise<unknown>> =>
        m._tag !== "Matched"
          ? []
          : [m.leaf.component, ...m.leaf.layoutChain.map((l) => l.component)]
              .map(getPreload)
              .filter((p): p is () => Promise<unknown> => p !== undefined);

      // The path portion (before `?`) of a canonical url: the granularity at which
      // scroll is reset (`scroll-reset.specs.md`): a query-only change keeps the path.
      const pathOf = (url: string): string => {
        const qIndex = url.indexOf("?");
        return qIndex === -1 ? url : url.slice(0, qIndex);
      };

      const commitUrl = (normalized: string, replace: boolean): Effect.Effect<void> =>
        Effect.sync(() => {
          // `replaceState` swaps the current entry (no new history step); `pushState`
          // adds one. Neither fires `popstate`, so the url ref is set explicitly to
          // drive the reactive re-render.
          if (replace) {
            window.history.replaceState(null, "", normalized);
          } else {
            window.history.pushState(null, "", normalized);
          }
        });

      // Deferred-commit navigation core (`pending-navigation.specs.md` +
      // `resolve-before-commit.specs.md`): resolve the matched branch's lazy
      // chunk(s) **and** the target leaf's component effect before committing the
      // url + match, so the previous outlet stays mounted during both the chunk
      // and the data fetch, and the swap is a single tick (the outlet consumes
      // the stashed, already-resolved node synchronously). `pushUrl`
      // distinguishes an app navigation (History push/replace) from a popstate
      // resync (browser already moved the url, so set the ref only).
      const commitTo = (
        normalized: string,
        pushUrl: boolean,
        replace: boolean,
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const target = match(def, normalized);
          const token = ++latest;
          // Whether this navigation flipped `navigating` (reset on commit only then).
          let emitted = false;

          // A superseding navigation interrupts the in-flight pre-run (AC-R6);
          // the superseded navigation's join observes the interruption and bails.
          const stale = inflightPreRun;
          inflightPreRun = undefined;
          if (stale !== undefined) {
            yield* Fiber.interrupt(stale);
          }

          // Stage 1: lazy chunk(s) (AC-N1). Keeps the old outlet mounted while
          // the chunk(s) resolve; also populates the lazy slot's `resolved` memo
          // so the leaf pre-run below enters the synchronous slot path.
          const preloads = collectPreloads(target);
          if (preloads.length > 0) {
            emitted = true;
            yield* SubscriptionRef.set(navRef, { _tag: "Navigating", to: normalized });
            yield* Effect.promise(() => Promise.all(preloads.map((p) => p()))).pipe(
              // A rejected chunk load is a defect (AC-E1); reset `navigating` (if
              // this is still the latest nav) before the defect propagates, so no
              // stuck pending state remains (AC-N9).
              Effect.onError(() =>
                token === latest ? SubscriptionRef.set(navRef, { _tag: "Idle" }) : Effect.void,
              ),
            );
            // Superseded → do not commit or reset; the newer nav owns both. The
            // fetch still populated the shared per-slot memo (AC-N7).
            if (token !== latest) return;
          }

          // Stage 2: the leaf pre-run (AC-R1). Run the target leaf's component
          // effect to completion pre-commit and stash its Exit for the outlet.
          let exit: Exit.Exit<Renderable, unknown> | undefined;
          if (target._tag === "Matched") {
            const scope = yield* Scope.make();
            const fiber = yield* Effect.forkChild(
              Effect.provideService(preRunLeaf(router, target), Scope.Scope, scope),
            );
            inflightPreRun = fiber;
            // Flip `navigating` only if the pre-run actually suspends: this fiber
            // is forked *after* the pre-run fiber, so a synchronous body has
            // already completed when the poll runs and no emission happens (AC-R3).
            if (!emitted) {
              yield* Effect.forkChild(
                Effect.gen(function* () {
                  const done = fiber.pollUnsafe();
                  if (done === undefined && token === latest) {
                    emitted = true;
                    yield* SubscriptionRef.set(navRef, { _tag: "Navigating", to: normalized });
                  }
                }),
              );
            }
            const joined = yield* Effect.exit(Fiber.join(fiber));
            if (inflightPreRun === fiber) inflightPreRun = undefined;
            if (token !== latest || Exit.isFailure(joined)) {
              // Superseded (the join surfaced the interruption): the newer nav
              // owns the url, the stash, and `navigating` (AC-R6).
              yield* Scope.close(scope, Exit.void);
              return;
            }
            exit = joined.value;
            // Retain the committed pre-run's scope; close the one it replaces (AC-R12).
            const previous = committedScope;
            committedScope = scope;
            if (previous !== undefined) {
              yield* Scope.close(previous, Exit.void);
            }
          }

          // Commit (AC-R2): stash the pre-run outcome under the exact committed
          // url, move the url + ref together, and settle `navigating`.
          if (exit !== undefined) {
            setResolvedCommit(router, { url: normalized, exit });
          }
          // Capture the outgoing url before it moves: the previous committed path
          // decides whether scroll resets below (`urlRef` only changes here).
          const previousUrl = yield* SubscriptionRef.get(urlRef);
          if (pushUrl) yield* commitUrl(normalized, replace);
          yield* SubscriptionRef.set(urlRef, normalized);
          // Scroll reset (`scroll-reset.specs.md`): a path-changing app navigation
          // returns to the top of the page, mirroring a full document load. Excludes
          // popstate (`pushUrl === false`, left to the browser's native
          // scrollRestoration) and query-only changes (same path: `setQuery` /
          // `patchQuery`), which preserve scroll. `scrollTo(0, 0)` is height-
          // independent, so it is safe before the outlet's reactive DOM swap paints.
          if (pushUrl && pathOf(previousUrl) !== pathOf(normalized)) {
            yield* Effect.sync(() => window.scrollTo(0, 0));
          }
          if (emitted) yield* SubscriptionRef.set(navRef, { _tag: "Idle" });
        });

      const navigate = (to: string, options?: NavigateOptions): Effect.Effect<void> =>
        commitTo(normalizeTo(to), true, options?.replace === true);

      // popstate (back/forward): the browser already moved the url, so only resync
      // the ref. But resolve the target branch's lazy chunk(s) first so back-nav is
      // also blank-free (AC-N8).
      const onPopState = (): void => {
        Effect.runForkWith(services)(commitTo(locationUrl(), false, false));
      };
      yield* Effect.acquireRelease(
        Effect.sync(() => window.addEventListener("popstate", onPopState)),
        () => Effect.sync(() => window.removeEventListener("popstate", onPopState)),
      );

      yield* installLinkInterceptor(def, navigate);

      const currentMatch = Subscribable.make({
        get: Effect.map(SubscriptionRef.get(urlRef), (url): RouteMatch => match(def, url)),
        changes: Stream.map(SubscriptionRef.changes(urlRef), (url): RouteMatch => match(def, url)),
      });

      // The {@link AppRpcClientTag} seam: a **network** flat rpc client over the
      // app's merged `RpcGroup`, posting to `<origin>/_eui/rpc`. `@weftui/dom`
      // reads this tag to resolve a `Boundary.rpc` (hydrated refetch and
      // client-first mount) without importing this package or `effect/unstable/rpc`.
      // With no `rpc` configured the seam is a stub whose `call` fails
      // descriptively, so a stray `Boundary.rpc` surfaces the misconfiguration.
      const rpc = options.rpc;
      let appRpcClient: AppRpcClientTag["Service"];
      if (rpc === undefined) {
        appRpcClient = AppRpcClientTag.of({
          call: (tag) =>
            Effect.fail(
              new Error(
                `Boundary.rpc "${tag}" cannot resolve: no \`rpc\` option was passed to RouterLive`,
              ),
            ),
        });
      } else {
        // `effect/unstable/rpc` (and its `msgpackr` serialization dependency) is loaded
        // lazily so it stays out of the base client bundle: an app with no
        // `Boundary.rpc` never passes `rpc`, so this branch, and the async
        // chunk it pulls, never runs. Only rpc-enabled apps pay the cost.
        const { RpcClient, RpcSerialization } = yield* Effect.promise(
          () => import("effect/unstable/rpc"),
        );
        const baseUrl = String(options.baseUrl ?? window.location.origin).replace(/\/$/, "");
        const flatClient = yield* RpcClient.make(rpc.group, { flatten: true }).pipe(
          Effect.provide(
            RpcClient.layerProtocolHttp({ url: `${baseUrl}${RPC_PATH}` }).pipe(
              Layer.provide(Layer.mergeAll(FetchHttpClient.layer, RpcSerialization.layerNdjson)),
            ),
          ),
          // The group is runtime-assembled (`RpcGroup<any>`); the flat caller is
          // reached through the same loosening the core seam documents.
          // oxlint-disable-next-line typescript/no-explicit-any
        ) as Effect.Effect<any, never, never>;
        appRpcClient = AppRpcClientTag.of({
          call: (tag, payload) => flatClient(tag, payload),
        });
      }

      router = Router.of({
        currentMatch,
        navigate,
        httpApiClient: Option.some(httpApiClient),
        navigating: Subscribable.make({
          get: SubscriptionRef.get(navRef),
          changes: SubscriptionRef.changes(navRef),
        }),
      });

      return Context.make(Router, router).pipe(Context.add(AppRpcClientTag, appRpcClient));
    }),
  );

  // The render-time provide seam (AC4): the app-wide `context` Layer is merged into
  // the router layer, so the `ManagedRuntime` the client mounts under carries the
  // app services and every hydrated route/layout leaf reads them via `yield* Service`.
  // No context ⇒ the bare `core` layer, unchanged for `rpc`-only / no-service apps.
  const context = (options as { readonly context?: Layer.Layer<AppServices<R>, never, never> })
    .context;
  // The context is additionally **provided into** `core` (not only merged): the
  // runtimes captured during the layer build (the link interceptor's and the
  // popstate handler's) execute leaf pre-runs (`resolve-before-commit.specs.md`),
  // whose component bodies read app services. Layers are memoized by reference,
  // so `context` builds once and serves both roles.
  // When no context is provided the residual `AppServices<R>` is empty, so widening
  // `core` to the declared return type is sound (nothing extra is actually promised).
  return (
    context === undefined ? core : Layer.merge(Layer.provide(core, context), context)
  ) as Layer.Layer<Router | AppRpcClientTag | AppServices<R>>;
}
