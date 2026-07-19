# Code block component spec

## Overview & purpose

Shared presentation for a highlighted, copyable code pane. Used by `render-hast`
for plain fenced code and by the `demo` component for the code half of a live demo.
Highlighting is **already baked** into the hast at build time (Shiki); this
component only wraps and adds chrome (language label, copy button).

## Public surface

```ts
export const CodeBlock: (props: {
  tokens: Renderable[]; // pre-highlighted hast children, rendered via renderHast
  lang?: string; // language label (e.g. "ts")
  raw: string; // raw source text, for the copy button
}) => Node;
```

## Behaviour

- Renders `pre > code` containing the highlighted `tokens` with Shiki token
  classes preserved.
- Shows an optional language label (top-right) and a copy button.
- Copy button uses a declarative Effect-returning handler (no try/catch);
  copies `raw` to the clipboard and shows a transient "Copied" state via a stream.
- On the **server** the copy button renders inert (no clipboard); it activates on
  hydrate. Server and client markup must be identical (button present in both).

## Acceptance criteria

- AC1: Renders highlighted tokens identically on server and client (no mismatch).
- AC2: Language label shows when `lang` is provided, hidden otherwise.
- AC3: After hydrate, clicking copy writes `raw` to the clipboard and shows a
  transient confirmation, then reverts.
- AC4: Copy handler failures (clipboard denied) are handled via Effect, surfaced
  as a non-fatal state. They do not crash the page.

## Edge cases

- Empty `raw` → copy button disabled/no-op.
- Very long lines → horizontal scroll within the pane (utilities), no layout break.

## Styling & test hooks

- Styled with Tailwind utilities + DaisyUI (`btn btn-ghost btn-xs` for copy); no
  bespoke CSS. The root `<figure>` carries `not-prose` so the Typography plugin
  never restyles the pane and Shiki inline token colors survive.
- Semantic (non-styling) hooks for tests: `code-block` on the root `<figure>`,
  `code-block-lang` on the language `<span>`. The copy button is selected via its
  stable `aria-label="Copy code"`; the code itself via the `<pre>`/`<code>` tags.
