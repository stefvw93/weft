/**
 * Demo block component.
 *
 * Renders a **live demo**: a preview pane that mounts the real Weft component from
 * the demo registry, above a code pane (the shared `CodeBlock`). Produced by
 * `render-hast` when a fenced code block carries `demo=<id>`.
 *
 * The preview is an ordinary subtree of the page: SSR-rendered and hydrated with
 * everything else, no separate mount. An unknown `id` degrades to a visible inline
 * warning plus the code pane rather than throwing, so a typo in `demo=` never breaks
 * the build or the page.
 */

import { Component, h } from "@weftui/core";
import type { Renderable } from "@weftui/core";
import { getDemo } from "../demos/index";
import { CodeBlock } from "./code-block";

export type DemoProps = {
  /** Registry id, from the markdown `demo=<id>` marker. */
  readonly id: string;
  /** Pre-highlighted code children for the code pane. */
  readonly tokens: readonly Renderable[];
  /** Optional language label. */
  readonly lang?: string;
  /** Raw source for the code pane's copy button. */
  readonly raw: string;
};

/**
 * A live demo: preview pane (the registry component) over a code pane.
 *
 * @param props.id registry id; unknown ids render a warning instead of a preview
 */
export const Demo = Component.gen(function* (props: DemoProps) {
  const factory = getDemo(props.id);

  // Amber isn't exposed as a Tailwind color utility (only slate/indigo are), so
  // the warning tint references the imported Radix amber vars directly.
  const preview =
    factory === undefined
      ? h.div(
          {
            class:
              "border-b border-[var(--amber-7)] bg-[var(--amber-3)] px-4 py-3 text-[0.85rem] text-[var(--amber-11)]",
            role: "alert",
          },
          `Unknown demo: "${props.id}"`,
        )
      : h.div({ class: "demo-preview border-b border-slate-7 bg-slate-2 p-5" }, [factory()]);

  // `demo-block` is a semantic test hook. The code pane flush-overrides the nested
  // CodeBlock's own margin/border/radius so the two panes read as one container.
  return yield* h.div(
    { class: "demo-block my-5 overflow-hidden rounded-lg border border-slate-7" },
    [
      preview,
      h.div(
        {
          class:
            "demo-code [&>.code-block]:my-0 [&>.code-block]:rounded-none [&>.code-block]:border-0",
        },
        [CodeBlock({ tokens: props.tokens, lang: props.lang, raw: props.raw })],
      ),
    ],
  );
});
