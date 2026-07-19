/**
 * Build-time markdown loader.
 *
 * Turns a repo `docs/**\/*.md` source string into a JSON-serializable **doc model**
 * (`DocModel`): parsed frontmatter, a TOC heading list, and a serialized `hast`
 * tree whose fenced code blocks are already Shiki-highlighted. Because the model is
 * baked at build time, the server and client render byte-identical trees (flash-free
 * hydration) and no markdown/highlighter code ships to the browser.
 *
 * `parseDoc` is the pure unit; the Vite plugin in `docs-plugin.ts` calls it for every
 * doc and exposes the results through the `virtual:weft-docs` module.
 */

import { basename, dirname, extname, relative, resolve as resolvePosix } from "node:path/posix";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { codeToHast } from "shiki";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";

/** The Shiki theme for every highlighted code block: configured in exactly one place. */
export const SHIKI_THEME = "github-dark";

/** GitHub base for doc links that escape the docs tree (e.g. `examples/`, `packages/`). */
export const GITHUB_REPO_BASE = "https://github.com/stefvw93/weft";

/** A serialized hast property value (JSON-safe subset). */
export type HastPropertyValue = string | number | boolean | (string | number)[];

/** Serialized hast `properties` map (hast camelCase keys, e.g. `className`, `dataDemo`). */
export type HastProperties = Record<string, HastPropertyValue>;

/** A serialized hast element node (the only container kind the renderer emits). */
export type HastElement = {
  readonly type: "element";
  readonly tagName: string;
  readonly properties: HastProperties;
  readonly children: readonly HastNode[];
};

/** A serialized hast text node. */
export type HastText = {
  readonly type: "text";
  readonly value: string;
};

/** A serialized hast document root. */
export type HastRoot = {
  readonly type: "root";
  readonly children: readonly HastNode[];
};

/** The serializable hast shape the renderer consumes: elements, text, and root only. */
export type HastNode = HastElement | HastText | HastRoot;

/** A heading entry for the "On this page" table of contents. */
export type DocHeading = {
  readonly depth: number;
  readonly id: string;
  readonly text: string;
};

/** Parsed, validated doc frontmatter. */
export type DocFrontmatter = {
  readonly title: string;
  readonly order: number;
  readonly section: string;
  readonly description?: string;
};

/** The build-time model for one `docs/**\/*.md` file. */
export type DocModel = {
  /** File basename without extension, e.g. `"getting-started"`. */
  readonly slug: string;
  /** Nav group, from `frontmatter.section` or the containing directory name. */
  readonly category: string;
  /** Route path within its section, e.g. `"tutorial/getting-started"`. */
  readonly path: string;
  readonly frontmatter: DocFrontmatter;
  readonly headings: readonly DocHeading[];
  readonly tree: HastRoot;
};

/**
 * The light per-doc record: a {@link DocModel} without its heavy `tree`. Powers nav,
 * routing, the TOC, and per-route `<title>`/meta (everything except rendering the doc
 * body), so it can ship to the client for **every** doc while each `tree` stays a lazy
 * per-doc chunk (see `docs-split.specs.md`).
 */
export type DocMeta = Omit<DocModel, "tree">;

/** Element tags dropped wholesale (content and all): defense in depth; our docs never emit them. */
const DROPPED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "base"]);

/** Heading tags captured for the TOC. */
const HEADING_DEPTH: Record<string, number> = { h2: 2, h3: 3, h4: 4 };

// Loosely-typed unist/hast nodes: library interop, so `any`-ish access is acceptable here.
type AnyNode = {
  type: string;
  value?: string;
  tagName?: string;
  lang?: string | null;
  meta?: string | null;
  properties?: Record<string, unknown>;
  data?: { hProperties?: Record<string, unknown> };
  children?: AnyNode[];
};

/** Concatenates every descendant text value of a hast node. */
function textOf(node: AnyNode): string {
  if (node.type === "text") return node.value ?? "";
  if (!node.children) return "";
  let out = "";
  for (const child of node.children) out += textOf(child);
  return out;
}

/** Extracts the `language-xxx` token from a hast `className` array, if present. */
function classLang(properties: Record<string, unknown> | undefined): string | undefined {
  const className = properties?.["className"];
  if (!Array.isArray(className)) return undefined;
  for (const token of className) {
    if (typeof token === "string" && token.startsWith("language-"))
      return token.slice("language-".length);
  }
  return undefined;
}

/**
 * Replaces every `pre > code` block with Shiki-highlighted hast at build time. The
 * raw source, language, and any `demo=<id>` marker (stashed onto the `<code>` element
 * earlier) are carried onto the highlighted `<pre>` as `dataRaw`/`dataLang`/`dataDemo`
 * so the renderer can build copy buttons and live demos. Unknown languages degrade to
 * a plain (un-highlighted) block rather than failing the build.
 */
async function highlightCodeBlocks(tree: AnyNode): Promise<void> {
  const jobs: Promise<void>[] = [];
  visit(tree as never, "element", (node: AnyNode, index, parent: AnyNode | undefined) => {
    if (node.tagName !== "pre" || !parent || index == null) return;
    const code = node.children?.find((c) => c.type === "element" && c.tagName === "code");
    if (!code) return;
    const props = code.properties ?? {};
    const raw =
      typeof props["dataRaw"] === "string" ? props["dataRaw"] : textOf(code).replace(/\n$/, "");
    const lang =
      (typeof props["dataLang"] === "string" ? props["dataLang"] : classLang(props)) ?? "";
    const demo = typeof props["dataDemo"] === "string" ? props["dataDemo"] : undefined;
    jobs.push(
      (async () => {
        const highlighted = await highlight(raw, lang);
        highlighted.properties = {
          ...highlighted.properties,
          dataLang: lang,
          dataRaw: raw,
          ...(demo === undefined ? {} : { dataDemo: demo }),
        };
        parent.children![index] = highlighted;
      })(),
    );
  });
  await Promise.all(jobs);
}

/** Highlights one block, falling back to a plain `<pre><code>` for empty/unknown languages. */
async function highlight(raw: string, lang: string): Promise<AnyNode> {
  if (lang !== "") {
    try {
      const root = (await codeToHast(raw, { lang, theme: SHIKI_THEME })) as unknown as AnyNode;
      const pre = root.children?.find((c) => c.type === "element" && c.tagName === "pre");
      if (pre) return pre;
    } catch {
      // fall through to the plain block
    }
  }
  return {
    type: "element",
    tagName: "pre",
    properties: {},
    children: [
      {
        type: "element",
        tagName: "code",
        properties: {},
        children: [{ type: "text", value: raw }],
      },
    ],
  };
}

/**
 * Rewrites a relative doc link:
 * - inside the docs tree, `.md` → its site route (`/docs/<section>/<slug>`);
 * - escaping the docs tree (e.g. `examples/`, `packages/`) → an absolute GitHub URL on
 *   `main`, so it resolves on the deployed site instead of 404-ing (relative resolution
 *   only works on GitHub);
 * - anything else (protocol, `#anchor`, root-absolute, in-docs non-`.md`) is untouched.
 */
function rewriteHref(href: string, fileDir: string, docsRoot: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/"))
    return href;
  const hashAt = href.indexOf("#");
  const pathPart = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const targetAbs = resolvePosix(fileDir, pathPart);
  const relToDocs = relative(docsRoot, targetAbs);

  // Escapes the docs tree → absolute GitHub link (tree for dirs, blob for files).
  if (relToDocs.startsWith("..")) {
    const relToRepo = relative(dirname(docsRoot), targetAbs);
    const kind = extname(pathPart) === "" ? "tree" : "blob";
    return `${GITHUB_REPO_BASE}/${kind}/main/${relToRepo}${hash}`;
  }

  // Inside docs: only `.md` maps to a site route; other relatives are left alone.
  if (!pathPart.endsWith(".md")) return href;
  const section = dirname(relToDocs);
  const slug = basename(relToDocs, ".md");
  return `/docs/${section}/${slug}${hash}`;
}

/** Coerces a raw hast property value into the serializable subset, dropping anything else. */
function serializeProperties(properties: Record<string, unknown> | undefined): HastProperties {
  const out: HastProperties = {};
  if (!properties) return out;
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.filter(
        (v): v is string | number => typeof v === "string" || typeof v === "number",
      );
    }
  }
  return out;
}

/** Context threaded through serialization. */
type SerializeContext = {
  readonly fileDir: string;
  readonly docsRoot: string;
  readonly headings: DocHeading[];
};

/** Serializes a hast node to the minimal model, collecting headings and rewriting links en route. */
function serializeNode(node: AnyNode, ctx: SerializeContext): HastNode | undefined {
  if (node.type === "text") return { type: "text", value: node.value ?? "" };
  if (node.type === "root")
    return { type: "root", children: serializeChildren(node.children, ctx) };
  if (node.type !== "element" || node.tagName === undefined) return undefined;
  if (DROPPED_TAGS.has(node.tagName)) return undefined;

  const properties = serializeProperties(node.properties);

  if (node.tagName === "a" && typeof properties["href"] === "string") {
    properties["href"] = rewriteHref(properties["href"], ctx.fileDir, ctx.docsRoot);
  }

  const depth = HEADING_DEPTH[node.tagName];
  if (depth !== undefined && typeof properties["id"] === "string") {
    ctx.headings.push({ depth, id: properties["id"], text: textOf(node).trim() });
  }

  return {
    type: "element",
    tagName: node.tagName,
    properties,
    children: serializeChildren(node.children, ctx),
  };
}

/** Serializes a child list, dropping nodes that map to nothing. */
function serializeChildren(children: AnyNode[] | undefined, ctx: SerializeContext): HastNode[] {
  if (!children) return [];
  const out: HastNode[] = [];
  for (const child of children) {
    const serialized = serializeNode(child, ctx);
    if (serialized !== undefined) out.push(serialized);
  }
  return out;
}

/** Builds the markdown processor: parse → frontmatter+gfm → capture → rehype → slug/anchors → highlight. */
function makeProcessor(captured: { frontmatter?: unknown }) {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(() => (tree: AnyNode) => {
      visit(tree as never, (node: AnyNode) => {
        if (node.type === "yaml") {
          captured.frontmatter = parseYaml(node.value ?? "");
          return;
        }
        if (node.type === "code") {
          const data = (node.data ??= {});
          const hProperties = (data.hProperties ??= {});
          if (typeof node.lang === "string" && node.lang !== "")
            hProperties["dataLang"] = node.lang;
          hProperties["dataRaw"] = node.value ?? "";
          const meta = node.meta ?? "";
          const match = /(?:^|\s)demo=(\S+)/.exec(meta);
          if (match) hProperties["dataDemo"] = match[1];
        }
      });
    })
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: "wrap" })
    .use(() => async (tree: AnyNode) => {
      await highlightCodeBlocks(tree);
    });
}

/** Validates captured frontmatter, applying the section/order defaults. */
function buildFrontmatter(raw: unknown, filePath: string, dirSection: string): DocFrontmatter {
  const fm = (raw ?? {}) as Record<string, unknown>;
  if (typeof fm["title"] !== "string" || fm["title"] === "") {
    throw new Error(`Missing required frontmatter "title" in ${filePath}`);
  }
  return {
    title: fm["title"],
    order: typeof fm["order"] === "number" ? fm["order"] : Infinity,
    section: typeof fm["section"] === "string" ? fm["section"] : dirSection,
    description: typeof fm["description"] === "string" ? fm["description"] : undefined,
  };
}

/**
 * Parses one markdown source string into a `DocModel`.
 *
 * Pure given its inputs (modulo the shared Shiki highlighter, which is deterministic),
 * so the same `(source, filePath, docsRoot)` always yields the same model: the basis
 * for identical server/client trees.
 *
 * @param source raw `.md` file contents
 * @param filePath absolute path of the file (drives `slug`, the section default, and link resolution)
 * @param docsRoot absolute path of the `docs/` root (drives inter-doc link rewriting)
 */
export async function parseDoc(
  source: string,
  filePath: string,
  docsRoot: string,
): Promise<DocModel> {
  const captured: { frontmatter?: unknown } = {};
  const processor = makeProcessor(captured);
  const hast = (await processor.run(processor.parse(source))) as AnyNode;

  const slug = basename(filePath, extname(filePath));
  const dirSection = basename(dirname(filePath));
  const frontmatter = buildFrontmatter(captured.frontmatter, filePath, dirSection);

  const headings: DocHeading[] = [];
  const ctx: SerializeContext = { fileDir: dirname(filePath), docsRoot, headings };
  const root = serializeNode(hast, ctx) as HastRoot;

  return {
    slug,
    category: frontmatter.section,
    path: `${frontmatter.section}/${slug}`,
    frontmatter,
    headings,
    tree: root,
  };
}
