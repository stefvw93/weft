/**
 * Production launcher: `node dist/server/main.js` after `vp run build`.
 *
 * Merges the app's routes Layer with `StaticAssets` (the built client files in
 * `dist/client`) and serves both on Node through Effect's `HttpRouter.serve`.
 * `NodeHttpServer.layer` supplies the HTTP server and the file services
 * `StaticAssets` needs. Never executed in dev: there Vite owns the HTTP server.
 */

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter } from "effect/http";
import { createServer } from "node:http";
import { StaticAssets } from "virtual:weft/assets";
import routes from "./entry-server";

const port = Number(process.env.PORT ?? 3200);

const Server = HttpRouter.serve(Layer.mergeAll(routes, StaticAssets)).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port })),
);

NodeRuntime.runMain(Layer.launch(Server));
