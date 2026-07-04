/**
 * Base-path helpers: serve a router app under a URL prefix (e.g. GitHub Pages
 * project sites at `/<repo>/`) without changing route definitions.
 *
 * The router keeps every internal URL (`urlRef`, `match.url`, `navigate`
 * targets) **canonical** — base-less; the base exists only at the URL
 * boundaries (`window.location`, History entries, incoming request URLs),
 * where these helpers strip or prefix it. See `base.specs.md`.
 */

/**
 * The canonical URL substituted when a boundary URL is outside the configured
 * base. It matches no route, so it deterministically renders the not-found
 * page instead of accidentally matching a base-less route pattern.
 */
export const OUTSIDE_BASE_URL = "/__outside-base__";

/**
 * Normalizes a `base` option: `undefined`/`""`/`"/"` → `""` (root, no base);
 * anything else gains a leading `/` and loses any trailing `/`
 * (`"/weft/"` → `"/weft"`).
 */
export function normalizeBase(base: string | undefined): string {
  if (base === undefined || base === "" || base === "/") return "";
  const lead = base.startsWith("/") ? base : `/${base}`;
  return lead.endsWith("/") ? lead.slice(0, -1) : lead;
}

/**
 * Strips a normalized `base` from a `path + search` URL. Returns the canonical
 * (base-less) URL when `url` is under the base — the prefix must end at a
 * segment boundary (`/weft/docs`, `/weft`, `/weft?x`), so `/weftx` is outside.
 * Returns `null` when outside; identity when `base` is `""`.
 */
export function stripBase(base: string, url: string): string | null {
  if (base === "") return url;
  if (!url.startsWith(base)) return null;
  const rest = url.slice(base.length);
  if (rest === "" || rest === "/") return "/";
  if (rest.startsWith("?")) return `/${rest}`;
  if (!rest.startsWith("/")) return null;
  return rest;
}

/**
 * Strips a normalized `base` like {@link stripBase}, but substitutes
 * {@link OUTSIDE_BASE_URL} when the URL is outside the base — for boundaries
 * that must always yield *some* canonical URL (location reads, server render).
 */
export function canonicalize(base: string, url: string): string {
  return stripBase(base, url) ?? OUTSIDE_BASE_URL;
}
