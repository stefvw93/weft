import { Subscribable } from "@weftui/core";
import { Effect, Schema } from "effect";
import { href, type HrefArgs } from "../href";
import type { Fields, RouteNode } from "../route-tree";
import { type NavigateOptions, Router } from "../router-service";

/**
 * Programmatic, type-safe navigation helpers built on the `Router` service and the
 * type-safe {@link href} builder. They mirror the History API the client `Router`
 * layer (`RouterLive`) is backed by:
 *
 * - {@link navigate}: go to a leaf route reference with typed `{ path, query }`.
 * - {@link push} / {@link replace}: go to a raw `path + search` string.
 * - {@link back} / {@link forward}: step through History (`history.go`).
 * - {@link setQuery} / {@link patchQuery}: change the current route's query in
 *   place, re-encoding through the matched leaf's `querySchema`.
 *
 * All but `back`/`forward` require the `Router` service (run them within the layer
 * provided by `RouterLive`); `back`/`forward` only touch `window.history`.
 */

/**
 * Navigates to a leaf route `ref` with typed `path`/`query` args, building the URL
 * via {@link href} (so it round-trips with `match`) and pushing the History entry,
 * or replacing it with `options.replace`. `path` is required when the route has
 * path params; `query` is optional when every query field is optional (same
 * requiredness rules as `href`).
 *
 * @example
 * ```ts
 * yield* navigate(userRoute, { path: { id: 42 } });
 * yield* navigate(userRoute, { path: { id: 42 }, query: { tab: "posts" } }, { replace: true });
 * ```
 */
export function navigate<Path extends Fields, Query extends Fields>(
  ref: RouteNode<Path, Query, any, any>,
  ...args: {} extends HrefArgs<Path, Query>
    ? [args?: HrefArgs<Path, Query>, options?: NavigateOptions]
    : [args: HrefArgs<Path, Query>, options?: NavigateOptions]
): Effect.Effect<void, never, Router> {
  const [hrefArgs, options] = args as [HrefArgs<Path, Query>?, NavigateOptions?];
  // `href`'s variadic conditional-tuple signature does not survive generic
  // forwarding here; the args are validated by this function's own overload, so
  // the call is bridged through a plain `(ref, args?) => string` view.
  const to = (href as unknown as (ref: unknown, args?: unknown) => string)(ref, hrefArgs);
  return Effect.flatMap(Router, (router) => router.navigate(to, options));
}

/** Navigates to a raw `path + search` string, pushing a new History entry. */
export const push = (to: string): Effect.Effect<void, never, Router> =>
  Effect.flatMap(Router, (router) => router.navigate(to));

/** Navigates to a raw `path + search` string, replacing the current History entry. */
export const replace = (to: string): Effect.Effect<void, never, Router> =>
  Effect.flatMap(Router, (router) => router.navigate(to, { replace: true }));

/** Steps one entry back in History (`history.go(-1)`); the `popstate` handler resyncs. */
export const back = (): Effect.Effect<void> => Effect.sync(() => window.history.go(-1));

/** Steps one entry forward in History (`history.go(1)`); the `popstate` handler resyncs. */
export const forward = (): Effect.Effect<void> => Effect.sync(() => window.history.go(1));

/** Encodes an already-encoded query record into a key-sorted search string (mirrors `href`). */
function encodeSearch(encoded: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(encoded).sort()) {
    const value = encoded[key];
    if (value !== undefined && value !== null) {
      // Query schemas encode to string-like primitives; the encoded type is `unknown`.
      params.append(key, String(value as string | number | boolean | bigint));
    }
  }
  return params.toString();
}

/** The path portion (without the search) of a normalized match URL. */
function pathOf(url: string): string {
  const qIndex = url.indexOf("?");
  return qIndex === -1 ? url : url.slice(0, qIndex);
}

/**
 * Navigates within the current route, transforming its decoded query and
 * re-encoding through the matched leaf's `querySchema`. The path is preserved (so
 * the leaf stays mounted; reactive `Router.queryStream` readers update in place).
 * A no-op when no route is currently matched.
 */
function applyQuery(
  transform: (current: Record<string, unknown>) => Record<string, unknown>,
  options?: NavigateOptions,
): Effect.Effect<void, never, Router> {
  return Effect.gen(function* () {
    const router = yield* Router;
    const match = yield* Subscribable.get(router.currentMatch);
    if (match._tag !== "Matched") return;
    const next = transform(match.query);
    const encoded = Schema.encodeUnknownSync(match.leaf.querySchema)(next) as Record<
      string,
      unknown
    >;
    const search = encodeSearch(encoded);
    const path = pathOf(match.url);
    yield* router.navigate(search.length > 0 ? `${path}?${search}` : path, options);
  });
}

/**
 * Replaces the current route's query entirely with `query` (re-encoded through the
 * matched leaf's `querySchema`), keeping the path. Pass `{}` to clear the query.
 */
export const setQuery = (
  query: Record<string, unknown>,
  options?: NavigateOptions,
): Effect.Effect<void, never, Router> => applyQuery(() => query, options);

/**
 * Merges `partial` into the current route's decoded query (re-encoded through the
 * matched leaf's `querySchema`), keeping the path and any unspecified query fields.
 */
export const patchQuery = (
  partial: Record<string, unknown>,
  options?: NavigateOptions,
): Effect.Effect<void, never, Router> =>
  applyQuery((current) => ({ ...current, ...partial }), options);
