/**
 * Website config: dev/prod SSR server task + client build.
 *
 * `build` here produces the browser bundle (hashed assets + `.vite/manifest.json`)
 * into `dist/client`; the server bundle is built separately by `vite.ssr.config.ts`.
 * The `dev` task runs the universal `server.ts` (Vite middleware mode) via `tsx`,
 * and `build`/`start` cover the production flow.
 */

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import { weftDocs } from "./src/lib/docs-plugin";
import { latestReleaseTag } from "./build-version";

const weftPacks = ["@weftui/core#pack", "@weftui/dom#pack", "@weftui/router#pack"];

// Repo `docs/` sits one level above `website/`; the markdown loader bakes it at build time.
const docsRoot = fileURLToPath(new URL("../docs", import.meta.url));

export default defineConfig({
  // Subpath deployments (GitHub Pages serves at /<repo>/) set SITE_BASE=/weft/;
  // dev and the root-served SSR flow leave it unset. See prerender.specs.md.
  base: process.env.SITE_BASE || "/",
  define: {
    __WEFT_VERSION__: JSON.stringify(latestReleaseTag()),
  },
  plugins: [tailwindcss(), weftDocs({ docsRoot })],
  // Node/jsdom tests for this package (run as a Vitest project from the root
  // config). Browser e2e tests are excluded here and run via the root
  // `vitest.browser.config.ts` instead.
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/*.browser.test.{ts,tsx}"],
  },
  build: {
    manifest: true,
    outDir: "dist/client",
    rollupOptions: {
      input: "src/entry-client.ts",
    },
  },
  run: {
    tasks: {
      dev: {
        command: "tsx server.ts",
        dependsOn: weftPacks,
      },
      // `env`: vp tasks run in a clean environment, so SITE_BASE (the subpath
      // deployment base, see prerender.specs.md) must be declared to reach the
      // task — and declaring it also fingerprints the cache, so a base change
      // rebuilds instead of reusing stale root-base bundles.
      "build:client": {
        command: "vp build",
        dependsOn: weftPacks,
        env: ["SITE_BASE"],
      },
      "build:server": {
        command: "vp build --config vite.ssr.config.ts",
        dependsOn: weftPacks,
        env: ["SITE_BASE"],
      },
      build: {
        command: "echo website built",
        dependsOn: ["build:client", "build:server"],
      },
      "build:static": {
        command: "tsx prerender.ts",
        dependsOn: ["build"],
        env: ["SITE_BASE"],
      },
      start: {
        command: "NODE_ENV=production node server.ts",
        dependsOn: ["build"],
      },
    },
  },
});
