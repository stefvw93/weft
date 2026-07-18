import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  run: {
    tasks: {
      dev: {
        command: "vp run -r dev",
      },
      "bundle-docs": {
        command: "node scripts/bundle-package-docs.mjs",
      },
      pack: {
        command: "vp run -r pack",
        dependsOn: ["bundle-docs"],
      },
      check: {
        command: "vp check",
        dependsOn: ["pack"],
      },
      test: {
        command: "vp test",
        dependsOn: ["pack"],
      },
      "test:browser": {
        command: "vp test --config vitest.browser.config.ts",
        dependsOn: ["pack"],
      },
      "test:types": {
        command: "tstyche",
        dependsOn: ["pack"],
      },
    },
  },
  // Each Vitest project runs under its own package's vite config, so
  // package-specific settings (defines, plugins like the website's `weftDocs`,
  // `~` alias resolution) apply to that package's tests without hoisting
  // anything to this root config.
  test: {
    projects: ["packages/*", "website"],
  },
  fmt: {
    ignorePatterns: ["**/dist/**", "*.min.js", "**/.claude/**", "graphify-out"],
  },
  lint: {
    ignorePatterns: ["**/dist/**", "*.min.js", "**/.claude/**", "graphify-out"],
    plugins: ["typescript", "unicorn", "oxc"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    categories: {
      correctness: "error",
    },
    rules: {
      "typescript/no-floating-promises": [
        "error",
        {
          ignoreVoid: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["*.test.{ts,tsx}"],
        rules: {
          "typescript/no-floating-promises": "off",
        },
      },
    ],
    env: {
      builtin: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
});
