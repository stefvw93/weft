/**
 * Server entry: renders `<App/>` to a true streaming HTTP response.
 *
 * `renderToStreamHydratable` emits each `<Suspense>` boundary's fallback
 * inline (between `<!-- suspense-start-N -->` / `<!-- suspense-end-N -->`
 * markers), then appends a `<template>` + self-removing `<script>` patch as
 * each boundary's children resolve. The browser executes those scripts before
 * `hydrate()` runs, so the page is already in its resolved state by the time
 * the client JS loads.
 *
 * Because the Effect Stream is piped directly to the HTTP response (rather
 * than collected into a string first), the browser receives the shell HTML
 * immediately and renders the fallback UI while the async cards load. Patches
 * arrive as each Suspense boundary resolves, triggering the inline scripts
 * that swap in the resolved content, visible with `curl -N`.
 */

import { AppRpcClientTag } from "@weftui/core";
import { renderToStreamHydratable } from "@weftui/dom/server";
import { Effect, Layer, Stream } from "effect";
import { App } from "./app";

// This example has no `Boundary.rpc`, but the SSR render fns require an
// `AppRpcClientTag` in context unconditionally, so discharge it with a no-op.
const NoRpc = Layer.succeed(AppRpcClientTag, {
  call: () => Effect.die(new Error("no rpc in this example")),
});

/** Returns the live Effect Stream of HTML chunks. */
export const renderStream = (): Stream.Stream<string, Error> =>
  Stream.provide(renderToStreamHydratable(App()), NoRpc);
