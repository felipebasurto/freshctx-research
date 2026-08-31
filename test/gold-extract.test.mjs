import assert from "node:assert/strict";
import test from "node:test";

import { extractGold, extractGoldFromTrace, sha256Bytes, OUT_OF_SCOPE_LANGUAGES } from "../bench/gold-extract.mjs";
import { sampleUnits, tracesFromSample } from "../bench/unit-sampler.mjs";
import { parseSource } from "../ise/treesitter/parse.mjs";

test("gold comes from generator offsets, not semanticEngine ranges", () => {
  const initial = "def alpha():\n    return 1\n";
  const offsets = {
    path: "src/alpha.py",
    startLine: 1,
    endLine: 2,
    mutation: { type: "replace-exact", expected: "def alpha():", replacement: "def alpha(): // sampler interior edit" },
  };
  const honest = extractGold({ initialText: initial, offsets });
  const sabotaged = extractGold({
    initialText: initial,
    offsets,
    semanticEngineUnits: [{ selector: "alpha", startLine: 2, endLine: 2 }],
  });
  assert.equal(honest.sha256, sabotaged.sha256);
  assert.equal(honest.bytes, "def alpha(): // sampler interior edit\n    return 1");
  assert.equal(honest.source, "generator-offsets");
});

test("sabotaged semanticEngine cannot change sampler-trace gold", async () => {
  const sample = sampleUnits({
    commit: "abc",
    scenario: "interior-edit",
    files: { "src/alpha.py": "def alpha():\n    return 1\n" },
    n: 1,
  });
  const [trace] = tracesFromSample({ sample });
  const gold = extractGoldFromTrace(trace);
  const semanticEngine = await parseSource({
    path: "src/alpha.py",
    bytes: "def other():\n    return 9\n",
  });
  const again = extractGoldFromTrace(trace, { semanticEngineUnits: semanticEngine.units });
  const engineAgain = extractGoldFromTrace(trace, { engineUnits: semanticEngine.units });
  assert.equal(gold.sha256, again.sha256);
  assert.equal(gold.sha256, engineAgain.sha256);
  assert.equal(gold.sha256, trace.goldExtract.postSha256);
});

test("gold hashes are stable across languages", () => {
  const cases = [
    ["src/a.py", "def alpha():\n    return 1\n"],
    ["src/a.ts", "export function greet() {\n  return 1;\n}\n"],
    ["src/a.js", "export function main() {\n  return 1;\n}\n"],
    ["src/a.rs", "fn parse_file() {\n    let x = 1;\n}\n"],
    ["src/a.go", "func ParseFile() {\n  return\n}\n"],
  ];
  for (const [path, body] of cases) {
    const sample = sampleUnits({ commit: "abc", scenario: "interior-edit", files: { [path]: body }, n: 1 });
    const [trace] = tracesFromSample({ sample });
    const first = extractGoldFromTrace(trace);
    const second = extractGoldFromTrace(trace);
    assert.equal(first.sha256, second.sha256, path);
    assert.equal(first.sha256, sha256Bytes(first.bytes));
  }
  assert.deepEqual(OUT_OF_SCOPE_LANGUAGES, ["c", "lua", "neovim"]);
});
