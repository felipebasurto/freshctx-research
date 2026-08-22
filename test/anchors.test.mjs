import assert from "node:assert/strict";
import test from "node:test";

import { makeAnchors, resolveRegion } from "../src/anchors.mjs";

test("an unchanged region relocates by exact content", () => {
  const previous = "export const answer = 42;";
  const current = `// inserted\n${previous}\n`;
  const result = resolveRegion({
    previousContent: previous,
    currentFileContent: current,
    anchors: makeAnchors(previous, { startLine: 1 }),
  });

  assert.equal(result.state, "resolved");
  assert.equal(result.method, "exact");
  assert.equal(result.startLine, 2);
});

test("boundary anchors recover a region whose interior changed", () => {
  const previous = [
    "export function authorize(user) {",
    "  return user.role === 'admin';",
    "}",
  ].join("\n");
  const current = [
    "const unrelated = true;",
    "export function authorize(user) {",
    "  if (!user) return false;",
    "  return user.permissions.includes('write');",
    "}",
    "function helper() {",
    "  return unrelated;",
    "}",
  ].join("\n");
  const result = resolveRegion({
    previousContent: previous,
    currentFileContent: current,
    anchors: makeAnchors(previous, { startLine: 1 }),
  });

  assert.equal(result.state, "resolved");
  assert.equal(result.method, "boundary-anchors");
  assert.match(result.content, /permissions\.includes/);
  assert.doesNotMatch(result.content, /role ===/);
});

test("displaced shrunk first+last after delete fails closed", () => {
  const previous = [
    "\tName              string  // benchmark name",
    "\tN                 int     // number of iterations",
    "\tNsPerOp           float64 // nanoseconds per iteration",
    "\tAllocedBytesPerOp uint64  // bytes allocated per iteration",
    "\tAllocsPerOp       uint64  // allocs per iteration",
    "\tMBPerS            float64 // MB processed per second",
    "\tMeasured          int     // which measurements were recorded",
    "\tOrd               int     // ordinal position within a benchmark run",
  ].join("\n");
  const lookalike = [
    "\tName              string  // benchmark name",
    "\tOrd               int     // ordinal position within a benchmark run",
  ].join("\n");
  const current = [
    "type Benchmark struct {",
    "}",
    "// gap",
    lookalike,
    "",
    "// ParseLine extracts a Benchmark from a single line of testing.B",
  ].join("\n");
  const result = resolveRegion({
    previousContent: previous,
    currentFileContent: current,
    anchors: makeAnchors(previous, { startLine: 29 }),
  });

  assert.deepEqual(result, {
    state: "unresolved",
    method: "displaced-shrunk-boundary-anchors",
  });
});

test("in-place shrink at stored start is not treated as displaced leftover", () => {
  const previous = [
    "\tName              string  // benchmark name",
    "\tN                 int     // number of iterations",
    "\tNsPerOp           float64 // nanoseconds per iteration",
    "\tAllocedBytesPerOp uint64  // bytes allocated per iteration",
    "\tAllocsPerOp       uint64  // allocs per iteration",
    "\tMBPerS            float64 // MB processed per second",
    "\tMeasured          int     // which measurements were recorded",
    "\tOrd               int     // ordinal position within a benchmark run",
  ].join("\n");
  const shrunk = [
    "\tName              string  // benchmark name",
    "\tOrd               int     // ordinal position within a benchmark run",
  ].join("\n");
  const pad = Array.from({ length: 28 }, (_, index) => `// pad ${index}`).join("\n");
  const current = `${pad}\n${shrunk}\n// tail`;
  const result = resolveRegion({
    previousContent: previous,
    currentFileContent: current,
    anchors: makeAnchors(previous, { startLine: 29 }),
  });

  assert.equal(result.state, "resolved");
  assert.equal(result.method, "boundary-anchors");
  assert.equal(result.content, shrunk);
  assert.equal(result.startLine, 29);
});

test("exact match elsewhere does not replay when stored boundaries still anchor changed bytes", () => {
  const previous = [
    "func ParseLine(line string) (*Benchmark, error) {",
    "  b := &Benchmark{Name: fields[0], N: n}",
    "  return b, nil",
    "}",
  ].join("\n");
  const broken = [
    "func ParseLine(line string) (*Benchmark, error) {",
    '  b := &Benchmark{Name: "broken, N: n}',
    "  return b, nil",
    "}",
  ].join("\n");
  const lookalike = [
    "// gap",
    previous,
    "// tail",
  ].join("\n");
  const current = `${broken}\n\n${lookalike.split("\n").slice(1).join("\n")}`;
  const result = resolveRegion({
    previousContent: previous,
    currentFileContent: `${broken}\n\n// gap\n${previous}\n// tail`,
    anchors: makeAnchors(previous, { startLine: 1 }),
  });

  assert.equal(result.state, "resolved");
  assert.equal(result.method, "boundary-anchors");
  assert.equal(result.content, broken);
  assert.equal(result.startLine, 1);
});

test("exact match elsewhere does not replay when stored region grew in place", () => {
  const previous = [
    "BEGIN",
    "keep-a",
    "keep-b",
    "END",
  ].join("\n");
  const grown = [
    "BEGIN",
    "keep-a",
    "inserted",
    "keep-b",
    "END",
  ].join("\n");
  const current = [
    grown,
    "",
    previous,
  ].join("\n");
  const result = resolveRegion({
    previousContent: previous,
    currentFileContent: current,
    anchors: makeAnchors(previous, { startLine: 1 }),
  });

  assert.equal(result.state, "resolved");
  assert.equal(result.method, "boundary-anchors");
  assert.equal(result.content, grown);
  assert.equal(result.startLine, 1);
});

test("exact match elsewhere does not replay when stored region shrank to a contiguous prefix", () => {
  const previous = [
    "BEGIN",
    "line-a",
    "line-b",
    "line-c",
    "END",
  ].join("\n");
  const shrunk = [
    "BEGIN",
    "line-a",
    "line-b",
  ].join("\n");
  const current = [
    shrunk,
    "",
    previous,
  ].join("\n");
  const result = resolveRegion({
    previousContent: previous,
    currentFileContent: current,
    anchors: makeAnchors(previous, { startLine: 1 }),
  });

  assert.equal(result.state, "resolved");
  assert.equal(result.method, "boundary-anchors");
  assert.equal(result.content, shrunk);
  assert.equal(result.startLine, 1);
});

test("relocated exact still wins over stored-start lookalike that is not a contiguous prefix", () => {
  const previous = [
    "BEGIN",
    "line-a",
    "line-b",
    "line-c",
    "END",
  ].join("\n");
  const lookalike = [
    "BEGIN",
    "END",
  ].join("\n");
  const current = [
    lookalike,
    "",
    previous,
  ].join("\n");
  const result = resolveRegion({
    previousContent: previous,
    currentFileContent: current,
    anchors: makeAnchors(previous, { startLine: 1 }),
  });

  assert.equal(result.state, "resolved");
  assert.equal(result.method, "exact");
  assert.equal(result.content, previous);
  assert.equal(result.startLine, 4);
});

test("equally plausible boundary matches fail closed", () => {
  const previous = "BEGIN\nold\nEND";
  const current = [
    "BEGIN",
    "new-a",
    "END",
    "gap",
    "gap",
    "gap",
    "BEGIN",
    "new-b",
    "END",
  ].join("\n");
  const result = resolveRegion({
    previousContent: previous,
    currentFileContent: current,
    anchors: makeAnchors(previous, { startLine: 4 }),
  });

  assert.deepEqual(result, {
    state: "unresolved",
    method: "ambiguous-boundary-anchors",
  });
});
