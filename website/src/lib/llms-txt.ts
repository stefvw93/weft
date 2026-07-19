/**
 * Builds the site's `/llms.txt`: the [llmstxt.org](https://llmstxt.org) index that lets
 * LLMs and agents discover the whole Weft documentation tree from one file.
 *
 * Pure over its inputs: given the parsed doc metadata (from `markdown-loader`) and the
 * canonical site base, it emits an H1 + summary followed by one section per doc category,
 * each a bullet list of absolute links with descriptions. The `weftDocs` build plugin
 * emits the result as `dist/client/llms.txt`; the dev server serves it on the fly.
 */

import type { DocMeta } from "./markdown-loader";

/** Canonical deployed site base: every link in `llms.txt` is absolute against it. */
export const SITE_BASE = "https://weftui.dev";

/** Doc categories in presentation order, with their `llms.txt` section headings. */
const SECTIONS: readonly { readonly key: string; readonly title: string }[] = [
  { key: "tutorial", title: "Tutorial" },
  { key: "how-to", title: "How-to guides" },
  { key: "explanation", title: "Explanation" },
  { key: "reference", title: "Reference" },
];

/** One doc's bullet line: `- [Title](https://weftui.dev/docs/<category>/<slug>): description`. */
function line(meta: DocMeta, siteBase: string): string {
  const url = `${siteBase}/docs/${meta.category}/${meta.slug}`;
  const desc = meta.frontmatter.description;
  return `- [${meta.frontmatter.title}](${url})${desc ? `: ${desc}` : ""}`;
}

/** Orders docs within a section by `frontmatter.order` (ascending), then title. */
function byOrder(a: DocMeta, b: DocMeta): number {
  return (
    a.frontmatter.order - b.frontmatter.order ||
    a.frontmatter.title.localeCompare(b.frontmatter.title)
  );
}

/** Renders one `## Heading` + its doc bullets, or `""` when the category has no docs. */
function section(title: string, docs: readonly DocMeta[], siteBase: string): string {
  if (docs.length === 0) return "";
  const body = [...docs]
    .sort(byOrder)
    .map((d) => line(d, siteBase))
    .join("\n");
  return `## ${title}\n\n${body}\n`;
}

/**
 * Builds the full `llms.txt` document from parsed doc metadata.
 *
 * @param metas every doc's metadata (a {@link DocMeta} per `docs/**\/*.md`)
 * @param siteBase canonical site origin the links resolve against (default {@link SITE_BASE})
 */
export function buildLlmsTxt(metas: readonly DocMeta[], siteBase: string = SITE_BASE): string {
  const known = new Set(SECTIONS.map((s) => s.key));
  const parts = [
    "# Weft",
    "",
    "> Reactive UI, woven from Effect. Weft is a reactive DOM library where every node is an Effect: components return `Node<E, R>`, streams drive all updates (no virtual DOM, no diffing), and the same tree renders to HTML on the server and hydrates in place on the client.",
    "",
    `This file indexes the Weft documentation for LLMs and coding agents. Every link is an absolute page on ${siteBase}.`,
    "",
  ];

  for (const { key, title } of SECTIONS) {
    const rendered = section(
      title,
      metas.filter((m) => m.category === key),
      siteBase,
    );
    if (rendered) parts.push(rendered);
  }

  const other = metas.filter((m) => !known.has(m.category));
  const rendered = section("Other", other, siteBase);
  if (rendered) parts.push(rendered);

  return `${parts.join("\n").trimEnd()}\n`;
}
