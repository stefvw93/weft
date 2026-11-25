/** Public id of the module the plugin provides to apps. */
export const ASSETS_ID = "virtual:weft/assets";

/** Internal id of the module that turns the server entry into a web handler (dev only). */
export const DEV_HANDLER_ID = "virtual:weft/dev-handler";

/**
 * Placeholder for the path from an emitted server chunk to the client build
 * directory. Rewritten per chunk at render time, since only then is the chunk's
 * location known.
 */
export const CLIENT_DIR_PLACEHOLDER = "__WEFT_CLIENT_DIR__";

const IMMUTABLE = "public, max-age=31536000, immutable";

/** One entry of Vite's client build manifest (the fields this plugin reads). */
export interface ManifestEntry {
  readonly file: string;
  readonly css?: readonly string[];
  /** Manifest keys of the chunks this one imports statically. */
  readonly imports?: readonly string[];
}

/** Vite's client build manifest, keyed by source path or chunk name. */
export type Manifest = Readonly<Record<string, ManifestEntry>>;

/**
 * Every stylesheet the entry needs on first paint: its own CSS plus the CSS of
 * each chunk it imports statically, transitively. Vite lists CSS on the chunk
 * that imports it, so the entry record alone is not enough once code is split.
 */
export function entryStyles(manifest: Manifest, entryKey: string): readonly string[] {
  const styles = new Set<string>();
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (chunk === undefined) return;
    for (const imported of chunk.imports ?? []) visit(imported);
    for (const file of chunk.css ?? []) styles.add(file);
  };
  visit(entryKey);
  return [...styles];
}

/** Source of the head-tags component for a list of script and stylesheet URLs. */
function clientAssetsSource(scripts: readonly string[], styles: readonly string[]): string {
  const tags = [
    ...scripts.map((src) => `h.script({ type: "module", src: ${JSON.stringify(src)} })`),
    ...styles.map((href) => `h.link({ rel: "stylesheet", href: ${JSON.stringify(href)} })`),
  ];
  return `export const ClientAssets = () => h.fragment([${tags.join(", ")}]);`;
}

/** Dev variant: Vite's client plus the client entry source; Vite itself serves the files. */
export function devAssetsModule(base: string, clientEntry: string): string {
  return [
    `import { h } from "@weftui/core";`,
    `import { Layer } from "effect";`,
    clientAssetsSource([`${base}@vite/client`, `${base}${clientEntry}`], []),
    `export const StaticAssets = Layer.empty;`,
  ].join("\n");
}

/** Variant for module graphs that never render the document (the client build). */
export function inertAssetsModule(): string {
  return [
    `import { h } from "@weftui/core";`,
    `import { Layer } from "effect";`,
    clientAssetsSource([], []),
    `export const StaticAssets = Layer.empty;`,
  ].join("\n");
}

/**
 * Build variant: hashed entry and stylesheets from the manifest, plus a Layer that
 * serves the client directory. Hashed files under `assetsDir` go through Effect's
 * static server with an immutable cache header. Every other file gets its own
 * route, so nothing here can shadow the app's page routes or its not-found
 * fallback, and the manifest directory is skipped.
 */
export function buildAssetsModule(options: {
  readonly base: string;
  readonly assetsDir: string;
  readonly entry: ManifestEntry;
  /** Stylesheet files to link, from {@link entryStyles}. */
  readonly styles: readonly string[];
}): string {
  const { base, assetsDir, entry } = options;
  const styles = options.styles.map((file) => `${base}${file}`);
  // Routes are mounted on the path part of `base`. A full-URL base (a CDN) only
  // changes the tag URLs; a relative base serves from the root.
  const routeBase = /^[a-z][a-z0-9+.-]*:\/\//i.test(base)
    ? new URL(base).pathname
    : base.startsWith("/")
      ? base
      : "/";
  return [
    `import { h } from "@weftui/core";`,
    `import { Effect, FileSystem, Layer, Path } from "effect";`,
    `import { HttpRouter, HttpServerRespondable, HttpStaticServer } from "effect/http";`,
    clientAssetsSource([`${base}${entry.file}`], styles),
    `const clientUrl = new URL(${JSON.stringify(CLIENT_DIR_PLACEHOLDER)}, import.meta.url);`,
    // A file URL's pathname has a leading slash before a Windows drive letter.
    `const clientDir = decodeURIComponent(clientUrl.pathname).replace(/^\\/([A-Za-z]:)/, "$1");`,
    `const assetsDir = ${JSON.stringify(assetsDir)};`,
    `const base = ${JSON.stringify(routeBase.endsWith("/") ? routeBase : `${routeBase}/`)};`,
    `const Hashed = HttpStaticServer.layer({`,
    `  root: clientDir + "/" + assetsDir,`,
    `  prefix: base + assetsDir,`,
    `  index: undefined,`,
    `  cacheControl: ${JSON.stringify(IMMUTABLE)},`,
    `});`,
    `const Public = Layer.effectDiscard(Effect.gen(function* () {`,
    `  const router = yield* HttpRouter.HttpRouter;`,
    `  const fileSystem = yield* FileSystem.FileSystem;`,
    `  const path = yield* Path.Path;`,
    `  const serve = (yield* HttpStaticServer.make({ root: clientDir, index: undefined })).pipe(`,
    `    Effect.catch(HttpServerRespondable.toResponse),`,
    `  );`,
    `  const mount = base === "/" ? router : router.prefixed(base.replace(/\\/$/, ""));`,
    `  const files = yield* fileSystem.readDirectory(clientDir, { recursive: true });`,
    `  for (const file of files) {`,
    `    const relative = file.split(path.sep).join("/");`,
    `    if (relative === ".vite" || relative.startsWith(".vite/")) continue;`,
    `    if (relative === assetsDir || relative.startsWith(assetsDir + "/")) continue;`,
    `    const info = yield* fileSystem.stat(path.join(clientDir, file));`,
    `    if (info.type !== "File") continue;`,
    `    yield* mount.add("GET", "/" + relative, serve);`,
    `  }`,
    `}));`,
    `export const StaticAssets = Layer.mergeAll(Hashed, Public);`,
  ].join("\n");
}

/**
 * Dev-only module, evaluated in the app's module graph so the handler is built
 * with the app's own `effect` instance. The plugin checks `isLayer` before
 * calling `create`.
 */
export function devHandlerModule(serverEntry: string): string {
  return [
    `import routes from ${JSON.stringify(serverEntry)};`,
    `import { Layer } from "effect";`,
    `import { HttpRouter } from "effect/http";`,
    `export const isLayer = Layer.isLayer(routes);`,
    `export const create = () => HttpRouter.toWebHandler(routes);`,
  ].join("\n");
}
