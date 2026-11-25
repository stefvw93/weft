/** Server entry: the default export is the app's fully provided routes Layer. */
import { RouterServer } from "@weftui/router/server";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { App } from "./app";
import { documentShell } from "./document";

/** Counters the tests read to observe Layer lifetimes across reloads. */
interface Probe {
  acquired: number;
  released: number;
}
const probe = ((globalThis as { __weftFixtureProbe?: Probe }).__weftFixtureProbe ??= {
  acquired: 0,
  released: 0,
});

const Lifecycle = Layer.effectDiscard(
  Effect.acquireRelease(
    Effect.sync(() => {
      probe.acquired += 1;
    }),
    () =>
      Effect.sync(() => {
        probe.released += 1;
      }),
  ),
);

const Api = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/api/info",
    HttpServerResponse.json({ ok: true }).pipe(
      Effect.map(HttpServerResponse.setHeader("x-fixture", "info")),
    ),
  ),
  HttpRouter.add("POST", "/api/echo", (request: HttpServerRequest.HttpServerRequest) =>
    Effect.map(request.text, (body) => HttpServerResponse.text(`echo:${body}`, { status: 201 })),
  ),
);

export default Layer.mergeAll(RouterServer.layer(App, { document: documentShell }), Api, Lifecycle);
