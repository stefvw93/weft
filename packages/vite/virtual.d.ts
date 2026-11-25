/**
 * Types for the module the `weft()` Vite plugin provides. Enable them with
 * `/// <reference types="@weftui/vite/virtual" />`.
 */
declare module "virtual:weft/assets" {
  import type { Node } from "@weftui/core";
  import type { FileSystem, Layer, Path, PlatformError } from "effect";
  import type { HttpPlatform, HttpRouter } from "effect/http";

  /**
   * The head tags that load the client: place it in the document shell's `<head>`.
   * In dev it renders Vite's client and the client entry source. In a build it
   * renders the hashed client entry and a stylesheet link per CSS file.
   */
  export const ClientAssets: () => Node<never, never>;

  /**
   * Mounts the built client files (`dist/client`) on the ambient `HttpRouter`, for
   * the production launcher. The app's platform Layer supplies the file services.
   * In dev it registers nothing, since Vite serves the files.
   */
  export const StaticAssets: Layer.Layer<
    never,
    PlatformError.PlatformError,
    HttpRouter.HttpRouter | FileSystem.FileSystem | Path.Path | HttpPlatform.HttpPlatform
  >;
}
