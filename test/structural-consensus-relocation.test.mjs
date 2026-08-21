import assert from "node:assert/strict";
import test from "node:test";

import { makeAnchors, resolveRegion } from "../src/anchors.mjs";
import { resolveRegionByStructuralConsensus } from "../src/structural-consensus.mjs";

test("structural consensus succeeds on in-place first-line mutation with multiple interior survivors at stored start", () => {
  const regionPrevious = [
    "func ParseFile(fset *token.FileSet) {",
    "  if !IsAbsPath(ctxt, file) {",
    "    file = JoinPath(ctxt, dir, file)",
    "  }",
    "  rd, err := OpenFile(ctxt, file)",
    "  if err != nil {",
    "    return nil, err",
    "  }",
  ].join("\n");
  const regionCurrent = [
    "func ParseFile(fset *token.FileSet) {",
    "  if !IsAbsPath(ctxt, file) { // holdout interior edit",
    "    file = JoinPath(ctxt, dir, file)",
    "  }",
    "  rd, err := OpenFile(ctxt, file)",
    "  if err != nil {",
    "    return nil, err",
    "  }",
  ].join("\n");
  const pad = Array.from({ length: 31 }, (_, index) => `// pad ${index}`).join("\n");
  const current = `${pad}\n${regionCurrent}`;
  const anchors = makeAnchors(regionPrevious, { startLine: 32 });

  const result = resolveRegionByStructuralConsensus({
    previousContent: regionPrevious,
    currentFileContent: current,
    anchors,
  });

  assert.equal(result.state, "resolved");
  assert.equal(result.method, "structural-anchors");
  assert.ok(result.support >= 2);
  assert.match(result.content, /holdout interior edit/u);
  assert.equal(result.startLine, 32);
});

test("production resolveRegion fails closed on Codex offset-shift after renamed header and insert", () => {
  const previous = [
    "export function authorize(user) {",
    "  if (!user) return false;",
    "  return user.role === 'admin';",
    "}",
  ].join("\n");
  const current = [
    "export function authorizeAccount(user) {",
    "// inserted policy line",
    "  if (!user) return false;",
    "  return user.role === 'admin';",
    "}",
  ].join("\n");
  const anchors = makeAnchors(previous, { startLine: 10 });

  const helper = resolveRegionByStructuralConsensus({
    previousContent: previous,
    currentFileContent: current,
    anchors,
  });
  assert.deepEqual(helper, {
    state: "unresolved",
    method: "offset-shift-without-boundaries",
  });

  const production = resolveRegion({
    previousContent: previous,
    currentFileContent: current,
    anchors,
  });
  assert.equal(production.state, "unresolved");
  assert.notEqual(production.method, "structural-anchors");
  assert.notEqual(production.method, "boundary-anchors");
  assert.equal(production.content, undefined);
});

test("structural consensus rejects a single surviving unique line as insufficient", () => {
  const previous = ["alpha", "beta", "gamma"].join("\n");
  const current = ["prefix", "beta", "suffix"].join("\n");
  const anchors = makeAnchors(previous, { startLine: 1 });

  const result = resolveRegionByStructuralConsensus({
    previousContent: previous,
    currentFileContent: current,
    anchors,
  });

  assert.deepEqual(result, {
    state: "unresolved",
    method: "insufficient-structural-consensus",
  });
});

test("structural consensus fails closed on conflicting inferred starts with equal support", () => {
  const previous = ["A0", "A1", "B0", "B1"].join("\n");
  const current = ["A0", "A1", "gap", "noise", "B0", "B1"].join("\n");
  const anchors = makeAnchors(previous, { startLine: 2 });

  const result = resolveRegionByStructuralConsensus({
    previousContent: previous,
    currentFileContent: current,
    anchors,
  });

  assert.deepEqual(result, {
    state: "unresolved",
    method: "ambiguous-structural-anchors",
  });
});

test("structural consensus fails closed when identical region bytes appear twice", () => {
  const previous = ["AAA", "BBB", "CCC"].join("\n");
  const current = [previous, "gap", previous].join("\n");
  const anchors = makeAnchors(previous, { startLine: 1 });

  const result = resolveRegionByStructuralConsensus({
    previousContent: previous,
    currentFileContent: current,
    anchors,
  });

  assert.equal(result.state, "unresolved");
  assert.equal(result.method, "structural-anchors-not-found");
});

test("structural consensus fails closed on bare offset shift and production rejects it", () => {
  const previous = ["keep-a", "keep-b", "keep-c"].join("\n");
  const current = ["noise", "keep-A-renamed", "keep-b", "keep-c", "tail"].join("\n");
  const anchors = makeAnchors(previous, { startLine: 4 });
  const input = { previousContent: previous, currentFileContent: current, anchors };

  const first = resolveRegionByStructuralConsensus(input);
  const second = resolveRegionByStructuralConsensus(input);

  assert.deepEqual(second, first);
  assert.deepEqual(first, {
    state: "unresolved",
    method: "offset-shift-without-boundaries",
  });

  const production = resolveRegion(input);
  assert.equal(production.state, "unresolved");
  assert.notEqual(production.method, "structural-anchors");
});

test("structural consensus does not treat whitespace-only variants as unique surviving lines", () => {
  const previous = ["alpha", "  beta  ", "gamma"].join("\n");
  const current = ["alpha", "beta", "beta", "gamma"].join("\n");
  const anchors = makeAnchors(previous, { startLine: 1 });

  const result = resolveRegionByStructuralConsensus({
    previousContent: previous,
    currentFileContent: current,
    anchors,
  });

  assert.equal(result.state, "unresolved");
  assert.notEqual(result.method, "structural-anchors");
});

test("structural consensus rejects prefix insertion that shifts inferred start away from stored startLine", () => {
  const previous = ["line-a", "line-b", "line-c"].join("\n");
  const current = ["prefix", "line-A-renamed", "line-b", "line-c", "suffix"].join("\n");
  const anchors = makeAnchors(previous, { startLine: 5 });

  const result = resolveRegionByStructuralConsensus({
    previousContent: previous,
    currentFileContent: current,
    anchors,
  });

  assert.deepEqual(result, {
    state: "unresolved",
    method: "offset-shift-without-boundaries",
  });
});

test("structural consensus relocation stays deterministic for offset-shift rejections", () => {
  const previous = ["HEADER", "body-a", "body-b", "FOOTER"].join("\n");
  const current = ["noise", "HEADER", "body-a", "body-b", "FOOTER", "tail"].join("\n");
  const anchors = makeAnchors(previous, { startLine: 8 });
  const input = { previousContent: previous, currentFileContent: current, anchors };

  const first = resolveRegionByStructuralConsensus(input);
  const second = resolveRegionByStructuralConsensus(input);

  assert.deepEqual(second, first);
  assert.deepEqual(first, {
    state: "unresolved",
    method: "offset-shift-without-boundaries",
  });
});
