/**
 * Static-site prerender script: emits the website to `dist/static`.
 *
 * Runs after `vp run build` (client + server bundles). Mirrors what the prod
 * `server.ts` does per request, but once per enumerated path, writing each HTML
 * response to disk: resolves the hashed client entry and CSS from
 * `dist/client/.vite/manifest.json`, imports `makeHandler` and `prerenderPaths`
 * from the built `dist/server/entry-server.js`, renders every path to
 * `dist/static{path}/index.html` (plus `404.html` from the synthetic not-found
 * path), and copies the client assets (minus `.vite/`) alongside. Exits non-zero
 * on any missing build artifact or non-OK page render. Partial output must not
 * look like success. Run via the `build:static` task: `vp run build:static`.
 *
 * Invoked directly with `tsx prerender.ts`; the pure helpers it composes live in
 * `src/lib/prerender.ts`. See `prerender.specs.md`.
 */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NOT_FOUND_PATH, outputFileFor } from "./src/lib/prerender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = join(__dirname, "dist/client");
const outDir = join(__dirname, "dist/static");

/**
 * Renders all enumerated paths and writes the static site to `dist/static`.
 * Throws (rejects) on missing manifest/server bundle, any enumerated path
 * rendering with status ≥ 400, or the not-found render not returning 404.
 */
export async function prerender(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(join(clientDir, ".vite/manifest.json"), "utf8"),
  ) as Record<string, { file: string; css?: string[] }>;
  const entry = manifest["src/entry-client.ts"];
  if (entry === undefined) {
    throw new Error("client manifest has no 'src/entry-client.ts' entry: run `vp run build` first");
  }

  // The built server bundle exports the same `makeHandler`/`prerenderPaths` as the
  // source entry.
  // @ts-ignore: resolved only after `vp build`; absent during `vp check`.
  const { makeHandler, prerenderPaths } = (await import("./dist/server/entry-server.js")) as {
    makeHandler: (
      clientEntry: string,
      styles?: readonly string[],
    ) => (request: Request) => Promise<Response>;
    prerenderPaths: readonly string[];
  };
  const handler = makeHandler(
    `/${entry.file}`,
    (entry.css ?? []).map((file) => `/${file}`),
  );

  // Fresh output each run so removed docs don't linger as stale pages. The manifest
  // is a build artifact, not a deployable asset. Exclude `.vite/` from the copy.
  await rm(outDir, { recursive: true, force: true });
  await cp(clientDir, outDir, {
    recursive: true,
    filter: (source) => basename(source) !== ".vite",
  });

  for (const pathname of [...prerenderPaths, NOT_FOUND_PATH]) {
    const response = await handler(new Request(new URL(pathname, "http://localhost")));
    const isNotFoundPage = pathname === NOT_FOUND_PATH;
    if (isNotFoundPage ? response.status !== 404 : response.status >= 400) {
      throw new Error(`prerender failed: ${pathname} rendered with HTTP ${response.status}`);
    }
    const file = outputFileFor(pathname, outDir);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await response.text());
    console.log(`[prerender] ${pathname} → ${relative(__dirname, file)}`);
  }
  console.log(
    `[prerender] ${prerenderPaths.length + 1} pages written to ${relative(__dirname, outDir)}`,
  );
}

// Run when invoked directly (`tsx prerender.ts`); a rejected top-level await exits non-zero.
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await prerender();
}
