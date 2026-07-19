import { Context, type Effect } from "effect";

/**
 * Ambient, package-neutral seam for resolving a {@link Boundary.rpc} boundary's
 * data through the application's merged `RpcGroup`. The DOM renderer
 * (`@weftui/dom`) must resolve a boundary **without** importing
 * `effect/unstable/rpc` or `@weftui/router`, on the server (SSR), during a
 * client refetch, and on a client-first SPA mount. So the rpc caller is injected as a
 * service: `@weftui/router` provides it (a network `RpcClient` on the browser,
 * an in-process client over the handler layer on the server), and the renderer
 * reads it from ambient context, treating `Option.none` (no router/rpc present)
 * as a typed, descriptive error.
 *
 * The seam is **flat and untyped at the boundary**: a single `call(tag, payload)`
 * that mirrors `RpcClient`'s flat-client shape (`(tag, payload) => Effect<success>`).
 * The renderer carries the rpc's `successSchema`/`errorSchema` on the descriptor
 * and owns decoding, so this seam stays free of `effect/unstable/rpc` types.
 */
export interface AppRpcClient {
  /**
   * Invoke the rpc identified by `tag` with `payload`, resolving to its decoded
   * `success` value. The error channel is opaque (`unknown`): the renderer maps a
   * resolved rpc **error** onto the boundary's typed-failure replay (SSR) or its
   * resource's stale-on-error channel (refetch), while transport defects surface
   * the same way. `payload` is the rpc's decoded payload value (already the shape
   * the rpc's `payloadSchema` describes), not a serialized envelope.
   */
  readonly call: (tag: string, payload: unknown) => Effect.Effect<unknown, unknown>;
}

/**
 * Context tag for the {@link AppRpcClient} seam. Provided by `@weftui/router`:
 * a network client (`RouterLive`, POST `/_eui/rpc`) on the client, an
 * in-process client over the handler layer (`RouterServer`) on the server. Absent
 * in a router-less mount, where a {@link Boundary.rpc} resolves to a descriptive
 * "needs router/rpc" error.
 */
export class AppRpcClientTag extends Context.Service<AppRpcClientTag, AppRpcClient>()(
  "@weftui/core/AppRpcClient",
) {}
