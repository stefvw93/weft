/** Server entry: the routes Layer, with the `Docs` service its prerender Effect reads. */
import { RouterServer } from "@weftui/router/server";
import { Layer } from "effect";
import { App, Docs } from "./app";
import { documentShell } from "./document";

const DocsLive = Layer.succeed(Docs, { slugs: ["intro", "guide"] });

export default RouterServer.layer(App, { document: documentShell }).pipe(Layer.provide(DocsLive));
