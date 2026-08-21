import assert from "node:assert/strict";
import test from "node:test";

import { makeAnchors } from "../src/anchors.mjs";
import { resolveRegionByStructuralConsensus } from "../src/structural-consensus.mjs";

test("structural consensus succeeds when mutated first line leaves multiple unique survivors agreeing on one start", () => {
  const previous = [
    "func ParseFile(fset *token.FileSet) {",
    "  if !IsAbsPath(ctxt, file) {",
    "    file = JoinPath(ctxt, dir, file)",
    "  }",
    "  rd, err := OpenFile(ctxt, file)",
    "  return parser.ParseFile(fset, file, rd, mode)",
    "}",
  ].join("\n");
  const current = [
    "// inserted header",
    "func ParseFile(fset *token.FileSet) {",
    "  if !IsAbsPath(ctxt, file) { // holdout interior edit",
    "    file = JoinPath(ctxt, dir, file)",
    "  }",
    "  rd, err := OpenFile(ctxt, file)",
    "  return parser.ParseFile(fset, file, rd, mode)",
    "}",
  ].join("\n");
  const anchors = makeAnchors(previous, { startLine: 10 });

  const result = resolveRegionByStructuralConsensus({
    previousContent: previous,
    currentFileContent: current,
    anchors,
  });

  assert.equal(result.state, "resolved");
  assert.equal(result.method, "structural-anchors");
  assert.ok(result.support >= 2);
  assert.match(result.content, /holdout interior edit/u);
  assert.equal(result.startLine, 2);
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

test("structural consensus relocation is deterministic for moved regions", () => {
  const previous = ["keep-a", "keep-b", "keep-c"].join("\n");
  const current = ["noise", "keep-a", "keep-b", "keep-c", "tail"].join("\n");
  const anchors = makeAnchors(previous, { startLine: 4 });
  const input = { previousContent: previous, currentFileContent: current, anchors };

  const first = resolveRegionByStructuralConsensus(input);
  const second = resolveRegionByStructuralConsensus(input);

  assert.deepEqual(second, first);
  assert.equal(first.state, "resolved");
  assert.equal(first.startLine, 2);
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

test("structural consensus emits one current slice without stale or duplicate bytes", () => {
  const previous = ["line-a", "line-b", "line-c"].join("\n");
  const current = ["prefix", "line-a", "line-b", "line-c", "suffix"].join("\n");
  const anchors = makeAnchors(previous, { startLine: 5 });

  const result = resolveRegionByStructuralConsensus({
    previousContent: previous,
    currentFileContent: current,
    anchors,
  });

  assert.equal(result.state, "resolved");
  const occurrences = current.split(result.content).length - 1;
  assert.equal(occurrences, 1, "resolved region must appear exactly once in the current file");
  assert.equal(
    result.content,
    current.split("\n").slice(result.startLine - 1, result.endLine).join("\n"),
  );
  assert.doesNotMatch(result.content, /prefix/u);
  assert.doesNotMatch(result.content, /suffix/u);
});
