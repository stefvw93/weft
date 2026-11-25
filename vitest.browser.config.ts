import { fileURLToPath } from "node:url";
import { playwright } from "vite-plus/test/browser-playwright";
import type { ViteUserConfig } from "vite-plus/test/config";
import { weftDocs } from "./website/src/lib/docs-plugin";

/**
 * Vitest browser-mode configuration for end-to-end / real-browser tests.
 *
 * Kept separate from the default `vp test` (node/jsdom) run: this config only
 * picks up `*.browser.test.{ts,tsx}` files and executes them inside a real
 * Chromium instance driven by Playwright. The Playwright provider ships with
 * Vite+ (`vite-plus/test/browser-playwright`); only the `playwright` package and
 * its browser binaries are installed separately (`playwright install chromium`).
 *
 * Run via `vp run test:browser` (see root `vite.config.ts`).
 *
 * The config is authored as a typed object (rather than wrapped in
 * `defineConfig`) so the type-aware linter resolves `browser.provider` cleanly;
 * Vite+ accepts a default-exported config object directly.
 */
const config: ViteUserConfig = {
  // The website's browser tests import the real `App` → `virtual:weft-docs`;
  // this flat config does not inherit per-package plugins, so the docs loader
  // plugin is registered here too (inert for tests that never import the module).
  plugins: [weftDocs({ docsRoot: fileURLToPath(new URL("./docs", import.meta.url)) })],
  // The router-ssr and website document shells import `virtual:weft/assets`. The
  // real `weft()` plugin needs one app root, so the module is aliased to a stub
  // file here (see its header for why it must exist on disk).
  resolve: {
    alias: {
      "virtual:weft/assets": fileURLToPath(
        new URL("./packages/vite/src/__tests__/assets-stub.ts", import.meta.url),
      ),
    },
  },
  // The website shell renders the release tag via this build-time define.
  define: {
    __WEFT_VERSION__: JSON.stringify("browser-test"),
  },
  test: {
    include: ["**/*.browser.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright() as any, // cast as any because of tsgo quirk
      instances: [{ browser: "chromium" }],
    },
  },
};

export default config;
