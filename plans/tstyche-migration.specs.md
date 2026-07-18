# TSTyche Type-Test Migration

> Source plan: `~/.claude/plans/weft-uses-type-tests-i-curried-wilkes.md` (user-approved; decisions recorded there).
> Cross-cutting tooling migration — spec lives in `plans/` because no single owning source file exists.

## Overview & Purpose

Weft's 13 type-test files (`src/**/__type-tests__/*.test-d.ts` plus the stray
`packages/core/src/combinator/combinator.test-d.ts`) use a hand-rolled
`Expect<Equal<A, B>>` helper copy-pasted into 6 files, plus `@ts-expect-error`
negatives (~93 positive / ~48 negative assertions). They have no runner: they are
only type-checked because package tsconfigs `include: ["src"]`, so failures
surface as opaque tsc errors during `vp run check` with no reporting, isolation,
or assertion vocabulary.

This migration moves all type tests to **TSTyche 7.2.2**, a dedicated type-test
runner built on the TypeScript language-service API with
`expect().type.toBe<T>()`-style matchers, wired into a new `vp run test:types`
task and CI job.

Critical consequence driving the CI requirement: after migration, `vp run check`
(tsc) no longer catches failed positive assertions — TSTyche matcher failures are
language-service comparisons, not compile errors. `test:types` must therefore be
a required CI gate.

## Acceptance Criteria

- [x] `tstyche ^7.2.2` added to the pnpm catalog (`pnpm-workspace.yaml`) and as
      `"tstyche": "catalog:"` devDependency in root, `packages/core`,
      `packages/dom`, `packages/router`, and `website` package.json files;
      `vp install` succeeds.
- [x] Root `tstyche.json` exists with the `$schema` key; extra keys only if a
      documented risk materializes (TS7 loading, `rejectNeverType` false
      positives). **Materialized:** default `testFileMatch` picked up
      `effect-src/` (gitignored Effect clone ships its own `*.tst.ts`), so
      `testFileMatch` is scoped to `packages/**` + `examples/**` +
      `website/**` (`examples/**` added during /review-step so future example
      type tests are discovered). TS7 note: `typescript@7.0.2` (tsgo) ships no
      JS language-service API, so TSTyche fetches its own TypeScript;
      `"target": "6.0.3"` is pinned during /review-step to prevent silent
      compiler drift between runs. Checker divergence vs `@effect/tsgo` is
      documented in CLAUDE.md (Testing section).
- [x] All 13 type-test files renamed via `git mv` from `*.test-d.ts` to
      `*.tst.ts` in their existing directories, and
      `packages/core/src/combinator/combinator.test-d.ts` moved into
      `packages/core/src/combinator/__type-tests__/combinator.tst.ts`.
- [x] No `*.test-d.ts` files remain in the repo.
- [x] Every file imports `{ expect, test } from "tstyche"`, the local
      `Expect`/`Equal` helpers are deleted, and logical groups are wrapped in
      `test("...")` blocks named after the existing `// Test N: ...` comments.
- [x] Positive assertions converted per the plan's mapping table
      (`Expect<Equal<typeof x, T>>` → `expect(x).type.toBe<T>()`, pure
      type-level → `expect<A>().type.toBe<B>()`, assignability-intent sites →
      `toBeAssignableTo<T>()` judged per site).
- [x] `@ts-expect-error` negatives converted to `.not.toBeCallableWith(...)` /
      `.not.toHaveProperty(...)` where the matcher cleanly expresses the intent;
      remaining `@ts-expect-error` cases stay and are validated by TSTyche's
      default `checkSuppressedErrors: true`.
- [x] `// oxlint-disable no-unused-vars` headers removed where the conversion
      eliminates the unused locals/types.
- [x] `vite.config.ts` run.tasks gains
      `"test:types": { command: "tstyche", dependsOn: ["pack"] }`.
- [x] `vp run test:types` discovers all 13 files (`tstyche --listFiles`
      confirms) and passes.
- [x] Mutation checks (temporary, reverted): a broken positive assertion and a
      broken `.not` matcher each fail `vp run test:types` with a useful diff; a
      removed still-needed `@ts-expect-error` is reported; a stale added
      `@ts-expect-error` is flagged by `checkSuppressedErrors`.
- [x] `vp run check` and `vp run test` stay green; vitest does not pick up
      `.tst.ts` files.
- [x] `.github/workflows/ci-release.yml` gains a `test-types` job mirroring the
      `check` job shape running `vp run test:types`, included in the aggregate
      gate's `needs` and result checks.
- [x] Docs updated: `CLAUDE.md` (TDD step 3 pattern → `*.tst.ts`, TSTyche +
      `vp run test:types`, run.tasks list, Testing section),
      `.claude/skills/type-tests/SKILL.md` (author TSTyche tests; skip-recording
      rules preserved), plus any `specs.md`/docs/README references to `test-d` /
      `__type-tests__`.
- [x] `graphify update .` run after code changes.
- [x] Work lands on a branch + PR (never push main); commit type is a
      non-release type (`build:`/`test:`), not `fix:`/`feat:`.

## Technical Requirements

- TSTyche 7.2.2; peer `typescript >=5.4`; node >=22 (repo already satisfies).
- `tstyche.json` defaults: `testFileMatch` includes `**/*.tst.*`;
  `tsconfig: "findup"` resolves each package's tsconfig so `~/*` aliases and
  workspace `@weftui/*` dist types work; `checkSuppressedErrors: true`.
- Renamed files stay under `src/` → remain in the tsc program, keeping editor DX
  and letting `vp run check` typecheck the test code itself.
- `test:types` depends on `pack`: dom/router/website tests resolve `@weftui/*`
  through built `dist/`.

## Expected Behavior & Edge Cases

- **TS7 (tsgo) compat unverified.** Try installed TS first. If TSTyche cannot
  load `typescript@7.0.2`, set `"target": "latest"` in `tstyche.json` (downloads
  a 5.x-line TS) and document the checker divergence vs `@effect/tsgo` in
  CLAUDE.md.
- **`rejectNeverType`/`rejectAnyType`** (default true) may flag assertions like
  `toBe<Node<never, never>>`. Expected fine (only whole-type `never` rejected);
  if false positives appear, disable the flag in `tstyche.json`.
- **Semantics tightening.** `Equal<A, B>` conditional-type trick vs TSTyche
  `toBe` may disagree on edge cases (`any`, intersections). If a converted
  assertion fails, determine the original intent before changing types.

## Review outcome (/review-step)

Fixed beyond the plan: `examples/**` added to `testFileMatch`; TSTyche
TypeScript pinned (`"target": "6.0.3"`); CI caches `~/.local/share/TSTyche`
(tstyche downloads its own TypeScript — network dependency otherwise);
stale `*.test-d.ts` cross-references in comments/docs updated; two stale
`oxlint-disable` headers removed; one bare module-level `expect()` wrapped in
`test()`. Rejected findings (with reasons) reported in the review log.

## TDD step applicability

- `/mock`: not applicable in the usual `declare`-mock sense — no new runtime API
  surface. The "mock" equivalent is the config/task scaffolding without
  conversions; recorded here per the pause rule.
- `/type-tests`: the migration itself is the type-test work.
- `/unit-test`: not applicable — no runtime behavior; verification is the
  mutation-check protocol above. Recorded here explicitly.
- `/e2e`: not applicable — no browser-observable behavior; no `examples/*` app
  touched. Recorded here explicitly.
