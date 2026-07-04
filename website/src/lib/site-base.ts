/**
 * The website's base-path seam for subpath deployments (GitHub Pages serves
 * this site at `/<repo>/`). `SITE_BASE` is Vite's `import.meta.env.BASE_URL`
 * (driven by `base: process.env.SITE_BASE` in the Vite configs) normalized to
 * `""` at root; `withBase` prefixes app-rendered root-absolute hrefs. Route
 * definitions stay canonical — matching under the prefix is the router's job
 * via its `base` option (see `packages/router/src/base.specs.md`), which the
 * entries feed with `SITE_BASE`. See `prerender.specs.md` (Subpath deployment).
 */

/**
 * Normalizes a raw base ("" for root): `undefined`/`""`/`"/"` → `""`,
 * otherwise leading slash on, trailing slash off (`"/weft/"` → `"/weft"`).
 */
export function normalizeSiteBase(raw: string | undefined): string {
  if (raw === undefined || raw === "" || raw === "/") return "";
  const lead = raw.startsWith("/") ? raw : `/${raw}`;
  return lead.endsWith("/") ? lead.slice(0, -1) : lead;
}

/**
 * The build-time site base: `""` when served at the root, `"/weft"` on the
 * Pages subpath. Falls back to `""` outside Vite (e.g. `tsx` scripts, where
 * `import.meta.env` is undefined — `prerender.ts` reads `process.env.SITE_BASE`
 * itself instead).
 */
export const SITE_BASE: string = normalizeSiteBase(
  typeof import.meta.env === "undefined" ? undefined : import.meta.env.BASE_URL,
);

/** Prefixes a root-absolute path with {@link SITE_BASE}; other hrefs pass through. */
export function withBase(path: string): string {
  return path.startsWith("/") ? `${SITE_BASE}${path}` : path;
}
