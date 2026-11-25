/** Client entry: hydrates the server-rendered markup in `#root`. */
import { WeftApp } from "@weftui/dom/client";
import { RouterApp, RouterLive } from "@weftui/router/client";
import { Effect } from "effect";
import { App } from "./app";
import "./style.css";

const root = document.getElementById("root")!;
const app = WeftApp.make(RouterLive(App));
void Effect.runPromise(WeftApp.hydrate(app, RouterApp(App), root));
