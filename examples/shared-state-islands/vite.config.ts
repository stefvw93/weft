import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      dev: {
        command: "vp dev",
        dependsOn: ["@weftui/core#pack", "@weftui/dom#pack"],
      },
    },
  },
});
