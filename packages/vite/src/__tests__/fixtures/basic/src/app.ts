/** Fixture app: a small router def exercising static, streamed and not-found pages. */
import { Boundary, Component, h } from "@weftui/core";
import { Router } from "@weftui/router";
import { Effect } from "effect";
import { message } from "./message";

const layout = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* h.main([outlet]);
});

const Slow = () =>
  h.div([
    Boundary.suspend({ fallback: h.p("shell-fallback") }, [
      Effect.sleep("400 millis").pipe(Effect.as(h.p("slow-content"))),
    ]),
  ]);

const Broken = () => Effect.die(new Error("render boom"));

/** The sealed fixture router. */
export const App = Router.router(
  Router.layout({ component: layout }, [
    Router.route("", { component: () => h.h1(message) }),
    Router.route("about", { component: () => h.h1("About page") }),
    Router.route("slow", { component: Slow }),
    Router.route("broken", { component: Broken }),
  ]),
  { notFound: () => h.h1("404: not found") },
);
