# hast → Weft renderer — spec

## Overview & purpose

The single bridge between parsed markdown and Weft. A **pure** function that walks
a serialized `hast` tree (from the doc model) and emits Weft `Renderable[]` built
with `h.*` and `h.fragment`. Weft has no raw-HTML node, so this mapper is how
documentation markup becomes real DOM. It runs identically on server and client
(depends only on the bundled doc model → identical trees → flash-free hydrate).

## Public surface

```ts
export const renderHast: (node: HastNode) => Renderable[];
```

- Element node → `h[tagName](mappedProps, renderChildren(children))`.
- Text node → the string value.
- Root / fragment → `h.fragment(children)`.

## Behaviour

- **Tag allowlist.** Only render a known-safe set of element tags (headings,
  `p`, `a`, `ul`/`ol`/`li`, `pre`/`code`, `blockquote`, `em`/`strong`/`del`,
  `hr`, `br`, `img`, `table`/`thead`/`tbody`/`tr`/`th`/`td`, `span`, `div`). Any
  tag not in the allowlist is skipped (children still rendered) — defense in depth
  even though input is our own docs.
- **Property mapping.** hast `properties` → Weft props: `className` (array) →
  `class` (joined string), `id`, `href`, `src`, `alt`, `title`, `colSpan`/`rowSpan`,
  `data-*`. Drop event-handler-like or unknown props. Never map `dangerouslySet*`.
- **Code blocks.** A `pre > code` produced by Shiki is rendered through the shared
  `code-block` component (`src/components/code-block.ts`) so styling/copy behaviour
  is consistent.
- **Live demo interception.** When a code block carries `demo=<id>` (per
  markdown-loader AC6), render the `demo` component (`src/components/demo.ts`)
  instead of a plain code block, passing the highlighted code + the demo `id`.

## Acceptance criteria

- AC1: Given a hast tree, returns Weft nodes that render to DOM matching the
  markdown structure (paragraphs, lists, links, emphasis, tables, images).
- AC2: Element `className` arrays become a single space-joined `class` string.
- AC3: Anchor `href` and image `src`/`alt` are preserved.
- AC4: Code blocks render via the shared `code-block` component with the
  Shiki-highlighted token markup intact.
- AC5: A `demo=<id>` code block renders the live `demo` component (code + preview),
  not a plain code block.
- AC6: Disallowed tags (`script`, `style`, `iframe`, unknown) are skipped without
  throwing; their text children still render.
- AC7: The function is pure and deterministic — same input → same output — so
  server and client produce identical trees (covered by a hydration test).
- AC8: Empty tree → empty `Renderable[]`.

## Edge cases

- Deeply nested inline formatting (e.g. `**[link](x)**`) renders correctly.
- Self-closing elements (`img`, `hr`, `br`) render with no children.
- Missing/empty `properties` → element rendered with no props.

## Type tests (`__type-tests__/render-hast.tst.ts`)

- `renderHast` accepts `HastNode` and returns `Renderable[]`.
