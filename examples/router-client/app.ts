/**
 * Client-only routing with `@weftui/router`: no server, no SSR, no rpc.
 *
 * The whole app is a sealed `Router.router(...)` tree mounted with
 * `WeftApp.mount` (see `main.ts`). It demonstrates the client-side surface on
 * its own:
 *
 * - **Link interception**: plain `h.a({ href })` anchors to `href(...)`-built
 *   URLs navigate via the History API, no full page load.
 * - **Layout persistence**: the {@link Shell} layout (header + nav) stays
 *   mounted across navigations; only the outlet swaps.
 * - **Path params**: `/users/:id` decodes `:id` with `Schema.NumberFromString`
 *   into typed handler-arg props; unknown ids raise `notFound()`.
 * - **Reactive query params**: `/users?sort=` is read with
 *   `Router.queryStream`, so a query-only navigation re-sorts the list in
 *   place while the leaf stays mounted.
 *
 * `app.ts` is side-effect-free: it exports {@link App} and the leaf route refs
 * so `main.ts` and the browser test can mount it themselves.
 */

import { Component, h, Subscribable } from "@weftui/core";
import { href, notFound, Router, type RouteNode } from "@weftui/router";
import { Schema, Stream } from "effect";

interface User {
  readonly id: number;
  readonly name: string;
  readonly role: string;
}

/** The in-memory "database": client-only, so plain module data. */
const USERS: readonly User[] = [
  { id: 1, name: "Ada", role: "engineer" },
  { id: 2, name: "Grace", role: "admiral" },
  { id: 3, name: "Linus", role: "maintainer" },
];

/** Shared `:id` path-param schema: decodes the string segment to a number. */
const idParam = { id: Schema.NumberFromString };

/** `?sort=` query schema: optional, so `href(usersRoute)` needs no args. */
const sortQuery = { sort: Schema.optional(Schema.Literals(["asc", "desc"])) };

/** Sorts by name; no `?sort=` keeps catalog order. */
const sortUsers = (sort: "asc" | "desc" | undefined): readonly User[] => {
  if (sort === undefined) return USERS;
  const byName = [...USERS].sort((a, b) => a.name.localeCompare(b.name));
  return sort === "asc" ? byName : byName.reverse();
};

/** `/users/:id`: typed handler-arg props; unknown ids 404 via `notFound()`. */
export const userRoute = Router.route("users/:id", {
  path: idParam,
  component: ({ path }) => {
    const user = USERS.find((candidate) => candidate.id === path.id);
    if (user === undefined) return notFound(`/users/${path.id}`);
    return h.section({ id: "page" }, [
      h.h2(user.name),
      h.p({ id: "user-role" }, `#${user.id}: ${user.role}`),
      h.p([h.a({ href: href(usersRoute) }, "← All users")]),
    ]);
  },
});

/**
 * `/users`: reads `?sort=` reactively, so re-sorting swaps the list in place.
 *
 * The explicit `RouteNode` annotation breaks the inference cycle created by the
 * sort links: they `href(usersRoute, …)` back to this very route, so its type
 * must be stated rather than inferred from a body that references it.
 */
export const usersRoute: RouteNode<{}, typeof sortQuery, never, Router> = Router.route("users", {
  query: sortQuery,
  component: Component.gen(function* () {
    const query = yield* Router.queryStream(sortQuery);
    return yield* h.section({ id: "page" }, [
      h.h2("Users"),
      h.p({ class: "sort" }, [
        "sort: ",
        h.a({ href: href(usersRoute, { query: { sort: "asc" } }) }, "asc"),
        " · ",
        h.a({ href: href(usersRoute, { query: { sort: "desc" } }) }, "desc"),
      ]),
      Stream.map(Subscribable.changes(query), ({ sort }) =>
        h.ul(
          { id: "user-list", "data-sort": sort ?? "none" },
          sortUsers(sort).map((user) =>
            h.li([h.a({ href: href(userRoute, { path: { id: user.id } }) }, user.name)]),
          ),
        ),
      ),
    ]);
  }),
});

/** `/`: static landing page. */
export const homeRoute = Router.route("", {
  component: Component.make(() =>
    h.section({ id: "page" }, [
      h.h2("Home"),
      h.p("A client-only SPA: every navigation happens through the History API."),
      h.p([h.a({ href: href(usersRoute) }, "Browse users →")]),
    ]),
  ),
});

/** Persistent chrome: header + nav around the routed outlet. */
const Shell = Component.gen(function* () {
  const outlet = yield* Router.Outlet;
  return yield* h.div({ id: "app" }, [
    h.header({ id: "shell-header" }, [
      h.strong("router-client"),
      h.nav([
        h.a({ href: href(homeRoute) }, "Home"),
        " · ",
        h.a({ href: href(usersRoute) }, "Users"),
      ]),
    ]),
    h.main([outlet]),
  ]);
});

/** The sealed client-only router app. */
export const App = Router.router(
  Router.layout({ component: Shell }, [homeRoute, usersRoute, userRoute]),
  { notFound: () => h.section({ id: "page" }, [h.h2("404: page not found")]) },
);
