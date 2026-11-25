/** Fixture app for prerendering: flagged, auto-discovered, param and streamed routes. */
import { Boundary, Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { Context, Effect, Schema } from "effect";
import { extraRoutes } from "./extra-routes";

/** The service the docs route enumerates its pages from. */
export class Docs extends Context.Service<Docs, { readonly slugs: readonly string[] }>()(
  "fixture/Docs",
) {}

/**
 * "build" while the tests prerender, "runtime" in the spawned server and in dev.
 * Lets a test tell a prerendered file from a live render of the same route.
 */
const phase = (): string =>
  typeof process === "undefined" ? "client" : (process.env["WEFT_FIXTURE_PHASE"] ?? "runtime");

const layout = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* h.main([outlet]);
});

const Slow = () =>
  h.div([
    Boundary.suspend({ fallback: h.p("shell-fallback") }, [
      Effect.sleep("200 millis").pipe(Effect.as(h.p("slow-content"))),
    ]),
  ]);

/** The sealed fixture router. */
export const App = Router.router(
  Router.layout({ component: layout }, [
    Router.route("", { component: () => h.h1(`home phase:${phase()}`), prerender: true }),
    Router.route("about", { component: () => h.h1(`about phase:${phase()}`) }),
    Router.route("slow", { component: Slow, prerender: true }),
    Router.route("docs/:slug", {
      path: { slug: Schema.String },
      component: ({ path }) => h.h1(`doc ${path.slug} phase:${phase()}`),
      prerender: Effect.map(Docs, (docs) => docs.slugs.map((slug) => ({ slug }))),
    }),
    ...extraRoutes,
  ]),
  { notFound: () => h.h1("404: not found") },
);
