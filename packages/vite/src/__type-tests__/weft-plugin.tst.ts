import { expect, test } from "tstyche";
import type { Node } from "@weftui/core";
import type { FileSystem, Layer, Path, PlatformError } from "effect";
import type { HttpPlatform, HttpRouter } from "effect/http";
// oxlint-disable-next-line vite-plus/prefer-vite-plus-imports
import type { Plugin } from "vite";
import { ClientAssets, StaticAssets } from "virtual:weft/assets";
import { weft, WeftEntryNotFoundError, WeftServerEntryExportError } from "~/index";

// Spec: `src/weft-plugin.specs.md` (V1, V2, V3, V4, V14, V17, V20).

test("V1/V2: weft() takes optional entry overrides and returns a Vite plugin", () => {
  expect(weft()).type.toBe<Plugin>();
  expect(weft({})).type.toBe<Plugin>();
  expect(
    weft({ server: "app/server.ts", client: "app/client.ts", main: "app/main.ts" }),
  ).type.toBe<Plugin>();
});

test("V2: entry overrides are path strings and unknown options are rejected", () => {
  expect(weft).type.not.toBeCallableWith({ server: 1 });
  expect(weft).type.not.toBeCallableWith({ entry: "src/entry-server.ts" });
});

test("V3: WeftEntryNotFoundError names the missing entry and the looked-up path", () => {
  const error = new WeftEntryNotFoundError({ entry: "server", path: "/app/src/entry-server.ts" });
  expect(error._tag).type.toBe<"WeftEntryNotFoundError">();
  expect(error.entry).type.toBe<"server" | "client">();
  expect(error.path).type.toBe<string>();

  // `main` is optional, so it can never be reported as missing.
  expect(WeftEntryNotFoundError).type.not.toBeConstructableWith({
    entry: "main",
    path: "/app/src/main.ts",
  });
});

test("V4: WeftServerEntryExportError carries the server entry path", () => {
  const error = new WeftServerEntryExportError({ path: "/app/src/entry-server.ts" });
  expect(error._tag).type.toBe<"WeftServerEntryExportError">();
  expect(error.path).type.toBe<string>();
});

test("V14/V20: the virtual module resolves and ClientAssets is a no-argument component", () => {
  expect(ClientAssets).type.toBe<() => Node<never, never>>();
  expect(ClientAssets).type.not.toBeCallableWith({ entry: "/src/entry-client.ts" });
});

test("V17: StaticAssets matches the requirements of Effect's static file Layer", () => {
  expect(StaticAssets).type.toBe<
    Layer.Layer<
      never,
      PlatformError.PlatformError,
      HttpRouter.HttpRouter | FileSystem.FileSystem | Path.Path | HttpPlatform.HttpPlatform
    >
  >();
});
