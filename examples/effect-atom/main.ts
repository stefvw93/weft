import { WeftApp } from "@weftui/dom/client";
import { Effect } from "effect";
import { AtomRegistry } from "effect/unstable/reactivity";
import { App } from "./app";

// Lifetime rule: the atom registry must outlive initial render — atom
// subscriptions are forked fibers that read it for the app's whole lifetime.
//
// `AtomRegistry.layer` is a *scoped* layer, and the app runtime owns it: it is
// built lazily on the first mount and released only at `WeftApp.dispose`, so it
// lives for the app's lifetime with no manual scope management.
const app = WeftApp.make(AtomRegistry.layer);
void Effect.runPromise(WeftApp.mount(app, App(), document.getElementById("root")!));
