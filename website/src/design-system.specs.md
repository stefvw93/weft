# Weft website design system spec (Tailwind utilities + DaisyUI + Radix Colors)

## Overview & purpose

The website is styled **utility-first**: Tailwind v4 utilities + DaisyUI
components, driven by **Radix Colors** (Indigo accent + Slate gray, **dark scale
only**) mapped per the Radix
[palette-composition](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette)
step-role model. `src/app.css` holds **only** the token/plugin config. No
component CSS.

There is **no hand-written BEM CSS**. An earlier iteration paired bespoke
`.block__element--modifier` rules with sporadic DaisyUI usage; that hybrid left
two class systems fighting and is gone. Layout, spacing, color, and state are all
expressed as utilities on the elements themselves; DaisyUI supplies the
`weft-dark` theme tokens and the `btn`/`card`/`input` components; the Tailwind
**Typography** plugin styles class-less markdown prose.

## Design principles

- **Utility-first, no component CSS.** Components carry Tailwind utility strings.
  `app.css` is just `@import "tailwindcss"`, the Radix `@import`s, the DaisyUI
  plugin + `weft-dark` theme, the Typography plugin, and the `@theme` block. No
  bespoke rules, no `@media` blocks (use responsive prefixes like `lg:` / `max-lg:`).
- **Radix step roles are the source of truth.** Each 12-step scale has fixed UI
  roles. Map by role (table below); don't invent contrast pairings.
- **Radix steps exposed as color utilities.** The `@theme` block re-exports the
  raw Radix steps as `--color-slate-1..12` / `--color-indigo-1..12`, so
  `bg-slate-2`, `border-slate-6`, `text-indigo-11` resolve to the dark scale.
  Only slate + indigo are exposed as utilities; other scales (amber for the demo
  warning) are referenced via their raw `var(--amber-*)` in arbitrary values.
- **CSS-first plugin config, additive.** Tailwind v4 has no
  `tailwind.config`/`postcss.config`; DaisyUI, the Radix scales, and Typography
  register via `@plugin`/`@import` inside `app.css`. `tailwindcss()` must stay in
  **both** vite configs (client + SSR) so `@import`/`@plugin` resolve in the SSR
  build.
- **Contained blast radius.** All theme config flows through `app.css` (dev module
  graph, prod manifest `css[]` → hashed `<link>`). The only non-CSS theme touch is
  the `<html class="dark" data-theme="weft-dark">` attribute in `shell.ts`.
- **Semantic test hooks, not BEM.** Elements a test selects carry a **short
  semantic class** that carries no styling (utilities do that), e.g. `code-block`,
  `demo-block`, `demo-preview`, `demo-code`, `counter-value`, `demo-input-field`,
  `docs-shell`, `docs-nav-link`, `docs-prevnext`, `prevnext-prev`/`prevnext-next`,
  `home-demo`, `home-teaser`. Or they lean on a semantic attribute (`aria-current`,
  `role="alert"`, `aria-label`, `href`, or the element tag). No `__`/`--` names.

## Radix step-role → token mapping (dark scale)

Role reference (per composing-a-palette):

| Steps | Role                            |
| ----- | ------------------------------- |
| 1–2   | app / subtle backgrounds        |
| 3–5   | component bg / hover / active   |
| 6–8   | borders, separators, focus ring |
| 9–10  | solid fills / hover             |
| 11–12 | low- / high-contrast text       |

DaisyUI semantic tokens (theme `weft-dark`, Indigo + Slate):

| DaisyUI token             | Source        | Rationale                                                           |
| ------------------------- | ------------- | ------------------------------------------------------------------- |
| `--color-base-100`        | `--slate-1`   | app background                                                      |
| `--color-base-200`        | `--slate-2`   | subtle surface                                                      |
| `--color-base-300`        | `--slate-3`   | raised/hover surface                                                |
| `--color-base-content`    | `--slate-12`  | body text                                                           |
| `--color-neutral`         | `--slate-4`   | neutral surface/button                                              |
| `--color-neutral-content` | `--slate-12`  | text on neutral                                                     |
| `--color-primary`         | `--indigo-9`  | solid accent (buttons/links)                                        |
| `--color-primary-content` | `white`       | indigo-9 pairs with white                                           |
| `--color-secondary`       | `--indigo-10` | hover/secondary solid                                               |
| `--color-accent`          | `--indigo-11` | accent text/emphasis                                                |
| `--color-info`            | `--blue-9`    | semantic                                                            |
| `--color-success`         | `--green-9`   | semantic                                                            |
| `--color-warning`         | `--amber-9`   | amber-9 needs dark text → `--color-warning-content: var(--slate-1)` |
| `--color-error`           | `--red-9`     | semantic                                                            |

Utilities use the exposed steps directly: borders `border-slate-6`/`-7`, muted
text `text-slate-11`, headings/body `text-slate-12`, links/accent `text-indigo-11`,
active-nav background `bg-indigo-4`.

## Technical requirements

- **Deps** (`website/package.json` devDependencies): `daisyui` (v5),
  `@radix-ui/colors`, `@tailwindcss/typography`. Install via `vp install`.
- **`app.css` structure** (in order, and nothing else):
  1. `@import "tailwindcss";`
  2. Radix dark scales:
     `@import "@radix-ui/colors/{slate,indigo,blue,green,amber,red}-dark.css";`
  3. `@plugin "daisyui";` + `@plugin "daisyui/theme" { name: "weft-dark";
default: true; color-scheme: dark; … }` (semantic mapping above).
  4. `@plugin "@tailwindcss/typography";` (class-less markdown prose).
  5. `@theme { --color-slate-1..12, --color-indigo-1..12 … }` exposing raw steps
     as utilities.
- **Radix dark caveat:** `*-dark.css` scope their vars to `.dark, .dark-theme`
  (not `:root`). `<html>` must therefore carry `class="dark"`.
- **`shell.ts`:** `<html>` carries `class="dark"` + `data-theme="weft-dark"`. No
  other shell edits.
- **Components (utility-first + DaisyUI):**
  - `routes/home.ts`: CTAs → `btn btn-primary` / `btn btn-outline`;
    differentiator cards → `card bg-base-200`; hero/demo/footer via utilities.
  - `layouts/docs-shell.ts`: topbar, sidebar nav, TOC, prev/next, and the grid
    body are all utilities; search → `input input-bordered input-sm`, GitHub link
    → `btn btn-ghost btn-sm`. The DaisyUI `navbar` class is **not** used (see
    "Sticky nav" below). Markdown content uses `prose prose-invert max-w-none`
    with `prose-a:text-indigo-11` + `prose-headings:scroll-mt-20`.
  - `components/code-block.ts`, `components/demo.ts`, `demos/*`: utilities; copy
    button → `btn btn-ghost btn-xs`. `CodeBlock`/`Demo` roots carry `not-prose`
    so the Typography plugin never restyles Shiki tokens or the demo chrome.
- Keep Shiki `github-dark` for code (already dark, harmonizes with slate).

## Sticky nav

The topbar is full-bleed (background + bottom border) and sticky, its **inner
row** exactly `h-[3.25rem]`, capped at `max-w-[84rem]` and sharing the body's
`px-5` so the brand aligns with the content column's left edge. The sidebar and
TOC stick at `top-[4.75rem]` (= 3.25rem bar + 1.5rem body top padding); with the
bar exactly 3.25rem the natural offset equals the sticky offset, so nothing jumps
on scroll. DaisyUI's `navbar` (`min-height: 4rem`) is deliberately avoided. That
bleed was the cause of the original jump.

## Acceptance criteria

- AC1: `<html>` renders with `class="dark" data-theme="weft-dark"`; the computed
  page background resolves to `--slate-1` (dark).
- AC2: `app.css` contains **no** component CSS, only `@import`/`@plugin`/`@theme`
  config. No BEM (`__`/`--`) class strings anywhere in `app.css` or `src/**/*.ts`.
- AC3: DaisyUI is active. `btn`/`card`/`input` classes produce styled output;
  landing CTAs are `btn btn-primary` (indigo solid, white text).
- AC4: Semantic tokens map to the Radix steps in the table; primary = indigo-9,
  base-100 = slate-1, borders = slate-6/7, links = indigo-11.
- AC5: `warning` uses dark foreground (`--color-warning-content: var(--slate-1)`);
  the demo warning pane tints via the Radix amber vars and stays legible.
- AC6: Markdown prose is styled by the Typography plugin (`prose prose-invert`);
  `CodeBlock`/`Demo` opt out via `not-prose` and keep their own styling.
- AC7: Sticky topbar/sidebar/TOC don't jump on scroll; the topbar brand aligns
  with the content column's left edge.
- AC8: Elements under test are selected via semantic classes/attributes (no BEM);
  active links via `aria-current="page"`. Any hook change updates the co-located
  `.test.ts` in the same change.
- AC9: No hydration mismatch, no unstyled flash; server and client trees
  identical (theme comes from CSS + a static `<html>` attribute).
- AC10: `vp run check`, `vp run test`, `vp run test:browser` all pass.
- AC11: Prod parity. `vp run build` + `NODE_ENV=production node server.ts`
  serve the hashed `app.css` (manifest `css[]`) with theme identical to dev.

## Critical files

- `website/package.json`: `daisyui`, `@radix-ui/colors`, `@tailwindcss/typography`
- `website/src/app.css`: token/plugin config only (no component CSS)
- `website/src/layouts/shell.ts`: `class="dark"` + `data-theme` on `<html>`
- `website/src/layouts/docs-shell.ts`: topbar/grid/nav/TOC/prevnext utilities +
  sticky-nav fix + prose/`not-prose`
- `website/src/components/code-block.ts`, `components/demo.ts`, `demos/*`: utilities
- `website/src/routes/home.ts`: utilities + DaisyUI `btn`/`card`
- `website/src/app.ts`: 404 `notFound` utilities

## Out of scope

- Light theme + theme toggle (Radix light scales ready to add later).
- Client-side search (still inert placeholder).
- Restyling Shiki token colors (keep `github-dark`).

## Verification

1. `vp install`.
2. `cd website && vp run dev` → `http://localhost:3000`: dark theme, indigo
   accents, slate surfaces, prose readable, code/demos styled (not restyled by
   prose), sticky nav with no jump.
3. `vp run check` (repo root, packs first) → clean.
4. `vp run test` → node/jsdom green (incl. re-anchored class/aria asserts).
5. `vp run test:browser` → `website.browser.test.ts` green (counter, hydration).
6. `grep -nE '__|--[a-z]' website/src/app.css` and `grep -rn '__' website/src/**/*.ts`
   → no BEM class strings remain.
7. `cd website && vp run build && NODE_ENV=production node server.ts` → prod
   parity, hashed CSS linked.
8. `graphify update .` to refresh the knowledge graph.
