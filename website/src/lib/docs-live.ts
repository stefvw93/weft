/**
 * The build-time-backed `Docs` service layer.
 *
 * Isolated in its own module because it imports the `virtual:weft-docs` module the
 * loader plugin emits: kept out of `docs-service.ts` so that module (and the fixture
 * `makeDocs`) stays importable under the node test runner. `DocsLive` is provided into
 * the render tree through the router's render-time `context` seam: at the server entry
 * (`entry-server.ts` → `RouterServer.render`) and the client entry (`entry-client.ts` →
 * `RouterLive`); tests provide a fixture `Docs` layer (`Layer.succeed(Docs, makeDocs(...))`)
 * instead.
 */

import { getAllMeta, loadDocTree } from "virtual:weft-docs";
import { Layer } from "effect";
import { Docs, type DocsService, makeDocs } from "./docs-service";

/** The documentation model: metadata baked at build time, trees lazily fetched per doc. */
export const liveDocs: DocsService = makeDocs(getAllMeta(), loadDocTree);

/** The `Docs` service layer over the build-time model, for the render-time `context` seam. */
export const DocsLive: Layer.Layer<Docs> = Layer.succeed(Docs, liveDocs);
