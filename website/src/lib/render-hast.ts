/**
 * hast → Weft renderer.
 *
 * The single bridge between parsed markdown and Weft. A **pure** function that walks
 * a serialized `hast` tree (from the build-time doc model) and emits Weft
 * `Renderable[]` built with `h.*` and `h.fragment`. Weft has no raw-HTML node, so
 * this mapper is how documentation markup becomes real DOM. It runs identically on
 * server and client (it depends only on the bundled doc model), so server and client
 * trees match and hydration is flash-free.
 *
 * Code blocks are rendered through the shared `CodeBlock` component; a block carrying
 * a `demo=<id>` marker (as `dataDemo`) renders the live `Demo` component instead.
 */

import { h } from "@weftui/core";
import type { Renderable } from "@weftui/core";
import { CodeBlock } from "../components/code-block";
import { Demo } from "../components/demo";
import type { HastElement, HastNode, HastProperties } from "./markdown-loader";

/** Element tags the renderer is allowed to emit. Anything else is skipped (children kept). */
const ALLOWED_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "a",
  "ul",
  "ol",
  "li",
  "pre",
  "code",
  "blockquote",
  "em",
  "strong",
  "del",
  "hr",
  "br",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span",
  "div",
]);

/** hast property keys passed straight through to Weft props (value kept as-is). */
const PASSTHROUGH_PROPS = new Set(["id", "href", "src", "alt", "title", "style"]);

/** A loosely-typed element builder: `h.*` for an allowlisted tag. */
type ElementBuilder = (
  props: Record<string, unknown>,
  children: readonly Renderable[],
) => Renderable;

// `h` is a proxy whose properties are element builders; index it dynamically for the
// allowlisted tag names (library interop: the cast is the documented escape hatch).
const builders = h as unknown as Record<string, ElementBuilder>;

/** Converts a hast `dataFooBar` key to the `data-foo-bar` attribute name. */
function toDataAttr(key: string): string {
  return `data${key
    .slice(4)
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()}`;
}

/** Maps hast `properties` to Weft props, dropping anything unrecognized (defense in depth). */
function mapProps(properties: HastProperties): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (key === "className") {
      out["class"] = Array.isArray(value) ? value.join(" ") : String(value);
    } else if (key === "colSpan") {
      out["colspan"] = value;
    } else if (key === "rowSpan") {
      out["rowspan"] = value;
    } else if (PASSTHROUGH_PROPS.has(key)) {
      out[key] = value;
    } else if (key.startsWith("data") && key.length > 4) {
      out[toDataAttr(key)] = value;
    }
    // Everything else (event-handler-like, `dangerouslySet*`, unknown) is dropped.
  }
  return out;
}

/** Finds the `<code>` child of a `<pre>` produced by the highlighter, if present. */
function codeChild(node: HastElement): HastElement | undefined {
  for (const child of node.children) {
    if (child.type === "element" && child.tagName === "code") return child;
  }
  return undefined;
}

/** Reads a string property, or `undefined` if absent/empty/non-string. */
function stringProp(properties: HastProperties, key: string): string | undefined {
  const value = properties[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Renders a highlighted `<pre>` as a `CodeBlock`, or a `Demo` when it carries `dataDemo`. */
function renderCodeBlock(node: HastElement): Renderable {
  const code = codeChild(node);
  const tokens = code ? renderChildren(code.children) : [];
  const raw = typeof node.properties["dataRaw"] === "string" ? node.properties["dataRaw"] : "";
  const lang = stringProp(node.properties, "dataLang");
  const demo = stringProp(node.properties, "dataDemo");
  return demo === undefined
    ? CodeBlock({ tokens, lang, raw })
    : Demo({ id: demo, tokens, lang, raw });
}

/** Renders an element node to one-or-more Renderables. */
function renderElement(node: HastElement): Renderable[] {
  if (node.tagName === "pre" && codeChild(node) !== undefined) {
    return [renderCodeBlock(node)];
  }
  // Disallowed tag: skip the element but keep rendering its children.
  if (!ALLOWED_TAGS.has(node.tagName)) {
    return renderChildren(node.children);
  }
  return [builders[node.tagName]!(mapProps(node.properties), renderChildren(node.children))];
}

/** Renders a child list, flattening each child's Renderables. */
function renderChildren(children: readonly HastNode[]): Renderable[] {
  const out: Renderable[] = [];
  for (const child of children) out.push(...renderHast(child));
  return out;
}

/**
 * Renders a serialized hast node to Weft `Renderable[]`.
 *
 * - Text node → its string value.
 * - Element → `h[tagName](mappedProps, children)` (or `CodeBlock`/`Demo` for code).
 * - Root → a single `h.fragment` of its rendered children (empty tree → `[]`).
 */
export function renderHast(node: HastNode): Renderable[] {
  if (node.type === "text") return [node.value];
  if (node.type === "root") {
    const children = renderChildren(node.children);
    return children.length === 0 ? [] : [h.fragment(children)];
  }
  return renderElement(node);
}
