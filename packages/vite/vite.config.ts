import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      pack: {
        command: "vp pack",
        output: ["dist/**"],
      },
    },
  },
  pack: {
    entry: ["src/index.ts"],
    outDir: "dist",
    dts: true,
    platform: "neutral",
    minify: true,
    deps: {
      // `node:` builtins are named explicitly: the neutral platform does not know them.
      neverBundle: ["effect", /^@weftui\//, "vite", "vite-plus", /^node:/],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
