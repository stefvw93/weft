import * as assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { canonicalize, normalizeBase, OUTSIDE_BASE_URL, stripBase } from "~/base";

describe("normalizeBase", () => {
  it("AC: undefined, empty, and '/' normalize to '' (no base)", () => {
    assert.equal(normalizeBase(undefined), "");
    assert.equal(normalizeBase(""), "");
    assert.equal(normalizeBase("/"), "");
  });

  it("AC: '/weft', '/weft/', and 'weft' all normalize to '/weft'", () => {
    assert.equal(normalizeBase("/weft"), "/weft");
    assert.equal(normalizeBase("/weft/"), "/weft");
    assert.equal(normalizeBase("weft"), "/weft");
  });
});

describe("stripBase", () => {
  it("AC: base '' is the identity", () => {
    assert.equal(stripBase("", "/docs/a?x=1"), "/docs/a?x=1");
    assert.equal(stripBase("", "/"), "/");
  });

  it("AC: the bare base (with or without trailing slash) strips to '/'", () => {
    assert.equal(stripBase("/weft", "/weft"), "/");
    assert.equal(stripBase("/weft", "/weft/"), "/");
  });

  it("AC: a nested path + search strips to the canonical url", () => {
    assert.equal(stripBase("/weft", "/weft/docs/a?x=1"), "/docs/a?x=1");
  });

  it("AC: a query directly on the base strips to '/?…'", () => {
    assert.equal(stripBase("/weft", "/weft?x=1"), "/?x=1");
  });

  it("AC: urls outside the base return null", () => {
    assert.equal(stripBase("/weft", "/docs/a"), null);
  });

  it("AC: the prefix must end at a segment boundary — '/weftx' is outside", () => {
    assert.equal(stripBase("/weft", "/weftx"), null);
  });
});

describe("canonicalize", () => {
  it("strips like stripBase when under the base", () => {
    assert.equal(canonicalize("/weft", "/weft/docs/a"), "/docs/a");
  });

  it("substitutes OUTSIDE_BASE_URL (a never-matching url) when outside", () => {
    assert.equal(canonicalize("/weft", "/other"), OUTSIDE_BASE_URL);
  });
});
