/**
 * Type tests for pending navigation (spec: `pending-navigation.specs.md`).
 *
 * The `Router` service `Type` must carry a reactive `navigating: Subscribable<NavState>`,
 * `NavState` is a discriminated `Idle | Navigating{to}` union, and
 * `Router.navigatingStream` yields that Subscribable under the `Router` requirement.
 */

import { expect, test } from "tstyche";
import type { Effect } from "effect";
import type { Subscribable } from "@weftui/core";
import type { NavState } from "~/router-service";
import { Router } from "~/router-service";

// ── NavState is a discriminated union of Idle | Navigating{to} ─────────────────

test("NavState is a discriminated union of Idle | Navigating{to}", () => {
  expect<{ _tag: "Idle" }>().type.toBeAssignableTo<NavState>();
  expect<{ _tag: "Navigating"; to: string }>().type.toBeAssignableTo<NavState>();

  // `Navigating` requires a `to` string.
  // @ts-expect-error is not assignable to type 'NavState'
  const _missingTo: NavState = { _tag: "Navigating" };

  // an unknown tag is not a `NavState`.
  // @ts-expect-error is not assignable to type '"Idle" | "Navigating"'
  const _badTag: NavState = { _tag: "Loading" };
});

// ── The service Type carries `navigating: Subscribable<NavState>` ──────────────

test("The service Type carries `navigating: Subscribable<NavState>`", () => {
  type Navigating = Router["Service"]["navigating"];
  expect<Navigating>().type.toBeAssignableTo<Subscribable.Subscribable<NavState>>();
  expect<Subscribable.Subscribable<NavState>>().type.toBeAssignableTo<Navigating>();
});

// ── `Router.navigatingStream` yields the Subscribable under `Router` ───────────

test("`Router.navigatingStream` yields the Subscribable under `Router`", () => {
  expect(Router.navigatingStream).type.toBe<
    Effect.Effect<Subscribable.Subscribable<NavState>, never, Router>
  >();
});
