/**
 * Type tests for resolve-before-commit navigation (spec:
 * `resolve-before-commit.specs.md`).
 *
 * The feature adds **no public API**: the resolved-commit stash and the staged
 * match view are internal seams (`resolved-commit.ts`, not re-exported from
 * `src/index.ts`). These tests pin that internality — the stash key must not be
 * readable off the public `Router` service `Type` — and the shape of the
 * internal contract the outlet and the client `navigate` share.
 */

import { expect, test } from "tstyche";
import type { Renderable } from "@weftui/core";
import type { Effect, Exit } from "effect";
import type { RouteMatch } from "~/matcher";
import type { ResolvedCommitEntry, ResolvedCommitSlot } from "~/resolved-commit";
import { ResolvedCommit, preRunLeaf, stageMatch, takeResolvedCommit } from "~/resolved-commit";
import type { Router } from "~/router-service";

declare const router: Router["Service"];
declare const target: RouteMatch;
declare const slot: Router["Service"] & ResolvedCommitSlot;
declare const entry: ResolvedCommitEntry;

// ── The stash does not leak into the public service type ───────────────────────

test("The stash does not leak into the public service type", () => {
  // `Router["Service"]` carries no ResolvedCommit member; only an
  // instance explicitly widened to `ResolvedCommitSlot` may be indexed by the brand.
  expect(router).type.not.toHaveProperty(ResolvedCommit);

  // A widened instance is indexable, and the entry is `{ url, exit } | undefined`.
  expect(slot[ResolvedCommit]).type.toBe<ResolvedCommitEntry | undefined>();
});

// ── Entry shape: committed url + the pre-run's Exit over a Renderable ──────────

test("Entry shape: committed url + the pre-run's Exit over a Renderable", () => {
  expect(entry.url).type.toBe<string>();
  expect(entry.exit).type.toBe<Exit.Exit<Renderable, unknown>>();

  // entries are immutable.
  // @ts-expect-error Cannot assign to 'url' because it is a read-only property
  entry.url = "/elsewhere";
});

// ── Internal function contracts ─────────────────────────────────────────────────

test("Internal function contracts", () => {
  // `takeResolvedCommit` consumes by exact committed url and may miss.
  expect(takeResolvedCommit(router, "/docs/a/b")).type.toBe<ResolvedCommitEntry | undefined>();

  // `stageMatch` returns a full `Router` view — a drop-in for the live service.
  expect(stageMatch(router, target)).type.toBe<Router["Service"]>();

  // `preRunLeaf` never fails and needs no context beyond the caller's runtime:
  // failures are folded into the returned `Exit` (AC-R7).
  expect(preRunLeaf(router, target)).type.toBe<Effect.Effect<Exit.Exit<Renderable, unknown>>>();
});
