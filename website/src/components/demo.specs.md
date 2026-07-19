# Demo block component spec

## Overview & purpose

Renders a **live demo**: a code pane plus a live preview pane that mounts the real
Weft component from the demo registry. Produced by `render-hast` when a fenced code
block carries `demo=<id>`.

## Public surface

```ts
export const Demo: (props: {
  id: string; // registry id, from `demo=<id>`
  tokens: Renderable[]; // highlighted code (for the code pane)
  lang?: string;
  raw: string;
}) => Node;
```

## Behaviour

- Two regions: a **preview** pane (renders `getDemo(id)()`) and a **code** pane
  (renders the shared `CodeBlock`).
- Layout shows preview first (the proof), code below/beside (minimal technical).
- If `id` is not in the registry, render the code pane plus a visible inline
  warning placeholder instead of throwing (so a typo in `demo=` degrades, doesn't
  break the build/page).
- The preview is a normal subtree: SSR-rendered and hydrated with the page; no
  separate mount.

## Acceptance criteria

- AC1: A `demo=<id>` block renders both a live preview and the code.
- AC2: The preview is the actual registry component and is interactive after
  hydrate (browser test asserts an interaction).
- AC3: Unknown `id` → code pane + warning placeholder, no throw, page still renders.
- AC4: Server and client trees identical → no hydration mismatch for the demo.

## Edge cases

- Multiple demos on one page → each gets an independent instance (registry returns
  a fresh `Node` per call).

## Styling & test hooks

- Styled with Tailwind utilities; no bespoke CSS. The two panes share one bordered
  container. The code pane flush-overrides the nested `CodeBlock` via
  `[&>.code-block]:*` variants. The warning tint uses the imported Radix amber vars
  (`bg-[var(--amber-3)]` …) since amber isn't exposed as a color utility.
- Semantic (non-styling) hooks for tests: `demo-block` (root), `demo-preview`
  (preview pane), `demo-code` (code pane). The warning is selected via its
  `role="alert"`. Demo previews expose their own hooks: `counter-value`
  (reactive-counter), `demo-input-field` (reactive-input).
