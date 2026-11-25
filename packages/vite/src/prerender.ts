import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { WebHandler } from "./node-bridge";

/** Entry name of the runner chunk in the server build. Its file name follows the build's naming. */
export const PRERENDER_RUNNER = "weft-prerender";

/**
 * File, inside the client build's `.vite` directory, that lists the paths
 * prerendered for `"server"` output. `StaticAssets` reads it at startup. The
 * `.vite` directory is never served.
 */
export const PRERENDER_LIST = "weft-prerender.json";

/** A path no route claims: rendering it yields the app's not-found page. */
const NOT_FOUND_PROBE = "/__weft_prerender_not_found__";

/** Requests are in-process, so the origin is only a placeholder for URL parsing. */
const ORIGIN = "http://localhost";

/** What the runner module (`prerenderModule`) hands back once opened. */
interface PrerenderSession {
  readonly handler: WebHandler;
  readonly dispose: () => Promise<void>;
  /** The app's prerender paths, or `null` when its Layer has no `RouterServer.Prerender`. */
  readonly paths: (output: "server" | "static") => Promise<readonly string[] | null>;
}

interface RunnerModule {
  /** Whether any route declared pages to prerender. Builds nothing. */
  readonly hasDeclarations: () => boolean;
  /** `null` when the server entry's default export is not a Layer. */
  readonly open: () => PrerenderSession | null;
}

/** Inputs of {@link prerender}. */
export interface PrerenderOptions {
  readonly output: "server" | "static";
  /** Absolute path of the client build directory. */
  readonly clientDir: string;
  /** Absolute path of the static export directory. */
  readonly staticDir: string;
  /** Absolute path of the emitted runner chunk. */
  readonly runnerFile: string;
  /** Registry key of the router's "a route declared prerender" flag. */
  readonly declaredKey: string;
  /** The Vite root, used to print paths relative to it. */
  readonly root: string;
  readonly log: (message: string) => void;
}

/** One rendered page, held in memory until every page has rendered. */
interface Page {
  readonly path: string;
  readonly body: string;
}

/**
 * The file a URL path is written to: `{path}/index.html`, with `/` as
 * `index.html`. Segments are URL-decoded so a static host maps the URL back.
 * Throws for a segment that would leave `outDir` once decoded.
 */
function pageFile(outDir: string, path: string): string {
  const segments = path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));
  for (const segment of segments) {
    if (segment === "." || segment === ".." || /[/\\]/.test(segment)) {
      throw new Error(
        `weft(): cannot prerender ${path}: the segment "${segment}" is not a valid directory name, so the page would be written outside the output directory.`,
      );
    }
  }
  return join(outDir, ...segments, "index.html");
}

/**
 * Renders the app's prerender paths from the built server bundle and writes them
 * out (spec: `weft-plugin.specs.md` V30 to V44). Every page is rendered before
 * anything is written, so a failure leaves no partial output. The runner chunk is
 * a build-time helper and is removed afterwards.
 */
export async function prerender(options: PrerenderOptions): Promise<void> {
  const { output, clientDir, staticDir, runnerFile, root, log } = options;
  let session: PrerenderSession | null = null;
  try {
    // Evaluating the app's routes sets this flag again if any of them declares pages.
    const registry = globalThis as Record<symbol, unknown>;
    delete registry[Symbol.for(options.declaredKey)];
    // A fresh query defeats Node's module cache when one process builds repeatedly.
    const runner = (await import(
      `${pathToFileURL(runnerFile).href}?t=${Date.now()}`
    )) as RunnerModule;
    // With nothing declared, "server" output has nothing to render, so the app's
    // Layer (and the services it acquires) is never built during the build.
    if (output === "server" && !runner.hasDeclarations()) return;

    session = runner.open();
    const pages: Page[] = [];
    let notFound: { readonly status: number; readonly body: string } | undefined;
    let paths: readonly string[] | null = null;
    if (session !== null) {
      // The first request builds the Layer, which is when its services become readable.
      const probe = await session.handler(new Request(`${ORIGIN}${NOT_FOUND_PROBE}`));
      notFound = { status: probe.status, body: await probe.text() };
      paths = await session.paths(output);
    }

    if (paths === null) {
      if (output === "server") return;
      throw new Error(
        'weft(): output "static" needs prerender paths, but the server entry\'s Layer does not provide them. Build the routes with RouterServer.layer(App, { document }).',
      );
    }

    for (const path of paths) {
      const response = await session!.handler(new Request(`${ORIGIN}${path}`));
      const body = await response.text();
      if (response.status >= 400) {
        throw new Error(
          `weft(): prerendering ${path} failed: the app responded with status ${response.status}.`,
        );
      }
      // Validated now, so an unwritable path fails before anything is written.
      pageFile(clientDir, path);
      pages.push({ path, body });
    }

    if (output === "static") {
      if (notFound === undefined || notFound.status !== 404) {
        throw new Error(
          `weft(): the not-found page responded with status ${notFound?.status ?? "none"}, expected 404. A static build writes it as 404.html.`,
        );
      }
      // Emptied first so pages removed since the last build do not linger.
      await rm(staticDir, { recursive: true, force: true });
      await cp(clientDir, staticDir, {
        recursive: true,
        // The manifest directory is a build artifact, not a deployable asset.
        filter: (source) => basename(source) !== ".vite",
      });
      await writePages(staticDir, pages, root, log);
      const notFoundFile = join(staticDir, "404.html");
      await writeFile(notFoundFile, notFound.body);
      log(`prerender (not found) → ${relative(root, notFoundFile)}`);
      return;
    }

    if (pages.length === 0) return;
    await writePages(clientDir, pages, root, log);
    await writeFile(
      join(clientDir, ".vite", PRERENDER_LIST),
      JSON.stringify(pages.map((page) => page.path)),
    );
  } finally {
    await session?.dispose();
    await rm(runnerFile, { force: true });
    await rm(`${runnerFile}.map`, { force: true });
  }
}

/** Writes each page under `outDir` and logs it. */
async function writePages(
  outDir: string,
  pages: readonly Page[],
  root: string,
  log: (message: string) => void,
): Promise<void> {
  for (const page of pages) {
    const file = pageFile(outDir, page.path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, page.body);
    log(`prerender ${page.path} → ${relative(root, file)}`);
  }
}
