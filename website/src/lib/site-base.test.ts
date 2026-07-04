import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { normalizeSiteBase, SITE_BASE, withBase } from "./site-base";

describe("normalizeSiteBase", () => {
  it("AC: undefined, '', and '/' normalize to '' (root)", () => {
    assert.equal(normalizeSiteBase(undefined), "");
    assert.equal(normalizeSiteBase(""), "");
    assert.equal(normalizeSiteBase("/"), "");
  });

  it("AC: '/weft', '/weft/', and 'weft' normalize to '/weft'", () => {
    assert.equal(normalizeSiteBase("/weft"), "/weft");
    assert.equal(normalizeSiteBase("/weft/"), "/weft");
    assert.equal(normalizeSiteBase("weft"), "/weft");
  });
});

describe("withBase", () => {
  it("AC: prefixes root-absolute paths with SITE_BASE", () => {
    assert.equal(withBase("/docs/a"), `${SITE_BASE}/docs/a`);
    assert.equal(withBase("/"), `${SITE_BASE}/`);
  });

  it("AC: leaves non-root hrefs (external, hash, relative) untouched", () => {
    assert.equal(withBase("https://example.com/x"), "https://example.com/x");
    assert.equal(withBase("#section"), "#section");
    assert.equal(withBase("docs/a"), "docs/a");
  });
});
