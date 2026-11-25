import { Schema } from "effect";
import { type CompiledLeaf, leafRegistry } from "./compile";
import type { Fields, FieldsType, RouteNode } from "./route-tree";

/**
 * The `href` argument object for a leaf with path fields `Path` and query fields
 * `Query`. `path`/`query` become optional when their decoded type has no required
 * keys, and required otherwise (H4).
 */
export type HrefArgs<Path extends Fields, Query extends Fields> = ({} extends FieldsType<Path>
  ? { readonly path?: FieldsType<Path> }
  : { readonly path: FieldsType<Path> }) &
  ({} extends FieldsType<Query>
    ? { readonly query?: FieldsType<Query> }
    : { readonly query: FieldsType<Query> });

/**
 * Encodes decoded path params into a leaf's full path pattern. Shared by
 * {@link href} and prerender path enumeration so both produce identical URLs.
 * Throws when `path` does not encode through the leaf's path schema.
 */
export function encodeLeafPath(leaf: CompiledLeaf, path: Record<string, unknown>): string {
  const encoded = Schema.encodeUnknownSync(leaf.pathSchema)(path) as Record<string, unknown>;
  return leaf.fullPathPattern.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) =>
    encodeURIComponent(String(encoded[name])),
  );
}

/**
 * Builds a type-safe URL for a leaf route reference (the value returned by
 * {@link route}). Path params are encoded into the pattern and query values are
 * encoded into a key-sorted search string (H1–H4). Round-trips with `match`.
 *
 * The leaf must belong to a tree that has been sealed with `Router.router()`
 * (which stamps the leaf registry); otherwise an error is thrown.
 *
 * @example
 * ```ts
 * const userRoute = Router.route("users/:id", {
 *   path: { id: Schema.NumberFromString },
 *   component: …,
 * });
 * Router.router(Router.layout({ component: … }, [userRoute]), { notFound });
 * href(userRoute, { path: { id: 42 } }); // "/users/42"
 * ```
 */
export function href<Path extends Fields, Query extends Fields>(
  ref: RouteNode<Path, Query, any, any, any>,
  ...args: {} extends HrefArgs<Path, Query>
    ? [args?: HrefArgs<Path, Query>]
    : [args: HrefArgs<Path, Query>]
): string {
  const leaf = leafRegistry.get(ref);
  if (leaf === undefined) {
    throw new Error(
      "href: route has not been compiled. Seal the tree with Router.router() before calling href().",
    );
  }
  const { path = {}, query = {} } = (args[0] ?? {}) as {
    path?: Record<string, unknown>;
    query?: Record<string, unknown>;
  };

  let url = encodeLeafPath(leaf, path);

  const encodedQuery = Schema.encodeUnknownSync(leaf.querySchema)(query) as Record<string, unknown>;
  const params = new URLSearchParams();
  for (const key of Object.keys(encodedQuery).sort()) {
    const value = encodedQuery[key];
    if (value !== undefined && value !== null) {
      // Query schemas encode to string-like primitives; the encoded type is `unknown`.
      params.append(key, String(value as string | number | boolean | bigint));
    }
  }
  const search = params.toString();
  if (search.length > 0) url = `${url}?${search}`;

  return url;
}
