// In your own app this is `import { weft } from "@weftui/vite"`. Inside this
// monorepo the config imports the plugin source: the task runner loads every
// `vite.config.ts` before any package is packed, so the built entry may not exist yet.
import { weft } from "../../packages/vite/src/index";
import { defineConfig } from "vite-plus";

const weftPacks = ["@weftui/core#pack", "@weftui/dom#pack", "@weftui/router#pack"];

export default defineConfig({
  // `weft()` serves `src/entry-server.ts` in dev and builds `dist/client` + `dist/server`.
  plugins: [weft()],
  server: { port: 3200 },
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
      start: {
        command: "node dist/server/main.js",
        dependsOn: ["build"],
      },
    },
  },
});
