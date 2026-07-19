import * as assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "vite-plus/test";
import type { DocMeta } from "./markdown-loader";
import { NOT_FOUND_PATH, outputFileFor, prerenderPathsFor } from "./prerender";

/** Minimal `DocMeta` fixture; only `category` and `slug` are meaningful here. */
function doc(category: string, slug: string): DocMeta {
  return {
    slug,
    category,
    path: `${category}/${slug}`,
    frontmatter: { title: slug, order: 1, section: category },
    headings: [],
  };
}

const OUT_DIR = join("dist", "static");

describe("prerenderPathsFor", () => {
  it("AC: yields /, /docs, and one /docs/{category}/{slug} per doc, in stable (input) order", () => {
    const paths = prerenderPathsFor([
      doc("tutorial", "getting-started"),
      doc("reference", "core"),
      doc("how-to", "add-routing"),
    ]);
    assert.deepEqual(paths, [
      "/",
      "/docs",
      "/docs/tutorial/getting-started",
      "/docs/reference/core",
      "/docs/how-to/add-routing",
    ]);
  });

  it("AC: an empty doc list still yields / and /docs (must not crash)", () => {
    assert.deepEqual(prerenderPathsFor([]), ["/", "/docs"]);
  });

  it("AC: does not include the synthetic not-found path", () => {
    const paths = prerenderPathsFor([doc("tutorial", "getting-started")]);
    assert.equal(paths.includes(NOT_FOUND_PATH), false);
  });
});

describe("outputFileFor", () => {
  it("AC: maps / to {outDir}/index.html", () => {
    assert.equal(outputFileFor("/", OUT_DIR), join(OUT_DIR, "index.html"));
  });

  it("AC: maps a top-level path to a directory index (/docs → {outDir}/docs/index.html)", () => {
    assert.equal(outputFileFor("/docs", OUT_DIR), join(OUT_DIR, "docs", "index.html"));
  });

  it("AC: maps a nested path to a directory index (/docs/guide/intro → {outDir}/docs/guide/intro/index.html)", () => {
    assert.equal(
      outputFileFor("/docs/guide/intro", OUT_DIR),
      join(OUT_DIR, "docs", "guide", "intro", "index.html"),
    );
  });

  it("AC: maps the not-found path to {outDir}/404.html (static-host convention)", () => {
    assert.equal(outputFileFor(NOT_FOUND_PATH, OUT_DIR), join(OUT_DIR, "404.html"));
  });
});
