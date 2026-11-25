---
name: "effect-beta"
description: "Manage Weft's Effect 4 prerelease (beta/rc) dependency: bump the tested floor, fix a red bump PR, keep peer ranges/docs/catalog in sync, and verify claims against the installed effect dist. Use for any effect version bump, peer-range question, or upstream prerelease breakage."
---

# /effect-beta: Effect 4 prerelease management

Weft builds against the Effect 4 prerelease line (beta, then rc since `4.0.0-rc.108`) and stays deliberately close to its head. The skill, script, and workflow keep their `beta` names for continuity. This skill is the operating manual for that dependency: the version model, the automation, and the procedures for bumps and breakage.

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
| Install docs | `effect@<beta\|rc>` + a "tested against `effect@4.0.0-<beta\|rc>.N`" line | the install tag follows the floor's line so it never installs below the floor; both tokens are machine-rewritten. Files: root/core/dom/router READMEs + `docs/tutorial/01-your-first-app.md`. |

All three move together, only via `scripts/bump-effect-beta.mjs`. Hand-editing one representation is how they drift.

## The automation

- **`scripts/bump-effect-beta.mjs`**: reads the `rc` and `beta` dist-tags from the registry, picks the highest `4.0.0-<beta|rc>.N`, and rewrites all nine files (catalog, 3 peer floors, 5 doc files: tested-floor token + `effect@<tag>` install token). Safety properties: refuses any version that isn't `4.0.0-beta.N` / `4.0.0-rc.N` (leaving the prerelease line is a human decision), and every rewrite **throws if its target text is missing**. So if you rework an install block or peer entry, run `node scripts/bump-effect-beta.mjs --dry-run` afterward to prove the script still finds everything.
- **`.github/workflows/effect-beta-bump.yml`**: daily cron + manual dispatch. On a new prerelease: runs the script, `vp install --no-frozen-lockfile` (CI defaults pnpm to frozen, which rejects the intentionally stale lockfile), then `vp run check` / `vp run test` / `vp run test:browser` against the new prerelease, and opens a `fix(deps): bump effect to <version>` PR (a `fix` commit so merging cuts a release with the new floor). **Green → normal PR. Any validation failure → draft PR** with per-step results in the body.
- PRs created with the default `GITHUB_TOKEN` don't trigger the CI workflow; validation results live in the bump-PR body. A repo secret `EFFECT_BUMP_TOKEN` (PAT, repo scope) enables normal PR CI and is picked up automatically.

## Procedures

### Manual bump (don't wait for the cron)

```bash
node scripts/bump-effect-beta.mjs   # add --dry-run to preview
vp install --no-frozen-lockfile
vp run check && vp run test && vp run test:browser
```

Then branch + PR as usual (never push `main`).

### A bump PR arrived as a draft (red validation)

The new prerelease broke something upstream. On the bump branch:

1. Read the failing output; identify the changed API. Confirm the change **against the newly installed dist** (`node_modules/.pnpm/effect@<new>/...`). Find the renamed/moved export or changed signature there.
2. Apply the migration in workspace code. Loop `vp check --fix` → `vp run check` → `vp run test` (+ `test:browser`) until green (same loop as `/implement`).
3. Sweep prose for the change: if the API appears in `docs/`, READMEs, example readmes, or `*.specs.md`, update those too (grep the old name repo-wide, excluding `effect-src/`, `node_modules/`).
4. Commit onto the bump branch (`fix:` because it ships with the bump) and mark the PR ready.

If the breakage is too large to absorb now, close the PR and note why in an issue; the cron will re-propose with the then-latest prerelease.

### Skipped/stuck bumps

The script only ever targets the **latest** prerelease. Intermediate releases are never visited, which is fine (only the floor matters). If the workflow is repeatedly red across releases, the gap compounds: prioritize the migration before the delta grows.

### When Effect 4.0 stable lands

The script will refuse it (by design). Manually: catalog → `4.0.0`, peers → `^4.0.0`, replace `effect@rc` with `effect` and remove the prerelease caveat lines in the five docs, then **retire** the bump script + workflow and this skill's prerelease-specific guidance.

## Invariants

- The catalog pin, peer floors, and doc tokens must always name the same prerelease (`--dry-run` doubles as a consistency check: "expected content to rewrite was not found" means drift).
- Docs claims about Effect APIs are verified against the installed dist of the pinned prerelease: the pin is what makes "verified" meaningful.
- Version-specific statements outside the five managed files must be either timeless ("tracks the Effect 4 prerelease line") or explicitly marked historical, never a live claim naming a prerelease the script doesn't manage.
