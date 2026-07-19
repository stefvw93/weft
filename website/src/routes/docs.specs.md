# Doc routes spec

## Overview & purpose

Routes and the `DocPage` component that render guide/concept documentation from the
build-time doc model. Mounted under the `DocsShell` layout.

## Routes

- `/docs` → alias/redirect to `firstDocPath` (the tutorial's first step).
- `/docs/:category/:slug` → `DocPage`: look up `getDoc(category, slug)`; render its
  `tree` via `renderHast`. Unknown `(category, slug)` → router `notFound` (404).

Uses `@weftui/router` `Router.route`, type-safe params, under the `DocsShell`
`Router.layout`.

## DocPage behaviour

- Renders the doc title (`frontmatter.title`) as the page `h1` if the markdown does
  not already start with one (avoid duplicate titles; prefer the markdown's own
  `h1` when present).
- Renders the doc body via `renderHast(doc.tree)`.
- Sets the document `<title>` and meta description from frontmatter (via the
  document shell mechanism in `src/layouts/shell.ts`).

## Acceptance criteria

- AC1: `/docs/tutorial/01-your-first-app` renders the first tutorial step's prose,
  headings, links, and highlighted code.
- AC2: `/docs` redirects/aliases to the first doc.
- AC3: Unknown slug → 404 fallback.
- AC4: Relative inter-doc markdown links resolve to site routes and navigate via
  the router (no full page reload).
- AC5: Live demos referenced in the doc render and hydrate (see demo specs).
- AC6: `<title>`/meta reflect the doc's frontmatter.
- AC7: SSR + hydrate produce identical trees (no mismatch, no flash).

## Edge cases

- A category that exists but slug that doesn't → 404 (not a blank page).
- Every section (tutorial, how-to, explanation, reference) is served here through
  the single `/docs/:category/:slug` route; there is no separate `/api` route.
