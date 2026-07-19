---
name: "mock"
description: "Step 2 of the Weft TDD workflow. Use after /spec has produced an approved specs.md: writes the feature's complete API surface as declare-based mocks in the real source file location, to be replaced in-place by /implement. Refuses to run if the co-located specs.md is missing."
---

# /mock: API surface mocks (TDD step 2)

Write the feature's complete API surface as type-level mocks (`declare`) in its real source file, matching the approved spec.

## When to run

- **Previous step:** `/spec` (an approved, co-located `specs.md` must exist).
- **Next step:** `/type-tests`.
- **Gate (enter):** if the co-located `specs.md` is missing, **refuse to run** and direct the user to `/spec` first. No exceptions.

## Procedure

1. **Read the spec.** Load the co-located `specs.md`. Every acceptance criterion must be attributable to some part of the surface you are about to write.

2. **Write the mock surface in the real source file** (the file the implementation will live in, not a separate `*.mock.ts`). Use the `declare` keyword for anything that would need a runtime body. Cover the complete surface:
   - Function signatures (including overloads)
   - Classes and their methods
   - Constants and variables
   - Type definitions and interfaces
   - Exports (named exports; follow module-organization rules for barrels)
   - The Effect error union: declare every tagged error type the feature can fail with

3. **JSDoc everything exported.** All exported functions, types, and values get JSDoc now. It is part of the surface, and `/document` later only has to sync it, not create it. Omit `@type` annotations; describe non-obvious parameters.

4. **Follow the standards** while shaping the surface: `readonly` extensively, `Option` > `undefined` > `null`, generic constraints over flexibility, Schema for unknown/I-O boundaries, no JSX-style deferred component descriptors.

5. **Mock-vs-spec review checklist.** Finish by walking it explicitly:
   - [ ] Every acceptance criterion in `specs.md` maps to a declared signature, type, or error.
   - [ ] Every declared export is justified by the spec (no speculative surface).
   - [ ] The error union covers every failure mode named in the spec.
   - [ ] Types are complete: a consumer could compile against this surface.

   If the checklist exposes a spec gap: pause, return to `/spec`, then redo this step.

6. **Hand off.** Next step is `/type-tests`.

## Rules

- Mocks live in the real source file and are replaced **in-place** by `/implement`. Signatures must be final-quality, not sketches.
- No runtime implementation in this step; `declare` only.
- Changing this surface later (during `/implement` or beyond) requires the pause rule: back to `/spec` + `/mock` first.
