import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { Data } from "effect";
// The published types must name the `vite` peer dependency, not the workspace's
// `vite-plus` toolchain wrapper, so consumers resolve `Plugin` from their own Vite.
// oxlint-disable-next-line vite-plus/prefer-vite-plus-imports
import type { Plugin, ViteDevServer } from "vite";
import {
  ASSETS_ID,
  buildAssetsModule,
  CLIENT_DIR_PLACEHOLDER,
  DEV_HANDLER_ID,
  devAssetsModule,
  devHandlerModule,
  entryStyles,
  inertAssetsModule,
  type Manifest,
  PRERENDER_DECLARED_KEY,
  PRERENDER_ID,
  prerenderModule,
} from "./assets-module";
import { toWebRequest, type WebHandler, writeWebResponse } from "./node-bridge";
import { prerender, PRERENDER_LIST, PRERENDER_RUNNER } from "./prerender";

/**
 * Entry paths for {@link weft}, each resolved from the Vite root. Every field has
 * a conventional default, so `weft()` needs no options.
 */
export interface WeftOptions {
  /** Module whose default export is the app's routes Layer. Defaults to `src/entry-server.ts`. */
  readonly server?: string;
  /** Module that hydrates the app in the browser. Defaults to `src/entry-client.ts`. */
  readonly client?: string;
  /**
   * Production launcher, bundled by the server build and never run in dev.
   * Defaults to `src/main.ts`. Optional: when the file is absent the server build
   * emits the routes Layer only.
   */
  readonly main?: string;
  /**
   * What a build prerenders. `"server"` (default): routes that declare `prerender`,
   * served by `StaticAssets` beside the live routes. `"static"`: a full static
   * export in `dist/static`. Dev always renders live.
   */
  readonly output?: "server" | "static";
}

/** A required entry file does not exist. Thrown at startup. */
export class WeftEntryNotFoundError extends Data.TaggedError("WeftEntryNotFoundError")<{
  /** Which entry is missing; also the name of the {@link WeftOptions} field that overrides it. */
  readonly entry: "server" | "client";
  /** The absolute path that was looked up. */
  readonly path: string;
}> {
  override readonly message: string = `weft(): the ${this.entry} entry was not found at ${this.path}. Create it, or point the plugin elsewhere with weft({ ${this.entry}: "..." }).`;
}

/** The server entry's default export is not a Layer. Thrown on the first request. */
export class WeftServerEntryExportError extends Data.TaggedError("WeftServerEntryExportError")<{
  /** The absolute path of the server entry. */
  readonly path: string;
}> {
  override readonly message: string = `weft(): the default export of ${this.path} is not a Layer. Export the app's routes Layer as the default export, for example RouterServer.layer(App, { document }).`;
}

const SERVER_ENTRY = "src/entry-server.ts";
const CLIENT_ENTRY = "src/entry-client.ts";
const MAIN_ENTRY = "src/main.ts";
const CLIENT_OUT = "dist/client";
const SERVER_OUT = "dist/server";
const STATIC_OUT = "dist/static";

/** Rollup convention: a leading NUL marks an id as virtual so other plugins skip it. */
const virtual = (id: string): string => `\0${id}`;

/** A path as a URL-style, forward-slash string. */
const posix = (path: string): string => path.split(sep).join("/");

/** What the dev-handler module exports once evaluated in the app's module graph. */
interface DevHandlerModule {
  readonly isLayer: boolean;
  readonly create: () => { readonly handler: WebHandler; readonly dispose: () => Promise<void> };
}

/** The handler currently serving, tied to the module evaluation that produced it. */
interface Serving {
  readonly module: DevHandlerModule;
  readonly handler: WebHandler;
  readonly dispose: () => Promise<void>;
}

/** The part of a runnable dev environment the plugin uses. */
interface ModuleRunnerHost {
  readonly runner: { readonly import: (id: string) => Promise<unknown> };
}

/** Renders an error as the plain-text body of a dev 500 response. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const tag = (error as { readonly _tag?: unknown })._tag;
  const header = `${typeof tag === "string" ? tag : error.name}: ${error.message}`;
  return error.stack === undefined ? header : `${header}\n\n${error.stack}`;
}

/**
 * The Weft Vite plugin (spec: `weft-plugin.specs.md`). In dev it serves the server
 * entry's routes Layer through Vite, streaming and with HMR. In a build it emits
 * `dist/client` and `dist/server`. It also provides the `virtual:weft/assets` module.
 */
export function weft(options: WeftOptions = {}): Plugin {
  let root = process.cwd();
  let base = "/";
  let assetsDir = "assets";
  let isBuild = false;
  let log: (message: string) => void = () => {};
  /** File name of the emitted prerender runner, read from the server bundle. */
  let runnerFileName = `${PRERENDER_RUNNER}.js`;

  const serverEntry = (): string => resolve(root, options.server ?? SERVER_ENTRY);
  const clientEntry = (): string => resolve(root, options.client ?? CLIENT_ENTRY);
  const mainEntry = (): string => resolve(root, options.main ?? MAIN_ENTRY);
  /** The client entry relative to the root: its dev URL path and its manifest key. */
  const clientKey = (): string => posix(relative(root, clientEntry()));

  /**
   * Installs the dev middleware. One handler (one built Layer) serves every
   * request until the server entry is re-evaluated; the old Layer is then
   * disposed before the new one is created.
   */
  const serveInDev = (server: ViteDevServer): (() => void) => {
    let serving: Serving | undefined;
    // Requests resolve the handler one at a time, so a reload never builds two Layers.
    let turn: Promise<unknown> = Promise.resolve();

    const dispose = async (): Promise<void> => {
      const previous = serving;
      serving = undefined;
      await previous?.dispose();
    };

    const resolveHandler = async (): Promise<WebHandler> => {
      const environment = server.environments["ssr"] as unknown as ModuleRunnerHost;
      const module = (await environment.runner.import(DEV_HANDLER_ID)) as DevHandlerModule;
      if (serving?.module === module) return serving.handler;
      await dispose();
      if (!module.isLayer) throw new WeftServerEntryExportError({ path: serverEntry() });
      serving = { module, ...module.create() };
      return serving.handler;
    };

    const nextHandler = (): Promise<WebHandler> => {
      const next = turn.then(resolveHandler, resolveHandler);
      turn = next.catch(() => {});
      return next;
    };

    // `close` is the only point where Vite awaits teardown, so the Layer is released there.
    const close = server.close.bind(server);
    server.close = async () => {
      await turn;
      await dispose();
      await close();
    };

    // Returned as a post hook: Vite's own middlewares (module transforms, the HMR
    // client, `public/`) run first, and only what they pass on reaches the app.
    return () => {
      server.middlewares.use((req, res) => {
        void (async () => {
          try {
            const handler = await nextHandler();
            const url = (req as { originalUrl?: string }).originalUrl ?? req.url ?? "/";
            await writeWebResponse(res, await handler(toWebRequest(req, res, url)));
          } catch (error) {
            if (error instanceof Error) server.ssrFixStacktrace(error);
            if (res.headersSent) {
              res.end();
              return;
            }
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end(describeError(error));
          }
        })();
      });
    };
  };

  return {
    name: "weft",

    config(userConfig, { command }) {
      isBuild = command === "build";
      root = resolve(userConfig.root ?? process.cwd());
      const appEntry = existsSync(mainEntry()) ? mainEntry() : serverEntry();
      return {
        // The app answers every page request itself, including its own 404.
        appType: "custom",
        environments: {
          client: {
            build: {
              outDir: CLIENT_OUT,
              manifest: true,
              rolldownOptions: { input: clientEntry() },
            },
          },
          ssr: {
            build: {
              outDir: SERVER_OUT,
              // `public/` files belong to the client build only.
              copyPublicDir: false,
              rolldownOptions: {
                input: {
                  // Keyed by the entry's own name, so the output file name is unchanged.
                  [basename(appEntry, extname(appEntry))]: appEntry,
                  // A build-time helper that shares the app's chunks; removed after prerendering.
                  [PRERENDER_RUNNER]: PRERENDER_ID,
                },
              },
            },
          },
        },
        builder: {
          // Client first: the server build reads the client manifest.
          async buildApp(builder) {
            await builder.build(builder.environments["client"]!);
            await builder.build(builder.environments["ssr"]!);
            await prerender({
              output: options.output ?? "server",
              clientDir: join(root, CLIENT_OUT),
              staticDir: join(root, STATIC_OUT),
              runnerFile: join(root, SERVER_OUT, runnerFileName),
              declaredKey: PRERENDER_DECLARED_KEY,
              root,
              log,
            });
          },
        },
      };
    },

    configResolved(config) {
      root = config.root;
      base = config.base;
      assetsDir = config.build.assetsDir;
      log = (message) => config.logger.info(`[weft] ${message}`);
      if (!existsSync(serverEntry())) {
        throw new WeftEntryNotFoundError({ entry: "server", path: serverEntry() });
      }
      if (!existsSync(clientEntry())) {
        throw new WeftEntryNotFoundError({ entry: "client", path: clientEntry() });
      }
    },

    resolveId(id) {
      return id === ASSETS_ID || id === DEV_HANDLER_ID || id === PRERENDER_ID
        ? virtual(id)
        : undefined;
    },

    load(id) {
      if (id === virtual(DEV_HANDLER_ID)) return devHandlerModule(posix(serverEntry()));
      if (id === virtual(PRERENDER_ID)) return prerenderModule(posix(serverEntry()));
      if (id !== virtual(ASSETS_ID)) return undefined;
      if (!isBuild) return devAssetsModule(base, clientKey());
      // Only the server build renders the document shell.
      if (this.environment.name !== "ssr") return inertAssetsModule();

      const manifestPath = join(root, CLIENT_OUT, ".vite/manifest.json");
      if (!existsSync(manifestPath)) {
        throw new Error(
          `weft(): no client manifest at ${manifestPath}. The server build reads it, so build the client first (a plain \`vite build\` runs both in order).`,
        );
      }
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
      const entry = manifest[clientKey()];
      if (entry === undefined) {
        throw new Error(
          `weft(): the client manifest at ${manifestPath} has no entry for ${clientKey()}.`,
        );
      }
      return buildAssetsModule({
        base,
        assetsDir,
        entry,
        styles: entryStyles(manifest, clientKey()),
        prerenderList: PRERENDER_LIST,
      });
    },

    renderChunk(code, chunk) {
      if (!code.includes(CLIENT_DIR_PLACEHOLDER)) return null;
      // The assets module can land in any chunk, so the path to the client
      // directory is fixed up relative to the chunk that ended up holding it.
      const chunkDir = dirname(join(root, SERVER_OUT, chunk.fileName));
      const clientDir = posix(relative(chunkDir, join(root, CLIENT_OUT))) || ".";
      // `map: null` keeps the chunk's existing source map (only this one line shifts).
      return { code: code.replaceAll(CLIENT_DIR_PLACEHOLDER, `${clientDir}/`), map: null };
    },

    writeBundle(_options, bundle) {
      // The runner's file name follows the build's own entry naming, so it is read
      // from the bundle, not assumed.
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && chunk.isEntry && chunk.name === PRERENDER_RUNNER) {
          runnerFileName = chunk.fileName;
        }
      }
    },

    configureServer(server) {
      return serveInDev(server);
    },
  };
}
