import { Effect, Schema } from "effect";

/**
 * Tagged error raised by {@link notFound} and caught by the router's internal
 * not-found boundary. Exported so a user can place their own
 * `Boundary.catchTag("RouterNotFound", …)` to override the fallback for a subtree
 * (the router's internal boundary is outermost, so a nearer user boundary wins).
 *
 * Modeled as a `Schema.TaggedErrorClass` so it can be encoded/decoded across the wire
 * the same way `Boundary.rpc` replays typed failures.
 */
export class RouterNotFound extends Schema.TaggedErrorClass<RouterNotFound>()("RouterNotFound", {
  /** The path that could not be resolved, when known. */
  path: Schema.optional(Schema.String),
}) {}

/**
 * Short-circuits the current page render with a {@link RouterNotFound} failure,
 * Next.js-style. Callable from any page or layout `component`; the nearest
 * enclosing not-found boundary (the router's internal one by default) renders the
 * configured `notFound` page in its place. The server responds with HTTP 404.
 *
 * @param path - Optional path to attach for diagnostics.
 */
export const notFound = (path?: string): Effect.Effect<never, RouterNotFound> =>
  Effect.fail(new RouterNotFound({ path }));

/** Type guard recognising a {@link RouterNotFound} value regardless of its prototype. */
export const isRouterNotFound = (u: unknown): u is RouterNotFound =>
  typeof u === "object" && u !== null && "_tag" in u && u._tag === "RouterNotFound";

/**
 * Tagged error raised by `Router.params` / `Router.query` when the live match does
 * not satisfy the requested fields: either no route is matched, or a requested
 * key is missing / fails its schema's `Type`-side validation. `source` records
 * whether the failure was on the path params or the query, and `keys` lists the
 * requested field names for diagnostics.
 *
 * It bubbles up through the route tree's aggregate error channel, so a user may
 * place a `Boundary.catchTag("RouterParamsError", …)` to recover within a subtree.
 *
 * Modeled as a `Schema.TaggedErrorClass` so it can be encoded/decoded across the wire
 * the same way `RouterNotFound` and `Boundary.rpc` replay typed failures.
 */
export class RouterParamsError extends Schema.TaggedErrorClass<RouterParamsError>()(
  "RouterParamsError",
  {
    /** Which side of the match failed validation. */
    source: Schema.Literals(["path", "query"]),
    /** The requested field names, for diagnostics. */
    keys: Schema.Array(Schema.String),
  },
) {}
