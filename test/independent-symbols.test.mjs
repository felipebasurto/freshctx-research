import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { extractGold, extractGoldFromTrace, extractSymbolGold } from "../bench/gold-extract.mjs";
import {
  assertNoEngineImport,
  enumerateIndependentSymbols,
  qualifiedSelector,
} from "../bench/independent-symbols.mjs";
import { sampleUnits, tracesFromSample } from "../bench/unit-sampler.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("independent enumerator source does not import Isolated Semantic Engine", async () => {
  const files = [
    "bench/independent-symbols.mjs",
    "bench/gold-extract.mjs",
    "bench/python-ast-oracle.py",
  ];
  for (const rel of files) {
    const source = await readFile(join(ROOT, rel), "utf8");
    assert.equal(assertNoEngineImport(source), true, rel);
    assert.equal(/^import\s+.*treesitter/m.test(source), false, rel);
  }
});

test("python stdlib ast enumerates class, function, and method", () => {
  const source = [
    "def alpha():",
    "    return 1",
    "",
    "class Box:",
    "    def __init__(self):",
    "        self.n = 1",
    "    def volume(self):",
    "        return self.n",
    "",
  ].join("\n");
  const result = enumerateIndependentSymbols({ path: "src/box.py", bytes: source });
  assert.equal(result.error, null);
  const selectors = result.units.map((unit) => unit.qualifiedSelector);
  assert.deepEqual(selectors, [
    "function alpha",
    "class Box",
    "class Box::method volume",
  ]);
  assert.equal(result.units.every((unit) => unit.scope === "symbol"), true);
});

test("duplicate qualified names omit only the offending gold units", () => {
  const source = [
    "def alpha():",
    "    return 1",
    "def view():",
    "    return 2",
    "def view():",
    "    return 3",
    "",
  ].join("\n");
  const result = enumerateIndependentSymbols({ path: "src/views.py", bytes: source });
  assert.equal(result.error, null);
  assert.deepEqual(result.units.map((unit) => unit.selector), ["alpha"]);
});

test("python parse-broken fail-closes", () => {
  const result = enumerateIndependentSymbols({
    path: "src/broken.py",
    bytes: "def alpha(\n",
  });
  assert.equal(result.error, "parse-broken");
  assert.deepEqual(result.units, []);
});

test("brace languages enumerate top-level functions and methods", () => {
  const cases = [
    [
      "src/a.ts",
      "export function greet() {\n  return 1;\n}\nexport class Auth {\n  refresh() {\n    return 1;\n  }\n}\n",
      ["function greet", "class Auth", "class Auth::method refresh"],
    ],
    [
      "src/a.js",
      "export function main() {\n  return 1;\n}\n",
      ["function main"],
    ],
    [
      "src/a.go",
      "func ParseFile() {\n  return\n}\nfunc (s *Server) Serve() {\n  return\n}\n",
      ["function ParseFile", "class Server::method Serve"],
    ],
    [
      "src/a.rs",
      "fn parse_file() {\n    let x = 1;\n}\nimpl Server {\n    fn serve() {\n        let y = 1;\n    }\n}\n",
      ["function parse_file", "class Server::method serve"],
    ],
  ];
  for (const [path, bytes, expected] of cases) {
    const result = enumerateIndependentSymbols({ path, bytes });
    assert.equal(result.error, null, path);
    assert.deepEqual(result.units.map((unit) => unit.qualifiedSelector), expected, path);
  }
});

test("string and comment text is not a symbol header", () => {
  const bytes = [
    "const msg = \"function decoy() {\";",
    "// function ignored() {",
    "export function real() {",
    "  return 1;",
    "}",
    "",
  ].join("\n");
  const result = enumerateIndependentSymbols({ path: "src/a.js", bytes });
  assert.deepEqual(result.units.map((unit) => unit.qualifiedSelector), ["function real"]);
});

test("symbol gold is generator offsets, not Isolated Semantic Engine spans", () => {
  const initial = "export function greet() {\n  return 1;\n}\n";
  const extracted = enumerateIndependentSymbols({ path: "src/a.ts", bytes: initial });
  const unit = extracted.units[0];
  const gold = extractSymbolGold({
    path: "src/a.ts",
    initialText: initial,
    unit,
    mutation: {
      type: "replace-exact",
      expected: "export function greet() {",
      replacement: "export function greet() { // sampler interior edit",
    },
  });
  const sabotaged = extractGold({
    initialText: initial,
    offsets: {
      path: "src/a.ts",
      startLine: unit.startLine,
      endLine: unit.endLine,
      mutation: {
        type: "replace-exact",
        expected: "export function greet() {",
        replacement: "export function greet() { // sampler interior edit",
      },
    },
    engineUnits: [{ selector: "other", startLine: 2, endLine: 2 }],
  });
  assert.equal(gold.source, "generator-offsets");
  assert.equal(gold.scope, "symbol");
  assert.equal(gold.sha256, sabotaged.sha256);
  assert.match(gold.bytes, /sampler interior edit/u);
});

test("symbol sampler traces keep generator-owned gold under a sabotaged enumerator", () => {
  const files = {
    "src/alpha.py": "def alpha():\n    return 1\n",
  };
  const sample = sampleUnits({
    commit: "abc",
    scenario: "interior-edit",
    files,
    n: 1,
    unitScope: "symbol",
    enumerateSymbols() {
      return {
        units: [{
          path: "src/alpha.py",
          selector: "other",
          qualifiedSelector: "function other",
          kind: "function",
          language: "python",
          startLine: 2,
          endLine: 2,
          byteRange: [0, 1],
          sha256: "deadbeef",
        }],
        error: null,
      };
    },
  });
  const [trace] = tracesFromSample({ sample });
  const gold = extractGoldFromTrace(trace, {
    engineUnits: [{ selector: "other", startLine: 2, endLine: 2 }],
  });
  assert.equal(gold.source, "generator-offsets");
  assert.equal(gold.sha256, trace.goldExtract.postSha256);
  assert.equal(trace.goldExtract.enumerator, "independent-compiler-family");
  assert.equal(trace.events[0].scope, "symbol");
});

test("qualifiedSelector helper matches the public symbol contract", () => {
  assert.equal(qualifiedSelector("class", "Auth"), "class Auth");
  assert.equal(qualifiedSelector("function", "greet"), "function greet");
  assert.equal(qualifiedSelector("method", "refresh", "Auth"), "class Auth::method refresh");
});
