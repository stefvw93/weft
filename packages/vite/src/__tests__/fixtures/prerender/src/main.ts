/** Production launcher: never run in dev. Serves the routes Layer plus the built client files. */
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter } from "effect/http";
import { createServer } from "node:http";
import { StaticAssets } from "virtual:weft/assets";
import routes from "./entry-server";

(globalThis as { __weftFixtureMainRan?: boolean }).__weftFixtureMainRan = true;

const Server = HttpRouter.serve(Layer.mergeAll(routes, StaticAssets)).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: Number(process.env.PORT ?? 3000) })),
);

NodeRuntime.runMain(Layer.launch(Server));
