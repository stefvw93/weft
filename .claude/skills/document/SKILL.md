---
name: "document"
description: "Step 8 of the Weft TDD workflow. Use after /review-step is clean: full documentation sweep of everything touched, JSDoc on changed exports, specs.md sync, docs/ pages, package READMEs, example readme.md files. Prose docs are written by the weft-docs-author agent; JSDoc and specs.md sync by the main thread. Hard gate: no commit until docs are complete, then branch + PR (never push main)."
---

# /document: Documentation sweep (TDD step 8)

Bring all documentation touched by the change up to date. Commits are blocked until this step completes; it ends with branch + PR.

## When to run

- **Previous step:** `/review-step` (review clean).
- **Next step:** none (the workflow ends here with branch + PR).
- **Gate (exit):** full sweep complete and final `vp run check` green. **No commit until then.** Then branch + PR; never push to `main`.

## Scope: everything touched by the change

1. **JSDoc** on all new/changed exported functions, types, and values (created in `/mock`; verify present and accurate now). Self-evident exports get exactly one line; doc blocks ≤ 3 lines for typical functions; no `@example` unless usage isn't inferable from the signature/name; no em-dashes. Omit `@type` annotations; describe non-obvious parameters; annotate Effect Schemas when not self-explanatory.
2. **`specs.md` sync**: the spec must reflect final behavior. If implementation legitimately changed details (via the pause rule), the spec already says so; verify. Acceptance criteria, skip records, and edge cases must match reality.
3. **`docs/` pages and package READMEs**: update or create when the public API surface of a package changed. `docs/` follows the Diátaxis framework (`tutorial/`, `how-to/`, `reference/`, `explanation/`). Each page fits exactly one mode; the `weft-docs-author` agent carries the placement rules.
4. **Example `readme.md`** for every touched `examples/*` package. Must contain the required sections: Overview, Problem, Solution, How It Works, When to Use.

## Authorship split

- **Prose documentation** (`docs/` pages, package READMEs, example readmes, conceptual guides): spawn the **`weft-docs-author`** agent (defined in `.claude/agents/weft-docs-author.md`). Give it the feature's `specs.md` path, the changed files, and the doc targets. It grounds itself in source before writing and never documents unverified APIs.
- **JSDoc + `specs.md` sync:** done by the main thread directly (it holds the implementation context).
- **Fallback:** if the agent is unavailable, the main thread writes the prose docs itself following the rules in `.claude/agents/weft-docs-author.md`.

## Procedure

1. Inventory the diff: list changed exports, packages with public-API changes, touched examples.
2. Main thread: verify/complete JSDoc; sync `specs.md`.
3. Spawn `weft-docs-author` for the prose targets from the inventory; review its output against the source (no invented APIs, no JSX-isms, required readme sections present).
4. Run `vp run check`: formats and lints the JSDoc and markdown. Must be green.
5. Create a branch, commit, open a PR. **Never push to `main`.**

## Rules

- Documentation is a hard gate: a feature without its docs sweep is not committable.
- All prose follows the "Docs Prose Style" rules in `CLAUDE.md` (sentence length cap, no em-dashes, paragraph cadence, bullets over long prose lists, metaphor allowance).
- Docs must match the source: every claim verifiable, code samples follow Oxfmt conventions (tabs, double quotes) and Effect idioms, no `<Component/>`-style JSX in any sample.
