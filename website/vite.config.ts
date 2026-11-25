/**
 * Website config: one config for dev and the static build.
 *
 * The `weft()` plugin serves `src/entry-server.ts` in dev, and with
 * `output: "static"` a single `vp build` emits the client bundle, the server
 * bundle, and the prerendered site in `dist/static` (the directory the deploy
 * workflow publishes).
 */

import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";
// An app would `import { weft } from "@weftui/vite"`. Inside this monorepo the
// config imports the plugin source: the task runner loads every `vite.config.ts`
// before any package is packed, so the built entry may not exist yet.
import { weft } from "../packages/vite/src/index";
import { latestReleaseTag } from "./build-version";
import { weftDocs } from "./src/lib/docs-plugin";

const weftPacks = ["@weftui/core#pack", "@weftui/dom#pack", "@weftui/router#pack"];

// Repo `docs/` sits one level above `website/`; the markdown loader bakes it at build time.
const docsRoot = fileURLToPath(new URL("../docs", import.meta.url));

export default defineConfig({
  define: {
    __WEFT_VERSION__: JSON.stringify(latestReleaseTag()),
  },
  plugins: [tailwindcss(), weftDocs({ docsRoot }), weft({ output: "static" })],
  server: { port: 3000 },
  // Node/jsdom tests for this package (run as a Vitest project from the root
  // config). Browser e2e tests are excluded here and run via the root
  // `vitest.browser.config.ts` instead.
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/*.browser.test.{ts,tsx}"],
  },
  run: {
    tasks: {
      dev: {
        command: "vp dev",
        dependsOn: weftPacks,
      },
      build: {
        command: "vp build",
        dependsOn: weftPacks,
      },
      // The deploy workflow's entry point. The static site is part of every build.
      "build:static": {
        command: "echo website built to dist/static",
        dependsOn: ["build"],
      },
    },
  },
});
