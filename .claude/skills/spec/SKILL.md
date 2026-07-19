---
name: "spec"
description: "Step 1 of the Weft TDD workflow. Use when starting any new feature (or retroactively spec'ing an existing one being modified): drives an interactive Q&A requirements discussion, then writes the co-located specs.md. Entry point of the cycle spec → mock → type-tests → unit-test → implement → e2e → review-step → document."
---

# /spec: Specification (TDD step 1)

Draft a co-located `specs.md` for a feature through interactive Q&A, before any code exists.

## When to run

- **Previous step:** none (this is the entry point of the workflow).
- **Next step:** `/mock`.
- **Gate:** none to enter. To exit, the user must explicitly approve the spec.

## Procedure

1. **Locate the feature.** Determine the owning package (`packages/base`, `packages/core`, `packages/dom`, or an `examples/*` package) and the source file the feature will live in. The spec is co-located: `dom/feature.ts` gets `dom/feature.specs.md`. If a `specs.md` already exists for this feature, this run revises it. Read it first.

2. **Q&A discussion: one question at a time.** Use the AskUserQuestion tool. Ask a single question, await the answer, then ask the next (per the project Meta Rules). Cover, as applicable:
   - Purpose: what problem does this solve, for whom?
   - Requirements and acceptance criteria: what must observably be true?
   - API shape: inputs, outputs, Effect error union (tagged errors), services/dependencies.
   - Edge cases and failure modes.
   - Constraints: SSR/client split, performance, bundle size, browser-observable behavior (feeds the later `/e2e` decision).
   - Type-level surface: generics, constraints, inference expectations (feeds the later `/type-tests` decision).

   Keep asking until you have no material open questions. Do not batch questions.

3. **Write `specs.md`** from this template:

   ```markdown
   # <Feature Name>

   ## Overview & Purpose

   <What this is and why it exists.>

   ## Acceptance Criteria

   - [ ] <Observable, testable criterion>
   - [ ] <...>

   ## Technical Requirements        <!-- optional -->

   ## Dependencies & Integrations   <!-- optional -->

   ## Expected Behavior & Edge Cases <!-- optional -->
   ```

   Required sections: **Overview & Purpose**, **Acceptance Criteria**. Optional sections only when they carry real content. Acceptance criteria must be concrete enough that `/unit-test` can name test cases after them.

4. **Iterate until approved.** Present the draft, incorporate feedback, repeat. Only when the user approves is this step done.

5. **Hand off.** Tell the user the spec is approved and the next step is `/mock`.

## Rules

- No implementation code, no mocks, no tests are written in this step.
- Every new feature must have a `specs.md`; existing features without one get it retroactively when modified.
- If later steps reveal the spec is wrong: the cycle pauses and returns here first (spec → mock updated before implementation resumes).
