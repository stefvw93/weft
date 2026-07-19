/**
 * Server entry: renders `<App/>` to hydratable HTML.
 *
 * `renderToStringHydratable` emits the `<!-- stream-start-N -->` /
 * `<!-- stream-end-N -->` markers around the reactive counter region that the
 * client `hydrate` needs to resume it flash-free.
 */

import { AppRpcClientTag } from "@weftui/core";
import { renderToStringHydratable } from "@weftui/dom/server";
import { Effect, Layer } from "effect";
import { App } from "./app";

// This example has no `Boundary.rpc`, but the SSR render fns require an
// `AppRpcClientTag` in context unconditionally, so discharge it with a no-op.
const NoRpc = Layer.succeed(AppRpcClientTag, {
  call: () => Effect.die(new Error("no rpc in this example")),
});

/** Renders the app to a hydratable HTML string. */
export const render = (): Promise<string> =>
  Effect.runPromise(Effect.provide(renderToStringHydratable(App({ initialValue: 3 })), NoRpc));
