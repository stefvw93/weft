---
name: "review-step"
description: "Step 7 of the Weft TDD workflow. Use after /e2e: self-reviews the diff via the code-review skill (medium effort; high when packages/core or packages/dom public API is touched) plus a spec-conformance check, then fixes or explicitly rejects every finding and re-validates until clean. Hard gate: no commit until the review is clean. Named review-step to avoid the built-in /review (GitHub PR review)."
---

# /review-step: Self-review (TDD step 7)

Review the full diff for correctness and spec conformance; loop until clean. Commits are blocked until this step passes.

## When to run

- **Previous step:** `/e2e` (browser tests green, or explicit skip recorded).
- **Next step:** `/document`.
- **Gate (exit):** a review pass with zero unaddressed findings. **No commit until clean.**

## Procedure

1. **Pick the effort level.**
   - Default: run the `code-review` skill at **medium** effort (fewer, high-confidence findings, fast loop).
   - Escalate to **high** when the diff touches `packages/core` or the public API surface of `packages/dom` (exports reachable from `@weftui/dom`, `./client`, or `./server`).

2. **Run the code-review skill** on the working diff at the chosen level.

3. **Spec-conformance check (always, regardless of effort level).** Independently of the skill's findings, verify:
   - The implementation satisfies every acceptance criterion in the co-located `specs.md`.
   - The implemented exports still match the mock surface exactly (signatures, error union): no drift since `/implement`'s parity pass.
   - `specs.md` skip records (`type-tests: not applicable`, `e2e: not applicable`) are present where those steps were skipped.

   Any conformance gap is a finding, same weight as a bug.

4. **Disposition every finding (no silent drops).** Each finding is either:
   - **Fixed**, or
   - **Explicitly rejected with a stated reason**, reported to the user.

   If a finding reveals spec/mock drift: **pause rule**. Stop, update `specs.md` and the mock surface (and affected tests) first, then resume.

5. **Re-validate and re-review loop.** After applying any fixes:
   1. `vp run check` and `vp run test` (and `vp run test:browser` if browser-covered code changed): must be green.
   2. Re-run the review on the updated diff.
   3. Repeat until a review pass comes back clean (no findings, or only findings already explicitly rejected with reasons).

6. **Report** the final state: findings fixed, findings rejected + reasons, number of loop iterations.

7. **Hand off.** Next step is `/document`.

## Rules

- This step reviews the working diff pre-commit. Reviewing a GitHub PR is the built-in `/review`, a different tool.
- A clean review is a hard gate: no commit, no PR, until it passes.
