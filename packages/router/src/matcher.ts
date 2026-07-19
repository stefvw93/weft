import { Result, Schema } from "effect";
import type { CompiledLeaf, RouterDef } from "./compile";

/** The resolved match for a URL: a leaf with decoded params/query, or not-found. */
export type RouteMatch =
  | {
      readonly _tag: "Matched";
      readonly leaf: CompiledLeaf;
      readonly path: Record<string, unknown>;
      readonly query: Record<string, unknown>;
      /** Normalized request URL (path + search), used by the outlet as a dedupe key. */
      readonly url: string;
    }
  | {
      readonly _tag: "NotFound";
      readonly url: string;
    };

/** A string-encodeable schema as carried by an HttpApi endpoint's path/urlParams slot. */
type ParamSchema = Schema.Codec<Record<string, unknown>, unknown, never>;

/**
 * The slice of an `HttpApiEndpoint` the matcher reads. `def.httpApi` is typed
 * `HttpApi.Top` (its group/endpoint shapes are assembled in a runtime loop by
 * `buildHttpApi`), so the endpoints are read through this structural view rather
 * than platform's precise generic types.
 */
interface EndpointShape {
  /** Endpoint identifier: the leaf `id`, the `httpApi ↔ compiled` join key. */
  readonly identifier: string;
  /** Full path template, e.g. `/users/:id` (same as the leaf's `fullPathPattern`). */
  readonly path: string;
  /** Path-param schema (v4 `params` slot); `undefined` when the endpoint has none. */
  readonly params: ParamSchema | undefined;
  /** Query schema (v4 `query` slot); `undefined` when the endpoint has none. */
  readonly query: ParamSchema | undefined;
}

/** Structural view of the compiled `HttpApi`: its `"pages"` group of leaf endpoints. */
interface HttpApiShape {
  readonly groups: Record<string, { readonly endpoints: Record<string, EndpointShape> }>;
}

/** A precompiled regex + decode schemas for one leaf, sourced from its HttpApi endpoint. */
interface MatcherEntry {
  /** The compiled leaf (render/nesting metadata), resolved from the endpoint id. */
  readonly leaf: CompiledLeaf;
  readonly regex: RegExp;
  readonly paramNames: readonly string[];
  /** Path-param schema, read from the endpoint's `params` slot. */
  readonly pathSchema: ParamSchema;
  /** Query schema, read from the endpoint's `query` slot. */
  readonly querySchema: ParamSchema;
}

/** Escapes a literal path segment for inclusion in a `RegExp`. */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The `:name` placeholder names in a path template, in order. */
function paramNamesOf(pattern: string): readonly string[] {
  return pattern
    .split("/")
    .filter((s) => s.startsWith(":"))
    .map((s) => s.slice(1));
}

/** Number of `:param` segments in a pattern; fewer params = more specific (M6). */
function paramCount(pattern: string): number {
  return pattern.split("/").filter((s) => s.startsWith(":")).length;
}

/** Builds a regex matching a full pattern, tolerating an optional trailing slash (M3). */
function patternToRegex(pattern: string): RegExp {
  const parts = pattern.split("/").filter((s) => s.length > 0);
  const body = parts
    .map((part) => (part.startsWith(":") ? "([^/]+)" : escapeRegex(part)))
    .join("/");
  return new RegExp(body.length === 0 ? "^/?$" : `^/${body}/?$`);
}

/** Empty-struct fallback for an endpoint with no declared path/query schema. */
const emptySchema: ParamSchema = Schema.Struct({}) as unknown as ParamSchema;

/**
 * Memoizes the compiled matcher entries per {@link RouterDef} so the regexes are
 * built and sorted once, not on every `match()` call (which is on the hot path:
 * every navigation, every link-interceptor click, and once per server request).
 */
const matchersCache: WeakMap<RouterDef, readonly MatcherEntry[]> = new WeakMap();

/**
 * Precompiles a {@link RouterDef} into ordered matcher entries (memoized per
 * `RouterDef`). Patterns and path/query schemas are read from the authoritative
 * `def.httpApi` `"pages"` endpoints (the single source of truth the server dispatch
 * also reads), and each entry's render metadata leaf is resolved from `def.compiled`
 * by endpoint id. Matching stays local (SPA URL→leaf); see the refactor plan's
 * _Feasibility constraint_.
 *
 * Entries are sorted most-specific first (fewer params, then longer pattern) so a
 * static segment wins over a param segment at the same position (M6). That order is
 * a global heuristic, so two patterns with the same param count and length (e.g.
 * `/a/:b/c` vs `/a/x/:d`) fall back to endpoint order.
 */
export function compileMatchers(def: RouterDef): readonly MatcherEntry[] {
  const cached = matchersCache.get(def);
  if (cached !== undefined) return cached;

  const leafById = new Map<string, CompiledLeaf>();
  for (const leaf of def.compiled.leaves) leafById.set(leaf.id, leaf);

  const api = def.httpApi as unknown as HttpApiShape;
  const endpoints = api.groups["pages"]?.endpoints ?? {};

  const entries: MatcherEntry[] = [];
  for (const endpoint of Object.values(endpoints)) {
    const leaf = leafById.get(endpoint.identifier);
    // Every "pages" endpoint is built from a compiled leaf (same id), so the join
    // is total; guard only to satisfy the index-access type.
    if (leaf === undefined) continue;
    entries.push({
      leaf,
      regex: patternToRegex(endpoint.path),
      paramNames: paramNamesOf(endpoint.path),
      pathSchema: endpoint.params ?? emptySchema,
      querySchema: endpoint.query ?? emptySchema,
    });
  }

  entries.sort((a, b) => {
    const pc = paramCount(a.leaf.fullPathPattern) - paramCount(b.leaf.fullPathPattern);
    if (pc !== 0) return pc;
    return b.leaf.fullPathPattern.length - a.leaf.fullPathPattern.length;
  });

  matchersCache.set(def, entries);
  return entries;
}

/** Splits a request URL into its normalized path and raw query string. */
function splitUrl(url: string): { readonly path: string; readonly search: string } {
  const hashIndex = url.indexOf("#");
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const qIndex = withoutHash.indexOf("?");
  const rawPath = qIndex === -1 ? withoutHash : withoutHash.slice(0, qIndex);
  const search = qIndex === -1 ? "" : withoutHash.slice(qIndex + 1);
  // Normalize: ensure a single leading slash, strip a trailing slash (except root).
  let path = rawPath.length === 0 ? "/" : rawPath;
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return { path, search };
}

/** Parses a raw query string into a flat record (last value wins on repeat). */
function parseQuery(search: string): Record<string, string> {
  const record: Record<string, string> = {};
  if (search.length === 0) return record;
  for (const [key, value] of new URLSearchParams(search)) {
    record[key] = value;
  }
  return record;
}

/**
 * Matches a request URL against a {@link RouterDef} (M1–M7). Returns the decoded
 * `Matched` leaf, or `NotFound` when nothing matches or a path/query decode fails
 * (decode failure is treated as no-match, not an error). Patterns and schemas come
 * from `def.httpApi` via {@link compileMatchers}.
 */
export function match(def: RouterDef, url: string): RouteMatch {
  const entries = compileMatchers(def);
  const { path, search } = splitUrl(url);
  const normalizedUrl = search.length === 0 ? path : `${path}?${search}`;

  for (const entry of entries) {
    const m = entry.regex.exec(path);
    if (m === null) continue;

    const rawParams: Record<string, string> = {};
    entry.paramNames.forEach((name, i) => {
      const raw = m[i + 1];
      if (raw !== undefined) rawParams[name] = decodeURIComponent(raw);
    });

    const decodedPath = Schema.decodeUnknownResult(entry.pathSchema)(rawParams);
    if (Result.isFailure(decodedPath)) continue;

    // M8: a query decode failure (a declared query field whose value violates its
    // schema, e.g. `?page=abc` for `NumberFromString`) is a no-match, like a path
    // decode failure, not a thrown error. Excess/undeclared query keys are
    // ignored by `Schema.Struct`, so only declared-but-invalid values 404.
    const decodedQuery = Schema.decodeUnknownResult(entry.querySchema)(parseQuery(search));
    if (Result.isFailure(decodedQuery)) continue;

    return {
      _tag: "Matched",
      leaf: entry.leaf,
      path: decodedPath.success,
      query: decodedQuery.success,
      url: normalizedUrl,
    };
  }

  return { _tag: "NotFound", url: normalizedUrl };
}
