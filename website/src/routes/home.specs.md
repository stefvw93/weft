# Landing page spec

## Overview & purpose

The marketing home at `/`. States Weft's value proposition and proves it with a
live demo. Hand-authored Weft component (not markdown-sourced). Minimal technical
aesthetic, roughly one screen, dense.

## Sections

1. **Hero**: tagline ("Reactive UI, woven from Effect."), one-line value prop,
   primary CTA → Tutorial (`/docs/tutorial/01-your-first-app`), secondary →
   GitHub.
2. **Live hero demo**: a small interactive component from the demo registry
   (e.g. `reactive-counter`). It proves reactivity on the landing page itself.
3. **Differentiators row**: no virtual DOM / no diffing; no JSX / no build
   plugins; Effect-native (`E`/`R` channels); flash-free SSR + hydration.
4. **Code teaser**: a short, annotated `Component.gen` + stream snippet
   (via the shared `CodeBlock`, highlighted at build time).
5. **Footer**: links (docs, GitHub, API), early-development note.

## Acceptance criteria

- AC1: `/` renders hero, live demo, differentiators, code teaser, footer.
- AC2: The live hero demo is interactive after hydrate (browser test asserts an
  interaction changes the DOM).
- AC3: Primary CTA links to the tutorial; GitHub link present.
- AC4: SSR + hydrate identical (no mismatch, no flash).
- AC5: `<title>` and meta description set for the landing page.

## Notes

- Replaces the current placeholder `Home` route (`<h1>Home</h1>`).
- Uses the document shell (`src/layouts/shell.ts`) but **not** the DocsShell (no
  sidebar/TOC on the landing page).
