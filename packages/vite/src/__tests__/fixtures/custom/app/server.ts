/** Server entry at a non-conventional path, selected with `weft({ server })`. No `main` beside it. */
import { Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

export default Layer.mergeAll(HttpRouter.add("GET", "/", HttpServerResponse.text("custom-server")));
