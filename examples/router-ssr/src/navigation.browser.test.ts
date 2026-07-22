/**
 * End-to-end browser test for the router's programmatic client-navigation surface
 * (`@weftui/router/client`): `navigate(ref, args)`, `push` / `replace`,
 * `back` / `forward`, and the reactive `Router.queryStream` accessor driven by
 * `patchQuery` / `setQuery`.
 *
 * It mounts a small local router tree in a real browser with the History-API
 * `Router` and drives navigation **programmatically** (not via link clicks),
 * asserting: pushed entries are reachable by `back`/`forward`, `replace` does not
 * add a history entry, and a query-only change re-renders a `queryStream` reader
 * **in place** (same leaf, same DOM node), where a snapshot `Router.query` would
 * not update.
 */

import { Component, h, Subscribable } from "@weftui/core";
import { WeftApp } from "@weftui/dom/client";
import type { RouterDef } from "@weftui/router";
import {
  back,
  forward,
  navigate,
  patchQuery,
  push,
  replace,
  Router,
  RouterApp,
  RouterLive,
} from "@weftui/router/client";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Effect, Schema, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/** Minimal rpc group: this local tree has no `Boundary.rpc`, but `rpc` is required. */
const NoopRpcs = RpcGroup.make(Rpc.make("Noop", { payload: Schema.Void, success: Schema.Void }));

const tabQuery = { tab: Schema.optional(Schema.String) };

/** `/`: a static home page. */
const homeRoute = Router.route("", {
  component: Component.make(() => h.div([h.span({ id: "home" }, "home")])),
});

/** `/search`: reads `?tab=` reactively via `Router.queryStream` (updates in place). */
const searchRoute = Router.route("search", {
  query: tabQuery,
  component: Component.gen(function* () {
    const q = yield* Router.queryStream(tabQuery);
    return yield* h.div([
      h.span({ id: "tab" }, [Stream.map(Subscribable.changes(q), (x) => x.tab ?? "none")]),
    ]);
  }),
});

const def: RouterDef = Router.router(
  Router.layout(
    {
      component: Component.gen(function* () {
        const outlet = yield* Router.Outlet;
        return yield* h.div({ id: "app" }, [outlet]);
      }),
    },
    [homeRoute, searchRoute],
  ),
  { notFound: () => h.h2({ id: "nf" }, "404") },
);

let container: HTMLElement;
let app: WeftApp.WeftApp<Router> | undefined;

beforeEach(() => {
  container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
});

afterEach(async () => {
  if (app !== undefined) await Effect.runPromise(WeftApp.dispose(app));
  container.remove();
  window.history.replaceState(null, "", "/");
});

const mountAt = async (path: string): Promise<void> => {
  window.history.replaceState(null, "", path);
  app = WeftApp.make(RouterLive(def, { rpc: { group: NoopRpcs } }));
  await Effect.runPromise(WeftApp.mount(app, RouterApp(def), container));
};

/** Waits until the `#tab` reactive reader shows `value`. */
const waitForTab = (value: string): Promise<void> =>
  vi.waitFor(() => expect(container.querySelector("#tab")?.textContent).toBe(value));

/** Waits until the home page is rendered. */
const waitForHome = (): Promise<void> =>
  vi.waitFor(() => expect(container.querySelector("#home")).not.toBeNull());

describe("router programmatic navigation", () => {
  it("navigate(ref, args) and back/forward step through history", async () => {
    await mountAt("/");
    await waitForHome();

    // Programmatic navigation to the search route with a typed query arg.
    await app!.runtime.runPromise(navigate(searchRoute, { query: { tab: "x" } }));
    await waitForTab("x");

    // Back → home; forward → search again (popstate resyncs the router).
    await app!.runtime.runPromise(back());
    await waitForHome();

    await app!.runtime.runPromise(forward());
    await waitForTab("x");
  });

  it("replace does not add a history entry", async () => {
    await mountAt("/");
    await waitForHome();

    await app!.runtime.runPromise(push("/search?tab=1"));
    await waitForTab("1");

    // Replace the current (tab=1) entry; back must now skip it and land on home.
    await app!.runtime.runPromise(replace("/search?tab=2"));
    await waitForTab("2");

    await app!.runtime.runPromise(back());
    await waitForHome();
  });

  it("patchQuery re-renders a queryStream reader in place (same leaf node)", async () => {
    await mountAt("/search?tab=a");
    await waitForTab("a");
    const tabEl = container.querySelector("#tab");
    expect(tabEl).not.toBeNull();

    // Query-only change: the leaf stays mounted, the reactive reader updates.
    await app!.runtime.runPromise(patchQuery({ tab: "b" }));
    await waitForTab("b");

    // Same DOM node, so no remount, just a reactive text update.
    expect(container.querySelector("#tab")).toBe(tabEl);
  });
});
