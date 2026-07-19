# Weft website overview spec

## Overview & purpose

The Weft website is the public **intro + documentation** site for the Weft UI
library. It is itself **built with Weft** (dogfooding: `@weftui/core`,
`@weftui/dom`, `@weftui/router`, Effect, Tailwind v4, custom Node `server.ts`,
split client/server Vite builds). It serves three audiences in one site:

1. **Newcomers**: a landing page that states the value proposition and proves it
   with a live demo.
2. **Learners**: guides + concept docs in a defined learning order.
3. **Reference users**: per-package API reference.

Tagline: **"Reactive UI, woven from Effect."**

## Design principles

- **Single source of truth for prose.** All long-form content lives in repo
  `docs/**/*.md`. The site renders that markdown; it does not duplicate prose.
- **Build-time doc model.** Markdown is parsed at build time into a
  JSON-serializable model so server and client render byte-identical trees and
  hydration is flash-free. No markdown/highlighter code ships in the client bundle.
- **Real markup, not injected HTML.** Weft has no raw-HTML node, so markdown is
  rendered as real `h.*` Weft nodes via a `hast → Weft` mapper.
- **Live demos.** Code examples can mount real, interactive Weft components inline
  (they are ordinary subtrees of the one hydrated page tree).
- **Minimal technical aesthetic.** Dense, dev-focused, sidebar nav, mono code
  accents, an Effect/Vite-docs feel.

## Module map (each has its own specs.md)

| Module               | Path                           | Responsibility                                    |
| -------------------- | ------------------------------ | ------------------------------------------------- |
| Markdown loader      | `src/lib/markdown-loader.ts`   | Build-time `.md` → doc model.                     |
| hast → Weft renderer | `src/lib/render-hast.ts`       | Doc model `hast` → `h.*` nodes.                   |
| Nav manifest         | `src/lib/nav.ts`               | Aggregate doc frontmatter → grouped nav.          |
| Demo registry        | `src/demos/index.ts`           | `id → () => Node` live-demo lookup.               |
| Code block           | `src/components/code-block.ts` | Highlighted, copyable code pane.                  |
| Demo block           | `src/components/demo.ts`       | Code pane + live preview pane.                    |
| Docs shell           | `src/layouts/docs-shell.ts`    | Sidebar + content + TOC layout.                   |
| Doc routes           | `src/routes/docs.ts`           | `/docs/:category/:slug` → DocPage (all sections). |
| Landing              | `src/routes/home.ts`           | Marketing home with live hero demo.               |
| Document shell       | `src/layouts/shell.ts`         | `<html>` head/meta per route.                     |

## Frontmatter contract (added to `docs/**/*.md`)

```yaml
---
title: Getting Started # sidebar + <title> + nav link text
order: 1 # sort within its group
section: tutorial # nav group: tutorial | how-to | explanation | reference
description: ... # meta description / og
---
```

- `title` **required**. `order` defaults to `Infinity` (sorts last) if absent.
- `section` defaults to the doc's directory name (`tutorial`/`how-to`/`explanation`/`reference`).
- Backfill all existing `docs/**/*.md`. The order in `docs/index.md`'s learning
  list is the authoritative ordering to encode.

## Top-level acceptance criteria

- AC1: Visiting `/` renders the landing page with a working live demo after hydrate.
- AC2: Every `docs/**/*.md` is reachable at `/docs/:section/:slug` and renders its
  prose, headings, links, and highlighted code.
- AC3: Each package (`core`, `dom`, `router`) reference doc is reachable under
  `/docs/reference/:pkg`, the same uniform route as every other section.
- AC4: Sidebar nav is generated from frontmatter (no hand-maintained list),
  grouped by `section`, ordered by `order`, with the current page highlighted.
- AC5: Server and client produce identical trees, with no `HydrationMismatchError`,
  no visible flash on any page.
- AC6: An unknown doc slug renders the 404 fallback.
- AC7: `vp run check` and `vp run test` pass; a `*.browser.test.ts` covers a
  DocPage render and a live-demo interaction.
- AC8: `vp run -F website build` + `start` serve all routes in production.

## Out of scope (v1)

Client-side search, dark mode, wiring the 12 `examples/*` `App`s into demos,
extracting the loader into `@weftui/vite`. See plan "Open follow-ups".
