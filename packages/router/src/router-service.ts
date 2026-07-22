import type { Node } from "@weftui/core";
import type { HttpApiClient } from "effect/unstable/httpapi";
import { Context, Effect, type Option, Stream } from "effect";
import { Subscribable } from "@weftui/core";
import { makeRouter } from "./compile";
import { RouterParamsError } from "./errors";
import type { RouteMatch } from "./matcher";
import type { Fields, FieldsType } from "./route-tree";
import { lazyComponent, makeLayout, makeRoute } from "./route-tree";

/**
 * The universal router service. Provided per render: by `RouterLive` on the
 * client (History-API backed) and by a fixed per-request implementation on the
 * server. Layouts and pages read it anywhere via `yield* Router`.
 *
 * The `Router` symbol is also the authoring namespace: {@link Router.route},
 * {@link Router.layout}, and {@link Router.router} build the route tree (mirroring
 * `Component.gen` / `Boundary.catchTag` / `h.div`), and {@link Router.Outlet} /
 * {@link Router.params} / {@link Router.query} deliver the outlet and the live
 * match's params/query by dependency injection. The roles merge by declaration:
 * `yield* Router` reads the service; `Router.route(…)` authors a tree.
 */
/**
 * The platform `HttpApiClient` derived from a router's `HttpApi` spine. Typed
 * opaquely (`Client<any, …>`) because the spine is `HttpApi.Top`: its
 * group/endpoint shapes are assembled in a runtime loop by `buildHttpApi`, so a
 * precise client type is not recoverable. Present (`Option.some`) on the client
 * (`RouterLive`), absent (`Option.none`) on the server, which is itself the origin.
 */
export type RouterHttpApiClient = HttpApiClient.Client<any, any, never>;

/**
 * The client navigation state exposed reactively as {@link Router.navigating}.
 * Client navigation is **deferred-commit** (see `pending-navigation.specs.md`
 * and `resolve-before-commit.specs.md`): while the target branch's lazy chunk(s)
 * and the leaf component's own effect (its data) resolve, the state is
 * `Navigating` (carrying the target `to`), returning to `Idle` on commit. A
 * navigation whose leaf resolves synchronously never leaves `Idle`. Always
 * `Idle` on the server (buffered render).
 */
export type NavState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Navigating"; readonly to: string };

/** Options for a router {@link Router} `navigate` call. */
export interface NavigateOptions {
  /**
   * Replace the current History entry (`history.replaceState`) instead of pushing
   * a new one (`history.pushState`). Defaults to `false` (push). A no-op on the
   * server, where navigation is a client concern.
   */
  readonly replace?: boolean;
}

export class Router extends Context.Service<
  Router,
  {
    /** The current match as a hot `Subscribable`; drives the outlet. */
    readonly currentMatch: Subscribable.Subscribable<RouteMatch>;
    /**
     * Navigates to `to` (a path, optionally with a query). On the client this
     * pushes History state and re-renders the affected outlet; on the server it
     * is a no-op (navigation is a client concern).
     */
    readonly navigate: (to: string, options?: NavigateOptions) => Effect.Effect<void>;
    /**
     * The derived {@link RouterHttpApiClient} for network work (route prefetch,
     * foundation for future loaders/data). `Option.some` on the client,
     * `Option.none` on the server. SPA URL→leaf resolution does **not** use this.
     * It stays local via the shared matcher (see the refactor _Feasibility constraint_).
     */
    readonly httpApiClient: Option.Option<RouterHttpApiClient>;
    /**
     * Reactive client navigation state (see {@link NavState}). `Navigating{to}` while
     * a deferred-commit navigation resolves its lazy chunk(s) and the leaf
     * component's own effect, `Idle` otherwise. An app reads it via
     * {@link Router.navigatingStream} to render pending UI (e.g. a top progress
     * bar). Constant `Idle` on the server.
     */
    readonly navigating: Subscribable.Subscribable<NavState>;
  }
>()("@weftui/router/Router") {}

/**
 * The injected outlet: the node a layout (or the server document shell) splices
 * to place the next level down. Provided per render by the router
 * (`Effect.provideService(layout.component({}), OutletTag, innerNode)`); a layout
 * reads it with `yield* Router.Outlet`.
 *
 * Typed **opaque** as `Node<never, never>` so splicing `[outlet]` adds nothing to
 * a layout's local channels: the subtree's real channels are aggregated
 * structurally by {@link makeLayout} / {@link makeRouter}, never inferred across
 * this DI boundary. Re-exported on the namespace as `Router.Outlet`.
 */
class OutletTag extends Context.Service<OutletTag, Node<never, never>>()("@weftui/router/Outlet") {}

/** Picks the requested `fields` keys out of a decoded match record. */
function pick<F extends Fields>(
  fields: F,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const subset: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) subset[key] = record[key];
  return subset;
}

/**
 * Reads the live match's **path params** for the requested `fields`. Snapshot
 * semantics (reads `yield* Router`, then `Subscribable.get(currentMatch)`), returning the
 * already-decoded values **directly**: the matcher decoded them against the leaf's
 * full path schema, so no re-validation is needed. The cast is sound because the
 * picked subset is the `Type` side of `fields`. Fails with a {@link RouterParamsError}
 * (`source: "path"`) only when no route is matched. Re-exported as `Router.params`.
 */
function readParams<F extends Fields>(
  fields: F,
): Effect.Effect<FieldsType<F>, RouterParamsError, Router> {
  return Effect.gen(function* () {
    const router = yield* Router;
    const match = yield* Subscribable.get(router.currentMatch);
    if (match._tag === "NotFound") {
      return yield* Effect.fail(
        new RouterParamsError({ source: "path", keys: Object.keys(fields) }),
      );
    }
    return pick(fields, match.path) as FieldsType<F>;
  });
}

/**
 * Reads the live match's **query** for the requested `fields`. Same snapshot +
 * direct-read semantics as {@link readParams}, failing with a
 * {@link RouterParamsError} (`source: "query"`) only on a no-match. Re-exported as
 * `Router.query`.
 */
function readQuery<F extends Fields>(
  fields: F,
): Effect.Effect<FieldsType<F>, RouterParamsError, Router> {
  return Effect.gen(function* () {
    const router = yield* Router;
    const match = yield* Subscribable.get(router.currentMatch);
    if (match._tag === "NotFound") {
      return yield* Effect.fail(
        new RouterParamsError({ source: "query", keys: Object.keys(fields) }),
      );
    }
    return pick(fields, match.query) as FieldsType<F>;
  });
}

/**
 * Builds a reactive {@link Subscribable} of the picked `fields` from a `currentMatch`
 * Subscribable, reading the `path` or `query` side. Unlike {@link readParams} /
 * {@link readQuery} (snapshot accessors that fail on `NotFound`), the reactive form
 * is **resilient**: a `NotFound` match yields the empty subset (each field
 * `undefined`) rather than failing, so the stream stays live across navigations.
 */
function selectStream<F extends Fields>(
  currentMatch: Subscribable.Subscribable<RouteMatch>,
  fields: F,
  source: "path" | "query",
): Subscribable.Subscribable<FieldsType<F>> {
  const select = (m: RouteMatch): FieldsType<F> =>
    pick(fields, m._tag === "Matched" ? m[source] : {}) as FieldsType<F>;
  return Subscribable.make({
    get: Effect.map(Subscribable.get(currentMatch), select),
    changes: Stream.map(Subscribable.changes(currentMatch), select),
  });
}

/**
 * Reactive counterpart to {@link readParams}: a {@link Subscribable} of the live
 * match's **path params** for `fields`, derived from `Subscribable.changes(currentMatch)`. It
 * re-emits on every navigation and stays live across `NotFound` (yielding the empty
 * subset), so a component can render `[Subscribable.changes(yield* Router.paramsStream(fields))]`
 * and update in place even when the outlet keeps the same leaf mounted. Re-exported
 * as `Router.paramsStream`.
 */
function subscribeParams<F extends Fields>(
  fields: F,
): Effect.Effect<Subscribable.Subscribable<FieldsType<F>>, never, Router> {
  return Effect.map(Router, (router) => selectStream(router.currentMatch, fields, "path"));
}

/**
 * Reactive counterpart to {@link readQuery}: a {@link Subscribable} of the live
 * match's **query** for `fields`. Especially useful for query-only changes
 * (`setQuery` / `patchQuery`), which keep the same leaf mounted: a snapshot
 * `Router.query` would not update, but this stream does. Re-exported as
 * `Router.queryStream`.
 */
function subscribeQuery<F extends Fields>(
  fields: F,
): Effect.Effect<Subscribable.Subscribable<FieldsType<F>>, never, Router> {
  return Effect.map(Router, (router) => selectStream(router.currentMatch, fields, "query"));
}

/**
 * Reactive {@link Subscribable} of the client {@link NavState}. A component reads
 * `[Subscribable.changes(yield* Router.navigatingStream)]` to render pending UI during a
 * deferred-commit navigation (`pending-navigation.specs.md`,
 * `resolve-before-commit.specs.md`). Re-exported as `Router.navigatingStream`.
 */
const subscribeNavigating: Effect.Effect<
  Subscribable.Subscribable<NavState>,
  never,
  Router
> = Effect.map(Router, (router) => router.navigating);

// oxlint-disable-next-line no-namespace -- declaration merge: authoring combinators on the Router Tag
export namespace Router {
  /** Declares a leaf page. See {@link makeRoute}. */
  export const route = makeRoute;
  /** Declares a layout wrapping an injected outlet. See {@link makeLayout}. */
  export const layout = makeLayout;
  /** Wraps a dynamic-import loader as a lazy component slot. See {@link lazyComponent}. */
  export const lazy = lazyComponent;
  /** Seals a route tree into a `RouterDef`. See {@link makeRouter}. */
  export const router = makeRouter;
  /** The injected outlet service value (yieldable Tag). See {@link OutletTag}. */
  export const Outlet = OutletTag;
  /** The injected outlet service identity (for `Exclude<R, Router.Outlet>`). */
  export type Outlet = OutletTag;
  /** Reads the live match's path params for the requested fields. See {@link readParams}. */
  export const params = readParams;
  /** Reads the live match's query for the requested fields. See {@link readQuery}. */
  export const query = readQuery;
  /** Reactive {@link Subscribable} of the live match's path params. See {@link subscribeParams}. */
  export const paramsStream = subscribeParams;
  /** Reactive {@link Subscribable} of the live match's query. See {@link subscribeQuery}. */
  export const queryStream = subscribeQuery;
  /** Reactive {@link Subscribable} of the client navigation state. See {@link subscribeNavigating}. */
  export const navigatingStream = subscribeNavigating;
}
