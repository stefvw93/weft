# Docs shell layout spec

## Overview & purpose

The persistent chrome around every documentation page: top bar, left sidebar nav,
center content column, right "On this page" TOC, and prev/next footer. Implemented
as a `Router.layout` so it stays mounted across doc-to-doc navigations (sidebar
state and scroll persist); the page content fills `Router.Outlet`.

## Public surface

```ts
export const DocsShell: LayoutNode; // Router.layout(...) wrapping doc routes
```

## Regions

- **Top bar**: Weft wordmark (link to `/`), version label (latest git release tag,
  injected at build time via Vite `define`; see `website/build-version.ts`), GitHub
  link, search placeholder (inert in v1).
- **Sidebar (left)**: grouped nav from `navGroups` (`src/lib/nav.ts`). Current page
  highlighted (derived from current route). Groups labelled (Guides, Concepts,
  API Reference).
- **Content (center)**: `Router.Outlet`, the DocPage for the matched route.
- **TOC (right)**: "On this page" from the current doc's `headings` (h2–h3).
  Hidden on narrow viewports.
- **Footer**: prev/next links from `findNav(currentPath)`.

## Behaviour

- Current-page highlight + TOC + prev/next derive from the **current route path**,
  read reactively (router navigation updates them without remount).
- All internal links use type-safe `href` from `@weftui/router`; link clicks are
  intercepted by `RouterLive` (client) for SPA navigation.

## Acceptance criteria

- AC1: Sidebar renders all nav groups/links from the manifest, in order.
- AC2: The link matching the current route is visibly marked active.
- AC3: TOC lists the current page's h2–h3 headings with working anchor links.
- AC4: Prev/next footer matches `findNav`; absent at the ends of the doc list.
- AC5: Navigating between docs updates content, active link, TOC, and prev/next
  **without** unmounting the shell (layout persists).
- AC6: Renders identically under SSR and hydrate (no mismatch).

## Edge cases

- A doc with no h2/h3 headings → TOC region empty/hidden, no error.
- Narrow viewport (below `lg`) → grid collapses to a single column, sidebar/TOC
  drop their sticky/scroll behaviour, and the TOC is hidden (`max-lg:hidden`).

## Styling & test hooks

- Styled with Tailwind utilities + DaisyUI (`input`/`btn`); no bespoke CSS. The
  content `<article>` uses the Typography plugin (`prose prose-invert`), with
  `prose-a:text-indigo-11` and `prose-headings:scroll-mt-20` (anchor offset under
  the sticky bar). `CodeBlock`/`Demo` opt out via `not-prose`.
- **Sticky nav**: the topbar is full-bleed and sticky, its inner row exactly
  `3.25rem` tall and capped at `max-w-[84rem]` sharing the body's `px-5` so the
  brand aligns with the content column. Sidebar/TOC stick at `top-[4.75rem]`
  (= 3.25rem bar + 1.5rem body top padding); the natural offset equals the sticky
  offset, so nothing jumps on scroll. The DaisyUI `navbar` class is **not** used
  (its `min-height: 4rem` caused the jump).
- Semantic (non-styling) hooks for tests: `docs-shell` (root), `docs-nav-link`
  (sidebar links), `docs-prevnext` (footer root) + `prevnext-prev`/`prevnext-next`.
  Active links are marked with `aria-current="page"`; the brand via its `href="/"`.
