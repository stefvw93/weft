# Navigation Progress Bar

> **Status: disabled.** The bar is currently switched off via the
> `NAV_PROGRESS_ENABLED` flag in `src/app.ts` (visual polish pending) and its
> browser test is skipped. The spec below describes the intended behaviour once
> re-enabled.

## Overview

A global navigation progress indicator for the docs website: a thin fixed bar that
appears directly underneath the top bar while a deferred-commit navigation resolves
its lazy chunk and leaf effect. Driven entirely by the router's reactive
[`Router.navigating`](../../docs/how-to/show-navigation-progress.md) signal. The
website adds only the reader and the CSS.

The bar is mounted in the **root layout** (`src/app.ts`), not `DocsShell`, because
the navigation most likely to be slow is Home → docs (the first load of the shared
lazy `doc-page-impl` chunk) and `DocsShell` is not yet mounted during that
navigation. The root layout persists across every navigation.

## Acceptance criteria

- **AC1: always present.** `#nav-progress` is rendered by the root layout on every
  page (Home and docs), carries `aria-hidden="true"`, and is non-interactive
  (`pointer-events: none`).
- **AC2: tracks the signal.** During a navigation with real async work the element
  carries the `is-navigating` class; at rest and after commit it carries only
  `nav-progress`.
- **AC3: positioned under the top bar.** Fixed at `top: var(--top-bar-height)`,
  full viewport width, stacked above the sticky top bar's `z-10`. Styled with
  inline Tailwind utilities (like the rest of the site) using the DaisyUI
  `primary` theme color; `nav-progress` / `is-navigating` are semantic test
  hooks, not styled classes. Only the slide keyframes live in `app.css`
  (registered in `@theme` as the `animate-nav-progress` utility).
- **AC4: anti-flash.** The reveal is delayed (`delay-150` + `duration-0`
  transition), so navigations that resolve near-instantly never flicker the bar.
  The class still flips (observable by tests); only the paint is delayed.
- **AC5: reduced motion.** Under `prefers-reduced-motion: reduce`
  (`motion-reduce:` variants) the indeterminate slide animation is disabled; a
  static full-width bar shows instead.
- **AC6: SSR safe.** The server's `navigating` is a constant `Idle`, so SSR emits
  the idle class and hydration is mismatch-free.
