/**
 * Vite plugin that bakes `docs/**\/*.md` into the `virtual:weft-docs` module, and the
 * hand-authored landing-page hero snippet into `virtual:weft-home-snippet`.
 *
 * On `load` it globs the docs tree, runs each file through `parseDoc`, and emits a light
 * index module (`getAllMeta()`, every doc minus its `tree`, plus `loadDocTree()`) and
 * one lazy `virtual:weft-doc/<category>/<slug>` module per doc holding that doc's `tree`.
 * The heavy hast trees are thus code-split per doc and stay out of the initial client
 * graph; only the current page's tree is fetched (see `docs-split.specs.md`). The doc
 * model is resolved once at build time and imported as plain data by both the server and
 * client bundles: no markdown/highlighter code reaches the browser. The
 * home snippet is highlighted by the same pipeline and exported as a `tree` the
 * landing page renders via `renderHast`. In dev it watches the docs tree and triggers
 * a reload when a `.md` file changes.
 */

import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Plugin } from "vite-plus";
import { SITE_BASE, buildLlmsTxt } from "./llms-txt";
import { type DocModel, parseDoc } from "./markdown-loader";

const VIRTUAL_ID = "virtual:weft-docs";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const SNIPPET_ID = "virtual:weft-home-snippet";
const SNIPPET_RESOLVED_ID = `\0${SNIPPET_ID}`;
/** Prefix for the per-doc tree modules: `virtual:weft-doc/<category>/<slug>`, one lazy chunk each. */
const DOC_PREFIX = "virtual:weft-doc/";
const DOC_RESOLVED_PREFIX = `\0${DOC_PREFIX}`;
/** Sentinel for `Infinity` (not JSON-representable): replaced with a JS literal in the emitted module. */
const INFINITY_TOKEN = "__WEFT_INFINITY__";

/** JSON-stringifies `value`, emitting `Infinity` (from `frontmatter.order`) as a JS literal. */
function toLiteral(value: unknown): string {
  const json = JSON.stringify(value, (_key, v) => (v === Infinity ? INFINITY_TOKEN : v));
  return json.replaceAll(`"${INFINITY_TOKEN}"`, "Infinity");
}

/** The `(category, slug)` key that joins a doc to its route and per-doc module. */
function docKey(doc: Pick<DocModel, "category" | "slug">): string {
  return `${doc.category}/${doc.slug}`;
}

/** The landing-page code teaser, highlighted at build time through the doc pipeline. */
const HOME_SNIPPET = `---
title: home-snippet
---

\`\`\`ts
import { Component, h } from "@weftui/core";
import { Stream, SubscriptionRef } from "effect";

// A counter: a SubscriptionRef signal whose .changes stream
// drives the text node directly: no virtual DOM, no diffing.
const Counter = Component.gen(function* () {
  const count = yield* SubscriptionRef.make(0);
  return yield* h.button(
    { onclick: () => SubscriptionRef.update(count, (n) => n + 1) },
    [Stream.map(count.changes, String)],
  );
});
\`\`\`
`;

/** Highlights the home snippet and emits a module exporting its serialized hast `tree`. */
async function snippetModuleSource(docsRoot: string): Promise<string> {
  const doc = await parseDoc(HOME_SNIPPET, `${docsRoot}/__home-snippet.md`, docsRoot);
  return `export const tree = ${JSON.stringify(doc.tree)};\n`;
}

/** Normalizes an OS path to posix separators (so link resolution is platform-independent). */
function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}

/** Reads every `docs/**\/*.md` (excluding `index.md`) into a deduped `DocModel[]`. */
export async function loadAllDocs(docsRoot: string): Promise<DocModel[]> {
  const entries = await readdir(docsRoot, { recursive: true });
  const docs: DocModel[] = [];
  const seen = new Set<string>();
  for (const rel of entries) {
    if (!rel.endsWith(".md") || basename(rel) === "index.md") continue;
    const filePath = join(docsRoot, rel);
    const source = await readFile(filePath, "utf8");
    const doc = await parseDoc(source, toPosix(filePath), toPosix(docsRoot));
    const key = `${doc.category}/${doc.slug}`;
    if (seen.has(key)) throw new Error(`Duplicate doc route (category, slug): "${key}"`);
    seen.add(key);
    docs.push(doc);
  }
  return docs;
}

/**
 * Emits the `virtual:weft-docs` index module: the light metadata manifest (`getAllMeta`,
 * every doc minus its `tree`) plus `loadDocTree`, a static map of `import()` thunks (one
 * statically-analyzable specifier per doc), so each `tree` is a lazily-loaded chunk that
 * never enters the initial client graph (see `docs-split.specs.md`).
 */
function toIndexModuleSource(docs: readonly DocModel[]): string {
  const metas = docs.map(({ tree: _tree, ...meta }) => meta);
  const loaders = docs
    .map(
      (doc) =>
        `  ${JSON.stringify(docKey(doc))}: () => import(${JSON.stringify(DOC_PREFIX + docKey(doc))}),`,
    )
    .join("\n");
  return [
    `const meta = ${toLiteral(metas)};`,
    `const loaders = {\n${loaders}\n};`,
    `export const getAllMeta = () => meta;`,
    `export const loadDocTree = (category, slug) => {`,
    `  const load = loaders[category + "/" + slug];`,
    `  return load ? load().then((m) => m.tree) : Promise.resolve(undefined);`,
    `};`,
    "",
  ].join("\n");
}

/** Emits a per-doc tree module (`virtual:weft-doc/<category>/<slug>`) for the given key. */
function toDocModuleSource(docs: readonly DocModel[], key: string): string {
  const doc = docs.find((d) => docKey(d) === key);
  if (doc === undefined) throw new Error(`Unknown doc module: virtual:weft-doc/${key}`);
  return `export const tree = ${toLiteral(doc.tree)};\n`;
}

/** Builds the `virtual:weft-docs` plugin for a given absolute `docsRoot`. */
export function weftDocs(options: { readonly docsRoot: string }): Plugin {
  const docsRoot = toPosix(options.docsRoot);
  // Parse the docs tree once; the index module and every per-doc module read this one
  // resolved set. Cleared on a dev `.md` change so the next request re-globs (below).
  let cache: Promise<DocModel[]> | undefined;
  const allDocs = (): Promise<DocModel[]> => (cache ??= loadAllDocs(docsRoot));
  // The SSR build shares this plugin; only the client build emits `llms.txt` (a static
  // asset served from `dist/client`), so it isn't duplicated into `dist/server`.
  let isSsrBuild = false;
  return {
    name: "weft-docs",
    configResolved(config) {
      isSsrBuild = Boolean(config.build?.ssr);
    },
    async generateBundle() {
      if (isSsrBuild) return;
      const metas = (await allDocs()).map(({ tree: _tree, ...meta }) => meta);
      this.emitFile({
        type: "asset",
        fileName: "llms.txt",
        source: buildLlmsTxt(metas, SITE_BASE),
      });
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      if (id === SNIPPET_ID) return SNIPPET_RESOLVED_ID;
      if (id.startsWith(DOC_PREFIX)) return `\0${id}`;
      return undefined;
    },
    async load(id) {
      if (id === RESOLVED_ID) return toIndexModuleSource(await allDocs());
      if (id.startsWith(DOC_RESOLVED_PREFIX)) {
        return toDocModuleSource(await allDocs(), id.slice(DOC_RESOLVED_PREFIX.length));
      }
      if (id === SNIPPET_ID || id === SNIPPET_RESOLVED_ID) return snippetModuleSource(docsRoot);
      return undefined;
    },
    configureServer(server) {
      const reload = (file: string): void => {
        if (!toPosix(file).startsWith(docsRoot) || !file.endsWith(".md")) return;
        cache = undefined;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.add(docsRoot);
      server.watcher.on("change", reload);
      server.watcher.on("add", reload);
      server.watcher.on("unlink", reload);
    },
  };
}
