/**
 * Shared doc page renderer.
 *
 * Renders a `DocModel`'s body via `renderHast`, prepending the frontmatter title as
 * an `h1` only when the markdown does not already start with one (our docs do, so the
 * title is not duplicated). Used by both the doc routes and the api routes: API
 * reference is documentation with its own nav group, rendered the same way.
 */

import { h } from "@weftui/core";
import type { Node } from "@weftui/core";
import type { DocModel, HastRoot } from "./../lib/markdown-loader";
import { renderHast } from "./../lib/render-hast";

/** Whether the doc's first element child is an `h1` (so we don't add a duplicate title). */
function startsWithH1(tree: HastRoot): boolean {
  for (const child of tree.children) {
    if (child.type === "element") return child.tagName === "h1";
  }
  return false;
}

/** Renders one doc to a Weft node: its prose body, with a title `h1` only if missing. */
export function DocPage(doc: DocModel): Node {
  const body = renderHast(doc.tree);
  return startsWithH1(doc.tree)
    ? h.fragment(body)
    : h.fragment([h.h1(doc.frontmatter.title), ...body]);
}
