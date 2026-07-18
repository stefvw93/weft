/**
 * Type tests for `Router.lazy` (spec: `lazy-component.specs.md`).
 *
 * A lazy component must be a drop-in for an eager one at the type level: its resolved
 * `E`/`R` channels propagate up the tree identically (AC-T1), an unmet requirement is a
 * compile error (AC-T2), and the descriptor stays eager so `href` is unaffected (AC6).
 */

import { expect, test } from "tstyche";
import { Component, h } from "@weftui/core";
import type { Node } from "@weftui/core";
import { Context, Schema } from "effect";
import { href, Router, RouterApp, RouterParamsError } from "~/index";

/** A service a page may require — used to assert requirement propagation. */
class Theme extends Context.Service<Theme, string>()("@test/Theme") {}

/** A passthrough layout so a single leaf can be sealed into a router. */
const passthrough = Router.layout(
  {
    component: Component.gen(function* () {
      const outlet = yield* Router.Outlet;
      return yield* outlet;
    }),
  },
  [
    Router.route("themed/:id", {
      path: { id: Schema.NumberFromString },
      // A lazy component that reads the live params (adds `RouterParamsError` to E) and a
      // service (`Theme` in R) — exactly what the eager form of this page would carry.
      component: Router.lazy(() =>
        Promise.resolve(
          Component.gen(function* () {
            const { id } = yield* Router.params({ id: Schema.NumberFromString });
            const theme = yield* Theme;
            return yield* h.div({}, `${id}${theme}`);
          }),
        ),
      ),
    }),
  ],
);

const themedRouter = Router.router(passthrough, { notFound: () => h.h1({}, "404") });

// ── AC-T1: the lazy component's E/R propagate up to the sealed app node ────────

test("AC-T1: the lazy component's E/R propagate up to the sealed app node", () => {
  // Should compile — `RouterParamsError` on E, `Theme | Router` on R, same as eager.
  expect(RouterApp(themedRouter)).type.toBe<Node<RouterParamsError, Theme | Router>>();

  // AC-T2: the lazy component requires `Theme`, so it must appear in R;
  // `Router` alone is too narrow (an unmet requirement stays a compile error).
  // @ts-expect-error is not assignable to type 'Node<RouterParamsError, Router>'
  const _missingTheme: Node<RouterParamsError, Router> = RouterApp(themedRouter);

  // the lazy component reads params, so `RouterParamsError` is in E;
  // `never` is too narrow.
  // @ts-expect-error is not assignable to type 'Node<never, Theme | Router>'
  const _missingError: Node<never, Theme | Router> = RouterApp(themedRouter);
});

// ── Assignability: a lazy slot is accepted wherever `component` is ─────────────

test("Assignability: a lazy slot is accepted wherever `component` is", () => {
  // A lazy component resolving a `Component.make` (no channels). The loaded value should be
  // a `Component` — a bare `() => Node` thunk loses its channels through the loader `Promise`
  // (contextual widening), so wrap one in `Component.make`, as the real `import().then(m => m.X)`
  // path already yields a `Component`.
  const _plainLazy = Router.route("plain", {
    component: Router.lazy(() => Promise.resolve(Component.make(() => h.div({}, "plain")))),
  });

  // A lazy component resolving a `Component.make`.
  const _makeLazy = Router.route("about", {
    component: Router.lazy(() => Promise.resolve(Component.make(() => h.h1({}, "About")))),
  });

  // A lazy **layout** component (splices the injected Outlet, which `makeLayout` discharges).
  const _lazyLayout = Router.layout(
    {
      component: Router.lazy(() =>
        Promise.resolve(
          Component.gen(function* () {
            const outlet = yield* Router.Outlet;
            return yield* h.div({ class: "shell" }, [outlet]);
          }),
        ),
      ),
    },
    [_plainLazy],
  );

  // A fully-static lazy tree needs only `Router` and raises nothing.
  expect(RouterApp(Router.router(_lazyLayout, { notFound: () => h.div({}, "404") }))).type.toBe<
    Node<never, Router>
  >();
});

// ── AC6: the descriptor stays eager, so `href` works on a lazy route ───────────

test("AC6: the descriptor stays eager, so `href` works on a lazy route", () => {
  const lazyOrder = Router.route("orders/:oid", {
    path: { oid: Schema.NumberFromString },
    component: Router.lazy(() => Promise.resolve(Component.make(() => h.div({}, "order")))),
  });

  // Should compile — `href` reads the eager path schema, independent of the lazy body.
  href(lazyOrder, { path: { oid: 1 } });

  // `oid` decodes from a number; a string is rejected, same as eager.
  expect(href).type.not.toBeCallableWith(lazyOrder, { path: { oid: "1" } });
});
