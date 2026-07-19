---
name: "e2e"
description: "Step 6 of the Weft TDD workflow. Use after /implement is green: writes *.browser.test.ts real-browser tests (Vitest browser mode + Playwright via vp run test:browser). Mandatory for every touched examples/* app; for package features only when behavior is browser-observable, otherwise records an explicit skip in specs.md."
---

# /e2e: Real-browser tests (TDD step 6)

Assert the feature's behavior in a real Chromium browser, or record an explicit, reasoned skip.

## When to run

- **Previous step:** `/implement` (`vp run check` and `vp run test` green).
- **Next step:** `/review-step`.
- **Gate:** every touched `examples/*` app has a passing co-located `*.browser.test.ts`; package features either have browser coverage or an explicit `e2e: not applicable, <reason>` line in `specs.md`. Silent skips are forbidden.

## Scope rule

- **`examples/*` app touched or created → mandatory.** Every example must have at least one co-located `*.browser.test.ts` that imports `App`, mounts it in a real browser, and asserts the example's headline behavior.
- **Package feature (`packages/*`) → conditional.** Required when behavior is browser-observable and jsdom cannot faithfully reproduce it: DOM rendering, hydration against a real parser, real event dispatch, layout. Pure type-level or logic-level features skip with a recorded reason in `specs.md`:

  ```markdown
  e2e: not applicable, <one-line reason>
  ```

## Procedure

1. **Decide scope** per the rule above; record the skip in `specs.md` if not applicable, report it, and hand off.

2. **Write the test file:** `*.browser.test.ts` (or `.tsx`), co-located. Conventions (see `e2e/specs.md` for full detail):
   - Import test globals from `vite-plus/test`, **never** from `vitest` directly.
   - Example tests import `App` from the side-effect-free `app.ts` and mount it into their own container, with no dev server dependency.
   - Browser files are excluded from the default `vp run test` and picked up only by the browser config.

3. **Known pitfalls** (each has bitten before):
   - **Post-mount render tick:** the mounted tree is appended a tick *after* `mount`'s Effect resolves. Assert initial state with `vi.waitFor`, never synchronously.
   - **Ref observers:** to run an effect when a `ref`'s element mounts, fork the `ref.changes` observer with `Effect.forkScoped`, not bare `Effect.forkChild`. A bare fork binds to the transient component-body fiber and is interrupted under an isolated `mount` (see `examples/element-ref`).
   - **Missing example CSS:** the test page has none of the example's `index.html` CSS. Do not assert layout-derived pixel values.

4. **Run:** `vp run test:browser` (packs first, then runs all `*.browser.test.*` in headless Chromium). Must be green.

5. **Hand off.** Next step is `/review-step`.

## Rules

- Browser tests assert user-observable behavior, not implementation internals.
- A failing browser test that exposes a spec/mock problem triggers the pause rule: back up the cycle, don't patch around it.
