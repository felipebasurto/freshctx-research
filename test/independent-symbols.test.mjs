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
import { parseSource } from "../sidecar/treesitter/parse.mjs";
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

test("missing closing brace fail-closes the broken gold unit and does not consume the sibling", () => {
  const cases = [
    [
      "src/a.js",
      "function alpha() {\n  return 1;\n\nfunction beta() {\n  return 2;\n}\n",
      "function beta",
    ],
    [
      "src/a.ts",
      "export function alpha() {\n  return 1;\n\nexport function beta() {\n  return 2;\n}\n",
      "function beta",
    ],
    [
      "src/a.go",
      "func Alpha() {\n  return\n\nfunc Beta() {\n  return\n}\n",
      "func Beta",
    ],
    [
      "src/a.rs",
      "fn alpha() {\n    let x = 1;\n\nfn beta() {\n    let y = 2;\n}\n",
      "fn beta",
    ],
  ];
  for (const [path, bytes, siblingHeader] of cases) {
    const result = enumerateIndependentSymbols({ path, bytes });
    const lines = bytes.split("\n");
    for (const unit of result.units) {
      const slice = lines.slice(unit.startLine - 1, unit.endLine).join("\n");
      assert.equal(/alpha|Alpha/u.test(unit.selector), false, `${path} emitted broken gold unit`);
      assert.equal(slice.includes(siblingHeader), /beta|Beta/u.test(unit.selector), path);
    }
    const beta = result.units.find((unit) => /beta|Beta/u.test(unit.selector));
    assert.ok(beta, `${path} should keep the well-bounded sibling gold span`);
    const betaBody = lines.slice(beta.startLine - 1, beta.endLine).join("\n");
    assert.equal(/function alpha|export function alpha|func Alpha|fn alpha/u.test(betaBody), false, path);
  }
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

test("python nested if/else functions get enclosing-span paths", () => {
  const source = [
    "class View:",
    "    def as_view(self):",
    "        if True:",
    "            def view():",
    "                return 1",
    "        else:",
    "            def view():",
    "                return 2",
    "        if False:",
    "            return 3",
    "",
  ].join("\n");
  const result = enumerateIndependentSymbols({ path: "src/views.py", bytes: source });
  assert.equal(result.error, null);
  const views = result.units.filter((unit) => unit.selector === "view");
  assert.deepEqual(
    views.map((unit) => unit.qualifiedSelector),
    [
      "class View::method as_view::if@0::function view",
      "class View::method as_view::else::function view",
    ],
  );
});

test("qualifiedSelector helper matches the public symbol contract", () => {
  assert.equal(qualifiedSelector("class", "Auth"), "class Auth");
  assert.equal(qualifiedSelector("function", "greet"), "function greet");
  assert.equal(qualifiedSelector("method", "refresh", "Auth"), "class Auth::method refresh");
});

test("independent gold matches Isolated Semantic Engine nested flask view paths", async () => {
  const trace = JSON.parse(await readFile(join(ROOT, "bench/traces/smoke/flask-interior-edit.json"), "utf8"));
  const bytes = trace.initialFiles["src/flask/views.py"];
  const gold = enumerateIndependentSymbols({ path: "src/flask/views.py", bytes });
  const engine = await parseSource({ path: "src/flask/views.py", bytes });
  const expected = [
    "class View::method as_view",
    "class View::method as_view::if@0::function view",
    "class View::method as_view::else::function view",
  ];
  for (const selector of expected) {
    const goldUnit = gold.units.find((unit) => unit.qualifiedSelector === selector);
    const engineUnit = engine.units.find((unit) => unit.qualifiedSelector === selector);
    assert.ok(goldUnit, `independent-symbols missing ${selector}`);
    assert.ok(engineUnit, `Isolated Semantic Engine missing ${selector}`);
    assert.equal(goldUnit.startLine, engineUnit.startLine, selector);
    assert.equal(goldUnit.endLine, engineUnit.endLine, selector);
  }
});
