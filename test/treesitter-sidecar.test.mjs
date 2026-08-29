import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { FreshCtxEngine } from "../src/engine.mjs";
import { createSidecarRunner, missingSidecarRunner } from "../sidecar/treesitter/client.mjs";
import { inclusiveEndLine } from "../sidecar/treesitter/grammars.mjs";
import { parseSource } from "../sidecar/treesitter/parse.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("sidecar parses Python, TypeScript, JavaScript, Rust, and Go", async () => {
  const python = await parseSource({ path: "a.py", bytes: "def alpha():\n    return 1\n" });
  assert.equal(python.error, null);
  assert.equal(python.units[0].selector, "alpha");

  const ts = await parseSource({ path: "a.ts", bytes: "export class Auth {\n  ok() { return true; }\n}\n" });
  assert.equal(ts.units[0].selector, "Auth");

  const js = await parseSource({ path: "a.js", bytes: "export function main() {\n  return 1;\n}\n" });
  assert.equal(js.units[0].selector, "main");

  const rust = await parseSource({ path: "a.rs", bytes: "fn parse_file() {\n    let x = 1;\n}\n" });
  assert.equal(rust.units[0].selector, "parse_file");

  const go = await parseSource({
    path: "util.go",
    bytes: "func ParseFile(fset int) {\n  if true {\n    return\n  }\n}\n",
  });
  assert.equal(go.units[0].selector, "ParseFile");
});

test("sidecar fails closed on broken syntax", async () => {
  const broken = await parseSource({ path: "a.go", bytes: "func ParseFile() {\n" });
  assert.equal(broken.error, "parse-broken");
  assert.deepEqual(broken.units, []);
});

test("tree-sitter parse-broken wins even when some units extract", async () => {
  const parsed = await parseSource({
    path: "a.py",
    bytes: "def alpha():\n    return 1\n\ndef broken(\n",
  });
  assert.equal(parsed.error, "parse-broken");
  assert.deepEqual(parsed.units, []);
});

test("exclusive column-0 ends do not include the next line", () => {
  assert.equal(inclusiveEndLine({ row: 0, column: 0 }, { row: 2, column: 0 }), 2);
  assert.equal(inclusiveEndLine({ row: 0, column: 0 }, { row: 1, column: 12 }), 2);
  assert.equal(inclusiveEndLine({ row: 0, column: 0 }, { row: 0, column: 10 }), 1);
});

test("adjacent tree-sitter defs stay on their own lines", async () => {
  const parsed = await parseSource({
    path: "a.py",
    bytes: "def alpha():\n    return 1\ndef beta():\n    return 2\n",
  });
  assert.equal(parsed.error, null);
  assert.equal(parsed.units.length, 2);
  const [alpha, beta] = parsed.units;
  assert.equal(alpha.selector, "alpha");
  assert.equal(beta.selector, "beta");
  assert.ok(alpha.endLine < beta.startLine);
  const lines = "def alpha():\n    return 1\ndef beta():\n    return 2\n".split("\n");
  const alphaBody = lines.slice(alpha.startLine - 1, alpha.endLine).join("\n");
  const betaBody = lines.slice(beta.startLine - 1, beta.endLine).join("\n");
  assert.equal(alphaBody.includes("def beta"), false);
  assert.equal(betaBody.includes("def alpha"), false);
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

test("spawned sidecar is byte-identical for the same request", async () => {
  const runner = createSidecarRunner();
  const request = { path: "a.py", bytes: "def alpha():\n    return 1\n" };
  const first = JSON.stringify(await runner(request));
  const second = JSON.stringify(await runner(request));
  assert.equal(first, second);
});

test("a later sidecar call does not keep earlier request bytes", async () => {
  const runner = createSidecarRunner();
  const first = await runner({
    path: "a.py",
    bytes: "def unique_first():\n    return 'PCR_SIDECAR_FIRST'\n",
  });
  const second = await runner({
    path: "b.py",
    bytes: "def unique_second():\n    return 'PCR_SIDECAR_SECOND'\n",
  });
  assert.equal(first.units[0].selector, "unique_first");
  assert.equal(second.units[0].selector, "unique_second");
  assert.equal(second.units.some((unit) => unit.selector === "unique_first"), false);
  assert.equal(second.units.some((unit) => unit.sha256 === first.units[0].sha256), false);
  const encoded = JSON.stringify(second);
  assert.equal(encoded.includes("PCR_SIDECAR_FIRST"), false);
  assert.equal(encoded.includes(first.units[0].sha256), false);
});

test("duplicate module-level names fail closed as ambiguous", async () => {
  const parsed = await parseSource({
    path: "a.py",
    bytes: "def foo():\n    return 1\n\ndef foo():\n    return 2\n",
  });
  assert.equal(parsed.error, "ambiguous");
  assert.deepEqual(parsed.units, []);
});

test("duplicate names omit only the offending symbol", async () => {
  const parsed = await parseSource({
    path: "a.py",
    bytes: [
      "def alpha():",
      "    return 1",
      "def view():",
      "    return 2",
      "def view():",
      "    return 3",
      "",
    ].join("\n"),
  });
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.units.map((unit) => unit.selector), ["alpha"]);
  assert.equal(parsed.units.some((unit) => unit.selector === "view"), false);
});

test("unique method still resolves when nested functions collide", async () => {
  const bytes = [
    "class View:",
    "    def as_view(self):",
    "        def view():",
    "            return 1",
    "        def view():",
    "            return 2",
    "        return view",
    "",
  ].join("\n");
  const parsed = await parseSource({ path: "views.py", bytes });
  assert.equal(parsed.error, null);
  const asView = parsed.units.find((unit) => unit.selector === "as_view");
  assert.ok(asView);
  assert.equal(asView.qualifiedSelector, "class View::method as_view");

  const engine = new FreshCtxEngine({ sidecarRunner: createSidecarRunner() });
  engine.trackRead({
    path: "views.py",
    content: bytes,
    scope: "symbol",
    selector: "as_view",
    startLine: asView.startLine,
    endLine: asView.endLine,
  });
  engine.advanceTurn();
  await engine.refresh({
    "views.py": bytes.replace("        return view", "        return view  # now"),
  });
  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "resolved");
  assert.match(unit.content, /return view  # now/u);
});

test("class-qualified methods can coexist", async () => {
  const parsed = await parseSource({
    path: "a.ts",
    bytes: "export class Alpha {\n  render() { return 1; }\n}\nexport class Beta {\n  render() { return 2; }\n}\n",
  });
  assert.equal(parsed.error, null);
  assert.equal(parsed.units[0].selector, "Alpha");
  const renders = parsed.units.filter((unit) => unit.selector === "render");
  assert.equal(renders.length, 2);
  assert.equal(renders[0].qualifiedSelector, "class Alpha::method render");
  assert.equal(renders[1].qualifiedSelector, "class Beta::method render");
});

test("Go and Rust no longer use regex leftover extractors", async () => {
  const source = await readFile(join(ROOT, "sidecar/treesitter/parse.mjs"), "utf8");
  assert.equal(source.includes("REGEX_LANGUAGES"), false);
  assert.equal(source.includes("parseWithRegex"), false);
  assert.equal(source.includes("PATTERNS"), false);
  assert.equal(source.includes("braceBalance"), false);
});

test("Go hasError parse-broken wins even when some units extract", async () => {
  const parsed = await parseSource({
    path: "a.go",
    bytes: "func Alpha() {\n  return\n}\nfunc broken(\n",
  });
  assert.equal(parsed.error, "parse-broken");
  assert.deepEqual(parsed.units, []);
});

test("adjacent Go funcs stay on their own lines", async () => {
  const bytes = "func Alpha() {\n  return\n}\nfunc Beta() {\n  return\n}\n";
  const parsed = await parseSource({ path: "a.go", bytes });
  assert.equal(parsed.error, null);
  assert.equal(parsed.units.length, 2);
  const [alpha, beta] = parsed.units;
  assert.equal(alpha.selector, "Alpha");
  assert.equal(beta.selector, "Beta");
  assert.ok(alpha.endLine < beta.startLine);
  const lines = bytes.split("\n");
  const alphaBody = lines.slice(alpha.startLine - 1, alpha.endLine).join("\n");
  const betaBody = lines.slice(beta.startLine - 1, beta.endLine).join("\n");
  assert.equal(alphaBody.includes("func Beta"), false);
  assert.equal(betaBody.includes("func Alpha"), false);
});

test("adjacent Rust fns stay on their own lines", async () => {
  const bytes = "fn alpha() {\n    let x = 1;\n}\nfn beta() {\n    let y = 2;\n}\n";
  const parsed = await parseSource({ path: "a.rs", bytes });
  assert.equal(parsed.error, null);
  assert.equal(parsed.units.length, 2);
  const [alpha, beta] = parsed.units;
  assert.equal(alpha.selector, "alpha");
  assert.equal(beta.selector, "beta");
  assert.ok(alpha.endLine < beta.startLine);
  const lines = bytes.split("\n");
  const alphaBody = lines.slice(alpha.startLine - 1, alpha.endLine).join("\n");
  const betaBody = lines.slice(beta.startLine - 1, beta.endLine).join("\n");
  assert.equal(alphaBody.includes("fn beta"), false);
  assert.equal(betaBody.includes("fn alpha"), false);
});

test("Go method extracts receiver-qualified selector", async () => {
  const parsed = await parseSource({
    path: "server.go",
    bytes: "func (s *Server) Serve() {\n  return\n}\n",
  });
  assert.equal(parsed.error, null);
  assert.equal(parsed.units.length, 1);
  assert.equal(parsed.units[0].selector, "Serve");
  assert.equal(parsed.units[0].qualifiedSelector, "class Server::method Serve");
});

test("Rust impl method extracts type-qualified selector", async () => {
  const parsed = await parseSource({
    path: "server.rs",
    bytes: "impl Server {\n    fn serve(&self) {\n        let x = 1;\n    }\n}\n",
  });
  assert.equal(parsed.error, null);
  assert.equal(parsed.units.length, 1);
  assert.equal(parsed.units[0].selector, "serve");
  assert.equal(parsed.units[0].qualifiedSelector, "class Server::method serve");
});

test("C and Lua stay parser-not-implemented", async () => {
  const c = await parseSource({ path: "a.c", bytes: "int main(void) { return 0; }\n" });
  const lua = await parseSource({ path: "a.lua", bytes: "function main()\n  return 1\nend\n" });
  assert.equal(c.error, "parser-not-implemented");
  assert.deepEqual(c.units, []);
  assert.equal(lua.error, "parser-not-implemented");
  assert.deepEqual(lua.units, []);
});
