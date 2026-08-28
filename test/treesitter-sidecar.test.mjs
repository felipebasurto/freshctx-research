import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { FreshCtxEngine } from "../src/engine.mjs";
import { createSidecarRunner, missingSidecarRunner } from "../sidecar/treesitter/client.mjs";
import { parseSource } from "../sidecar/treesitter/parse.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("sidecar parses Python, TypeScript, JavaScript, Rust, and Go", () => {
  const python = parseSource({ path: "a.py", bytes: "def alpha():\n    return 1\n" });
  assert.equal(python.error, null);
  assert.equal(python.units[0].selector, "alpha");

  const ts = parseSource({ path: "a.ts", bytes: "export class Auth {\n  ok() { return true; }\n}\n" });
  assert.equal(ts.units[0].selector, "Auth");

  const js = parseSource({ path: "a.js", bytes: "export function main() {\n  return 1;\n}\n" });
  assert.equal(js.units[0].selector, "main");

  const rust = parseSource({ path: "a.rs", bytes: "fn parse_file() {\n    let x = 1;\n}\n" });
  assert.equal(rust.units[0].selector, "parse_file");

  const go = parseSource({
    path: "util.go",
    bytes: "func ParseFile(fset int) {\n  if true {\n    return\n  }\n}\n",
  });
  assert.equal(go.units[0].selector, "ParseFile");
});

test("sidecar fails closed on broken syntax", () => {
  const broken = parseSource({ path: "a.go", bytes: "func ParseFile() {\n" });
  assert.equal(broken.error, "parse-broken");
  assert.deepEqual(broken.units, []);
});

test("injected missing sidecar leaves symbol units unresolved", async () => {
  const engine = new FreshCtxEngine({ sidecarRunner: missingSidecarRunner() });
  engine.trackRead({
    path: "a.go",
    content: "func ParseFile() {\n  return\n}\n",
    scope: "symbol",
    selector: "ParseFile",
    startLine: 1,
    endLine: 3,
  });
  engine.advanceTurn();
  await engine.refresh({ "a.go": "func ParseFile() {\n  return\n}\n" });
  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "sidecar-error");
});

test("live sidecar runner relocates a Go function and stays off src imports", async () => {
  const runner = createSidecarRunner();
  const parsed = await runner({
    path: "util.go",
    bytes: "func ParseFile() {\n  return\n}\n",
  });
  assert.equal(parsed.units[0].selector, "ParseFile");

  const engine = new FreshCtxEngine({ sidecarRunner: runner });
  engine.trackRead({
    path: "util.go",
    content: "func ParseFile() {\n  return\n}\n",
    scope: "symbol",
    selector: "ParseFile",
    startLine: 1,
    endLine: 3,
  });
  engine.advanceTurn();
  await engine.refresh({ "util.go": "func ParseFile() {\n  return nil\n}\n" });
  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "sidecar");
  assert.match(unit.content, /return nil/u);
  assert.ok(unit.content.length > 0);

  const srcFiles = await readdir(join(ROOT, "src"));
  for (const name of srcFiles.filter((item) => item.endsWith(".mjs"))) {
    const source = await readFile(join(ROOT, "src", name), "utf8");
    assert.equal(source.includes("tree-sitter"), false, name);
    assert.equal(source.includes("sidecar/treesitter"), false, name);
  }
});

test("sidecar client does not retain prior request bodies", async () => {
  const source = await readFile(join(ROOT, "sidecar/treesitter/client.mjs"), "utf8");
  assert.equal(source.includes("lastBytes"), false);
  assert.equal(source.includes("cache"), false);
});
