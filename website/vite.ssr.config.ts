/**
 * Server build config: bundles the SSR entry into `dist/server`.
 *
 * `build.ssr` points at `src/entry-server.ts` so Vite builds a Node-targeted bundle
 * (externalizing deps, no asset hashing). The prod `server.ts` imports
 * `dist/server/entry-server.js` and calls its `makeHandler`. Kept separate from
 * `vite.config.ts` so the client and server builds emit to distinct `outDir`s
 * without clobbering each other's manifest.
 */

import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";
import { weftDocs } from "./src/lib/docs-plugin";
import { latestReleaseTag } from "./build-version";

// Same baked doc model as the client build, so server and client trees stay identical.
const docsRoot = fileURLToPath(new URL("../docs", import.meta.url));

export default defineConfig({
  // Must match the client config's base so the SSR bundle's import.meta.env.BASE_URL
  // (→ SITE_BASE) agrees with the client build. See prerender.specs.md.
  base: process.env.SITE_BASE || "/",
  define: {
    __WEFT_VERSION__: JSON.stringify(latestReleaseTag()),
  },
  // `tailwindcss` must run in the SSR build too: `app.ts` imports `app.css`, whose
  // `@import "tailwindcss"` the plugin intercepts (otherwise postcss-import tries to
  // resolve it as a file and fails).
  plugins: [tailwindcss(), weftDocs({ docsRoot })],
  build: {
    ssr: "src/entry-server.ts",
    outDir: "dist/server",
    // Don't wipe dist/client (built by vite.config.ts) when emitting the server bundle.
    emptyOutDir: true,
  },
});
