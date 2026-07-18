# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`Weft` is a pnpm monorepo (`weft-workspace`) implementing an Effect-based UI library with strict TypeScript configuration and modern tooling.

Workspace layout (see `pnpm-workspace.yaml`):

- `packages/*` — published library packages:
  - `@weftui/base` (`packages/base`) — shared primitives
  - `@weftui/core` (`packages/core`) — core combinators, sources, streams, boundaries
  - `@weftui/dom` (`packages/dom`) — DOM renderer with `./client` and `./server` entry points
- `examples/*` — standalone runnable example apps, each its own workspace package

## Requirements

- Node.js

See versions in package.json > engines. Package management and all tooling is handled by `vp` (Vite+).

## Development Commands

All commands use the `vp` CLI (Vite+). Run `vp help` for a full list.

### The `pack` step (read this first)

This is a monorepo: `@weftui/dom` and the `examples/*` consume `@weftui/core`/`@weftui/base` as workspace packages, resolved through their **built `dist/`**. Cross-package type-checking is therefore only correct once those packages have been packed.

**Rule: run validation through the `vp run <task>` tasks, never the bare `vp <command>`.** The tasks are declared in the root `vite.config.ts` under `run.tasks` and each one declares `dependsOn: ["pack"]`, so `vp run` always rebuilds the packages first:

- ✅ `vp run check`, `vp run test`, `vp run test:browser`, `vp run test:types` — pack first, then run. Always correct.
- ❌ `vp check`, `vp test` directly — skip `pack`, so against stale/missing `dist/` they report **false** cross-package errors (e.g. spurious `implicit any` from unresolved `@weftui/*` types). Only safe right after a pack.

Treat the task list in `vite.config.ts` (`run.tasks`) as the source of truth for how to validate — if a task exists there, invoke it via `vp run <task>`. Current tasks: `dev`, `pack`, `check`, `test`, `test:browser`, `test:types`.

### Building

```bash
vp build
```

Uses tsdown for fast TypeScript bundling.

### Testing

```bash
vp run test            # Pack, then run all node/jsdom tests
vp run test:browser    # Pack, then run real-browser e2e tests (Playwright)
vp run test:types      # Pack, then run TSTyche type tests (*.tst.ts)
vp test --watch        # Watch mode (only safe after a pack)
```

Uses Vitest (via Vite+). Node test files follow the pattern `**/*.test.{ts,tsx}`; `*.browser.test.{ts,tsx}` are excluded from `vp run test` and run via `vp run test:browser` (see the `pack` step rule above).

Type tests (`src/**/__type-tests__/*.tst.ts`) run via [TSTyche](https://tstyche.org) (`vp run test:types`, config in root `tstyche.json`). **A failed `expect().type` assertion does NOT fail `vp run check`** — TSTyche matchers are language-service comparisons, not compile errors — so `test:types` is a required CI job. Checker note: the workspace `typescript@7` (tsgo) has no JS language-service API, so TSTyche runs against its own pinned TypeScript (`target` in `tstyche.json`); its checker can diverge from `@effect/tsgo` on edge cases — trust `vp run check` for program correctness and TSTyche for the assertion verdicts.

### Checking (format + lint + typecheck)

```bash
vp run check       # Pack, then format, lint, and type-check all files
vp check --fix     # Auto-fix formatting/lint (only safe after a pack)
```

**Important:** Validate via `vp run check` (it packs first — see the `pack` step rule). Use `vp check --fix` for auto-fixing, but only when packages are already built, otherwise it reports false cross-package type errors. Always prefer these over individual lint/format commands.

## Architecture

### TypeScript Configuration

Strict TypeScript setup with:

- `noUncheckedIndexedAccess: true` - Array/object access returns possibly undefined
- `noImplicitReturns: true` - All code paths must return
- `strict: true` - All strict type-checking enabled
- `verbatimModuleSyntax: true` - Import/export syntax preserved
- `isolatedModules: true` - Each file must be transpilable independently
- `noUncheckedSideEffectImports: true` - Side-effect imports must be explicit

Path aliases (configured per package in `packages/*/tsconfig.json`, which extend `tsconfig.base.json`):

- `~/*` maps to that package's `./src/*`

### Code Style

**Toolchain:** This project uses Oxlint (linting) and Oxfmt (formatting) via Vite+, NOT ESLint or Biome.

Oxfmt enforces:

- Tab indentation
- Double quotes for strings

When ignoring lint rules, use Oxlint syntax:

- ✅ Correct: `// oxlint-disable-next-line <rule-name>`
- ❌ Wrong: `// eslint-disable-next-line` or `// biome-ignore`

### Project Structure

- `packages/*/src/` - Source TypeScript files for each library package
- `packages/*/dist/` - Build output (excluded from TypeScript compilation)
- `examples/*/` - Standalone runnable example apps, each its own workspace package with an `app.ts` entry point and `vite.config.ts`
- `docs/` - Documentation
- `plans/` - Design plans and specs
- ES modules only (`"type": "module"` in package.json)

### Examples

The `examples/` folder contains standalone workspace packages demonstrating specific patterns or features (e.g. `keyed-list`, `form-handling`, `ssr-hydration`).

**Rules for examples:**

- Every example must have a co-located README named `readme.md`
- Each example is a self-contained, runnable workspace package (depends on `@weftui/*` via `workspace:*`)
- Include a JSDoc header comment in `app.ts` explaining the example's purpose
- READMEs should include: Overview, Problem, Solution, How It Works, and When to Use sections
- Each example is split into a **side-effect-free `app.ts`** (or `src/app.ts`) that
  `export`s `App` — no top-level `mount`/`hydrate` call — and a thin entry
  (`main.ts`, or `entry-client.ts` for SSR examples) that mounts it and is the file
  referenced by `index.html`. This keeps `app.ts` importable by tests.
- Every example **must include at least one co-located `*.browser.test.ts`** that
  imports `App`, mounts it in a real browser, and asserts the example's headline
  behaviour. Browser tests use `vite-plus/test` globals (never `vitest` directly)
  and run via `vp run test:browser`. See `e2e/specs.md` for conventions and known
  pitfalls (post-mount render tick, ref observers, missing example CSS).

## Coding Standards

### Architecture & Patterns

- Use a hybrid approach combining functional and object-oriented programming
- Effect (effect.website) is the core library - use its patterns throughout
- Prefer Effect's error handling over try/catch (except when it significantly hurts ergonomics)
- Use Services and Layers for dependency injection
- Prefer `pipe(effect, ...)` over `effect.pipe(...)`
- **No JSX.** Weft does **not** use JSX, even though its node descriptors
  (`{ type, props }`) resemble React elements. There is no JSX runtime (no `jsx`
  in any tsconfig) and no `h(Component)` overload — `h.*` only builds string-tag
  and `FRAGMENT` nodes, and components are plain functions that are **called**
  (e.g. `App()`), placing their resulting node in the tree directly rather than
  deferring construction. Do not assume `<Component/>`-style deferred descriptors
  exist or write code that depends on them.

### TypeScript Standards

- Type assertions (`as`, `!`) only when we're "smarter" than the compiler
- `any` is allowed for generic type params and library interop only
- Use explicit type guards over implicit checks
- Prefer generic constraints over flexibility
- Treat data structures as immutable - use `readonly` extensively
- Prefer `Option` > `undefined` > `null` for optional values
- All checks should be type-level when possible
- Use Schema for validation of unknowns and I/O

### Naming Conventions

- Files: kebab-case (e.g., `user-service.ts`)
- Variables/functions: camelCase, with `is*`, `has*`, `should*` prefixes for booleans
- Types/Interfaces: PascalCase, no `I` prefix for interfaces
- Constants (shared): UPPER_SNAKE_CASE
- Prefer named exports; default exports only if absolutely necessary

### Documentation

- All exported functions, types, and values must have JSDoc comments
- JSDoc `@type` annotations can be omitted (TypeScript handles types)
- Include text descriptions for parameters when not self-explanatory
- Inline comments only when needed - avoid commenting obvious code
- TODOs and FIXMEs are acceptable
- Effect Schemas should include descriptions/annotations when not self-explanatory

### TDD Workflow

Every feature follows this 8-step cycle. Each step is a project skill (detail lives in `.claude/skills/<name>/SKILL.md`):

`/spec → /mock → /type-tests → /unit-test → /implement → /e2e → /review-step → /document`

1. `/spec` — interactive Q&A (one question at a time), then co-located `specs.md` (Overview & Purpose + Acceptance Criteria required). User approves before moving on.
2. `/mock` — `declare`-based full API surface in the real source file, JSDoc included. Refuses to run without `specs.md`.
3. `/type-tests` — TSTyche tests at `src/**/__type-tests__/*.tst.ts` (`expect().type` matchers, message-fragment `@ts-expect-error` where no matcher fits) run via `vp run test:types`, or explicit `type-tests: not applicable — <reason>` recorded in `specs.md`.
4. `/unit-test` — co-located `*.test.ts` covering every acceptance criterion, happy + error paths (full Effect error union), edge cases. **Red phase:** new tests must fail against the mocks before implementation.
5. `/implement` — replace mocks in-place with signature parity, loop `vp check --fix` → `vp run check` → `vp run test` until green, then `graphify update .`.
6. `/e2e` — `*.browser.test.ts` via `vp run test:browser`. Mandatory for every touched `examples/*` app; conditional for package features (explicit skip recorded otherwise).
7. `/review-step` — code-review pass (medium effort; high when `packages/core` or `packages/dom` public API is touched) plus spec-conformance check; every finding fixed or explicitly rejected with reason; loop until clean. **Hard gate: no commit until clean.**
8. `/document` — full docs sweep (JSDoc, `specs.md` sync, `docs/`, READMEs, example readmes) via the `weft-docs-author` agent + main thread. **Hard gate: no commit until complete.** Then branch + PR — never push `main`.

Invariants:

- Strict cycle — no phase skips; a step skipped as not-applicable must be recorded in `specs.md` with a reason.
- Pause rule — if any step reveals the spec or mock surface is wrong, stop, update spec + mocks (and affected tests) first, then resume.

### Error Handling

- Use Effect's tagged errors as the primary error handling mechanism
- Error messages should be descriptive and include context/debugging info when useful
- Input validation required only for unsafe input (user input, `unknown` input)
- Handle errors at program edges when possible

### Module Organization

- Organize code by domain, within the relevant workspace package
- Barrel exports (`index.ts`) only for grouping application domains, e.g. in `@weftui/dom`:
  - `src/index.ts` - package root export
  - `src/client/index.ts` - client-side DOM renderer (`@weftui/dom/client`)
  - `src/server/index.ts` - server-side rendering (`@weftui/dom/server`)
- Avoid circular dependencies
- Use `/utils` only for common code that doesn't fit a specific domain

### Effect-Specific Patterns

- Prefer Effect logic throughout the codebase
- Use Effect Schema for data structures and validation
- Wrap functionality in Services when capabilities need to be shared across modules/components
- Manage runtimes only when explicitly required
- `Effect.gen` vs `pipe` depends on the specific feature and readability

### Code Reuse

- Wait for multiple use cases before abstracting - avoid premature abstraction
- Organize shared utilities by domain; use `/utils` only for cross-cutting concerns
- Duplication vs abstraction is case-by-case - prefer duplication over poor abstraction

### Performance

- Readability first, performance second
- Use memoization only when explicitly specified or instructed
- Be mindful of bundle size: import specific items, not `import * as X`
- `Effect.gen` vs `pipe` choice depends on the feature and readability

### Imports

- Use specific imports, avoid `import * as X`

## Effect 4 Reference (`effect-src/`)

A shallow clone of [Effect-TS/effect](https://github.com/Effect-TS/effect) lives at `./effect-src` as a **local docs/source reference** for AI agents. It is gitignored and not part of the workspace. Effect 4 development merged back into this canonical repo (the old `effect-smol` repo is archived): `main` is Effect 4 (v4); v3 lives on the `v3` branch. Cloning the default branch gets you v4.

- Use it to look up Effect 4 APIs and semantics instead of guessing or relying on Effect 3 knowledge. Most useful entry points:
  - `effect-src/packages/effect/src/` — actual source of every module (authoritative for signatures and JSDoc)
  - `effect-src/AGENTS.md` and `effect-src/LLMS.md` — repo guidance written for AI agents
  - `effect-src/MIGRATION.md` exists but is **known-stale** for the beta line — prefer the installed `effect` dist (`node_modules/.pnpm/effect@<version>/…/dist/*.d.ts`) as the authoritative source for any API claim.
- If `./effect-src` is missing, fetch it first:

  ```bash
  git clone --depth 1 https://github.com/Effect-TS/effect.git effect-src
  ```

- To refresh an existing clone: `git -C effect-src pull --depth 1`
- Never edit files in `effect-src/`, import from it in workspace code, or include it in builds/tests — it is read-only reference material.

## Meta Rules

- Always discuss new rules and rule changes in Q&A style. Ask a question and await the answer before asking the next question, until sufficient information is provided.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
