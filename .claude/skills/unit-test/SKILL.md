---
name: "unit-test"
description: "Step 4 of the Weft TDD workflow. Use after /type-tests: writes co-located *.test.ts unit tests against the mocked surface, covering every acceptance criterion, error path, and edge case, then runs them and confirms they FAIL (red phase) before handing off to /implement."
---

# /unit-test: Unit tests + red phase (TDD step 4)

Write the feature's unit tests against the mock surface, then prove they fail before any implementation exists.

## When to run

- **Previous step:** `/type-tests` (test file written, or explicit skip recorded).
- **Next step:** `/implement`.
- **Gate (exit):** a recorded red run: `vp run test` executed, every new test failing. A new test that passes against `declare` mocks is a test bug and must be fixed before handoff.

## Procedure

1. **Read the spec.** Tests are written against the acceptance criteria in the co-located `specs.md` and the mocked API surface. Nothing else.

2. **Write co-located tests** (`feature.ts` → `feature.test.ts`). `__tests__/` directories are allowed for compound/integration tests and shared fixtures/helpers.

3. **Naming:** `describe` for grouping, `it`/`test` for cases. Test case names must match or reference acceptance criteria from `specs.md`. A reviewer should be able to trace every criterion to a test by name.

4. **Coverage requirements** (all mandatory):
   - Every acceptance criterion in `specs.md`.
   - Happy paths **and** error paths.
   - **Every tagged error in the feature's Effect error union**: each expected failure gets a test.
   - Edge cases defined in the spec.

5. **Effect testing:** use Effect testing utilities for Effect code (e.g. `Effect.runPromise`/test clock/`TestContext` as appropriate). Follow repo idioms: `pipe(effect, ...)`, specific imports, no `import * as X`.

6. **Red phase (mandatory):**
   1. Run `vp run test` (never bare `vp test`: the pack rule).
   2. Confirm every **new** test fails. `declare` mocks have no runtime implementation, so failures are expected; a passing new test is vacuous (asserting nothing, or not exercising the surface). Fix the test.
   3. Confirm the tests fail for the *right* reason (missing implementation), not for compile errors or broken imports.
   4. Report the red run result to the user (counts of new failing tests) before handoff.

7. **Hand off.** Next step is `/implement`.

## Rules

- Tests target the public surface defined by the mocks. Do not reach into internals that the spec doesn't name.
- If writing tests reveals the spec or mock surface is wrong: pause rule. Back to `/spec` + `/mock` first, then re-enter here.
- Browser-dependent behavior is **not** tested here: that's `/e2e` (`*.browser.test.ts` files are excluded from `vp run test`).
