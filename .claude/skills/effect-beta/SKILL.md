---
name: "effect-beta"
description: "Manage Weft's Effect 4 prerelease (beta/rc) dependency: bump the tested floor, fix a breaking bump, keep peer ranges/docs/catalog in sync, and verify claims against the installed effect dist. Use for any effect version bump, peer-range question, or upstream prerelease breakage."
---

# /effect-beta: Effect 4 prerelease management

Weft builds against the Effect 4 prerelease line (beta, then rc since `4.0.0-rc.108`) and stays deliberately close to its head. The skill keeps its `beta` name for continuity. This skill is the operating manual for that dependency: the version model and the procedures for bumps and breakage.

## The facts (verify, don't assume)

- Effect 4 is published on npm as **`effect` under the `beta` and `rc` dist-tags**. There is **no `effect-smol` package**: that's only the GitHub repo name (now archived; development moved back to the main Effect repo). `npm view effect dist-tags` shows `latest` (3.x), `beta` (4.0.0-beta.N, frozen at beta.107) and `rc` (4.0.0-rc.N). Prerelease numbers are shared across both lines (beta.107 was followed by rc.108).
- Effect 4 prereleases ship **breaking changes between releases** (module renames, signature changes). Never assume adjacent prereleases are compatible.
- The source of truth for any API question is the **installed package**: `node_modules/.pnpm/effect@<version>/node_modules/effect/dist/*.d.ts` (and `.js` for implementation details). **Never** trust `effect-src/MIGRATION.md` or Effect 3 knowledge: both are known-stale. Grep the dts for the export before writing any claim about it into code or docs.

## The version model

One version, three representations, kept in sync:

| Where | Form | Meaning |
| --- | --- | --- |
| `pnpm-workspace.yaml` catalog | exact `4.0.0-<beta\|rc>.N` | the **tested floor**: the one prerelease this repo builds, tests, and releases against. Never a dist-tag or range: builds must not drift silently. |
| `packages/{core,dom,router}/package.json` `peerDependencies` | `>=4.0.0-<beta\|rc>.N <4.0.0` | the consumer contract: "tested at N, newer 4.0 prereleases accepted at your own risk" (honest pre-1.0 posture; the range accepts later 4.0.0 prereleases). |
| Install docs | `effect@<beta\|rc>` + a "tested against `effect@4.0.0-<beta\|rc>.N`" line | the install tag follows the floor's line so it never installs below the floor; update both by hand. Files: root/core/dom/router READMEs + `docs/tutorial/01-your-first-app.md`. |

All three move together in one commit. Updating only some of them is how they drift.

There is no custom bump automation. Bumps are manual. Dependabot may still propose effect updates, but it does not maintain the peer floors or the doc tokens.

## Procedures

### Manual bump

Update the catalog pin, the three peer floors, and the five docs listed above. Then:

```bash
vp install --no-frozen-lockfile
vp run check && vp run test && vp run test:browser
```

Then branch + PR as usual (never push `main`).

### A bump fails validation

The new prerelease broke something upstream. On the bump branch:

1. Read the failing output; identify the changed API. Confirm the change **against the newly installed dist** (`node_modules/.pnpm/effect@<new>/...`). Find the renamed/moved export or changed signature there.
2. Apply the migration in workspace code. Loop `vp check --fix` → `vp run check` → `vp run test` (+ `test:browser`) until green (same loop as `/implement`).
3. Sweep prose for the change: if the API appears in `docs/`, READMEs, example readmes, or `*.specs.md`, update those too (grep the old name repo-wide, excluding `effect-src/`, `node_modules/`, `graphify-out/`).
4. Commit onto the bump branch (`fix:` because it ships with the bump), mark the PR ready, run `graphify update .`.

If the breakage is too large to absorb now, close the PR and note why in an issue.

### Skipped bumps

Intermediate releases can be skipped: only the floor matters. Prioritize the migration before the delta grows.

### Moving to stable Effect 4

Stable has landed. The migration is tracked in [issue 198](https://github.com/stefvw93/weft/issues/198), including the supported floor and peer range. Once it ships, retire this skill's prerelease-specific guidance.

## Invariants

- The catalog pin, peer floors, and doc tokens must always name the same prerelease.
- Docs claims about Effect APIs are verified against the installed dist of the pinned prerelease: the pin is what makes "verified" meaningful.
- Version-specific statements outside the five docs listed above must be either timeless ("tracks the Effect 4 prerelease line") or explicitly marked historical, never a live claim naming a prerelease.
