/**
 * Unit tests for the `Docs` service (`makeDocs`) after the per-route data split.
 *
 * Covers `docs-split.specs.md` AC4–AC6 at the model layer: `load` resolves a doc's
 * lazily-fetched `tree`, memoizes it (a revisit does not re-fetch), returns `undefined`
 * for an unknown key, and the metadata surface (`all` / `get` / `nav`) needs no tree.
 * The heavy `tree` fetch is a plain injected `loadTree` fn, so the service stays pure and
 * fixture-testable with no build-time (`virtual:weft-docs`) dependency.
 */

import * as assert from "node:assert/strict";
import { Effect } from "effect";
import { describe, it } from "vite-plus/test";
import { type DocMeta, type HastRoot } from "./markdown-loader";
import { makeDocs } from "./docs-service";

/** A metadata record (no `tree`) for a doc under `(category, slug)`. */
function meta(category: string, slug: string, order = 0): DocMeta {
  return {
    slug,
    category,
    path: `${category}/${slug}`,
    frontmatter: { title: `${slug} title`, order, section: category },
    headings: [{ depth: 2, id: "h", text: "Heading" }],
  };
}

/** A trivial one-node tree tagged with the slug, so we can assert which doc was loaded. */
function tree(slug: string): HastRoot {
  return { type: "root", children: [{ type: "text", value: slug }] };
}

describe("makeDocs: metadata surface (AC5)", () => {
  it("exposes all/get as metadata and derives nav without any tree", () => {
    const docs = makeDocs([meta("tutorial", "intro"), meta("reference", "core")], () =>
      Promise.resolve(undefined),
    );
    assert.equal(docs.all.length, 2);
    assert.equal(docs.get("tutorial", "intro")?.frontmatter.title, "intro title");
    assert.equal(docs.get("tutorial", "missing"), undefined);
    // nav is grouped from meta alone (reference ordered after tutorial).
    assert.deepEqual(
      docs.nav.groups.map((g) => g.section),
      ["tutorial", "reference"],
    );
  });
});

describe("makeDocs: load (AC4/AC6)", () => {
  it("resolves a doc's metadata plus its lazily-fetched tree", async () => {
    const docs = makeDocs([meta("guides", "intro")], (c, s) => Promise.resolve(tree(`${c}/${s}`)));
    const doc = await Effect.runPromise(docs.load("guides", "intro"));
    assert.equal(doc?.slug, "intro");
    assert.deepEqual(doc?.tree, tree("guides/intro"));
  });

  it("memoizes the tree: a revisit does not re-fetch", async () => {
    let calls = 0;
    const docs = makeDocs([meta("guides", "intro")], () => {
      calls += 1;
      return Promise.resolve(tree("intro"));
    });
    await Effect.runPromise(docs.load("guides", "intro"));
    await Effect.runPromise(docs.load("guides", "intro"));
    assert.equal(calls, 1);
  });

  it("returns undefined for an unknown (category, slug): no fetch attempted", async () => {
    let calls = 0;
    const docs = makeDocs([meta("guides", "intro")], () => {
      calls += 1;
      return Promise.resolve(undefined);
    });
    const doc = await Effect.runPromise(docs.load("guides", "nope"));
    assert.equal(doc, undefined);
    assert.equal(calls, 0);
  });
});
