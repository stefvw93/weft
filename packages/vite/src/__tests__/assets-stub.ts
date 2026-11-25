/**
 * Stand-in for `virtual:weft/assets` in the root browser test config, which has
 * no `weft()` plugin (the plugin needs one app root). It is a real file, not a
 * plugin-provided module, because Vite's dependency scan must be able to read
 * it from disk: a scan failure disables pre-bundling and reloads tests mid-run.
 */
import { h } from "@weftui/core";
import { Layer } from "effect";

/** Renders no tags: browser tests mount into their own container. */
export const ClientAssets = () => h.fragment([]);

/** Serves nothing. */
export const StaticAssets = Layer.empty;
