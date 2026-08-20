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
