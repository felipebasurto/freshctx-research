import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { FreshCtxEngine } from "../src/engine.mjs";
import { createIsolatedSemanticEngineRunner, missingIsolatedSemanticEngineRunner } from "../ise/treesitter/client.mjs";
import { inclusiveEndLine, rejectUnnaturalSiblingOverlaps } from "../ise/treesitter/grammars.mjs";
import { parseSource } from "../ise/treesitter/parse.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("semanticEngine parses Python, TypeScript, JavaScript, Rust, and Go", async () => {
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

test("semanticEngine fails closed on broken syntax", async () => {
  const broken = await parseSource({ path: "a.go", bytes: "func ParseFile() {\n" });
  assert.equal(broken.error, "parse-broken");
  assert.deepEqual(broken.units, []);
});

test("a later parse error fail-closes only the broken unit", async () => {
  const parsed = await parseSource({
    path: "a.py",
    bytes: "def alpha():\n    return 1\n\ndef broken(\n",
  });
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.units.map((unit) => unit.selector), ["alpha"]);
  const alpha = parsed.units[0];
  const body = "def alpha():\n    return 1\n\ndef broken(\n"
    .split("\n")
    .slice(alpha.startLine - 1, alpha.endLine)
    .join("\n");
  assert.equal(body.includes("def broken"), false);
});

test("missing closing brace fail-closes the broken unit and does not consume the sibling", async () => {
  const cases = [
    [
      "a.js",
      "function alpha() {\n  return 1;\n\nfunction beta() {\n  return 2;\n}\n",
      "function beta",
    ],
    [
      "a.ts",
      "export function alpha() {\n  return 1;\n\nexport function beta() {\n  return 2;\n}\n",
      "function beta",
    ],
    [
      "a.go",
      "func Alpha() {\n  return\n\nfunc Beta() {\n  return\n}\n",
      "func Beta",
    ],
    [
      "a.rs",
      "fn alpha() {\n    let x = 1;\n\nfn beta() {\n    let y = 2;\n}\n",
      "fn beta",
    ],
  ];
  for (const [path, bytes, siblingHeader] of cases) {
    const parsed = await parseSource({ path, bytes });
    const lines = bytes.split("\n");
    for (const unit of parsed.units) {
      const slice = lines.slice(unit.startLine - 1, unit.endLine).join("\n");
      const isBroken = /alpha|Alpha/u.test(unit.selector);
      assert.equal(isBroken, false, `${path} emitted broken unit ${unit.selector}`);
      assert.equal(slice.includes(siblingHeader), unit.selector.toLowerCase().includes("beta"), path);
    }
    const beta = parsed.units.find((unit) => /beta|Beta/u.test(unit.selector));
    if (beta) {
      const betaBody = lines.slice(beta.startLine - 1, beta.endLine).join("\n");
      assert.equal(betaBody.includes(siblingHeader), true, path);
      assert.match(betaBody, /return 2|let y = 2/u);
      assert.equal(/function alpha|export function alpha|func Alpha|fn alpha/u.test(betaBody), false, path);
    } else {
      assert.equal(
        parsed.units.length,
        0,
        `${path} omitted the sibling without emitting another unit`,
      );
    }
  }
});

test("exclusive column-0 ends do not include the next line", () => {
  assert.equal(inclusiveEndLine({ row: 0, column: 0 }, { row: 2, column: 0 }), 2);
  assert.equal(inclusiveEndLine({ row: 0, column: 0 }, { row: 1, column: 12 }), 2);
  assert.equal(inclusiveEndLine({ row: 0, column: 0 }, { row: 0, column: 10 }), 1);
});

test("extractTreeSitterUnits deletes parser and tree in finally", async () => {
  const source = await readFile(join(ROOT, "ise/treesitter/grammars.mjs"), "utf8");
  assert.match(source, /try \{/u);
  assert.match(source, /finally \{/u);
  assert.match(source, /tree\?\.delete\(\)/u);
  assert.match(source, /parser\.delete\(\)/u);
});

test("overlap filter drops a span that swallows a same-indent sibling", () => {
  const bytes = "function alpha() {\n  return 1;\n\nfunction beta() {\n  return 2;\n}\n";
  const kept = rejectUnnaturalSiblingOverlaps(
    [
      { selector: "alpha", startLine: 1, endLine: 6 },
      { selector: "beta", startLine: 4, endLine: 6 },
    ],
    bytes,
  );
  assert.deepEqual(
    kept.map((unit) => unit.selector),
    ["beta"],
  );
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

test("injected missing semanticEngine leaves symbol units unresolved", async () => {
  const engine = new FreshCtxEngine({ semanticEngineRunner: missingIsolatedSemanticEngineRunner() });
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
  assert.equal(unit.resolutionMethod, "isolated-semantic-engine-error");
});

test("live semanticEngine runner relocates a Go function and stays off src imports", async () => {
  const runner = createIsolatedSemanticEngineRunner();
  const parsed = await runner({
    path: "util.go",
    bytes: "func ParseFile() {\n  return\n}\n",
  });
  assert.equal(parsed.units[0].selector, "ParseFile");

  const engine = new FreshCtxEngine({ semanticEngineRunner: runner });
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
  assert.equal(unit.resolutionMethod, "isolated-semantic-engine");
  assert.match(unit.content, /return nil/u);
  assert.ok(unit.content.length > 0);

  const srcFiles = await readdir(join(ROOT, "src"));
  for (const name of srcFiles.filter((item) => item.endsWith(".mjs"))) {
    const source = await readFile(join(ROOT, "src", name), "utf8");
    assert.equal(source.includes("tree-sitter"), false, name);
    assert.equal(source.includes("ise/treesitter"), false, name);
  }
});

test("semanticEngine client does not retain prior request bodies", async () => {
  const source = await readFile(join(ROOT, "ise/treesitter/client.mjs"), "utf8");
  assert.equal(source.includes("lastBytes"), false);
  assert.equal(source.includes("cache"), false);
});

test("spawned semanticEngine is byte-identical for the same request", async () => {
  const runner = createIsolatedSemanticEngineRunner();
  const request = { path: "a.py", bytes: "def alpha():\n    return 1\n" };
  const first = JSON.stringify(await runner(request));
  const second = JSON.stringify(await runner(request));
  assert.equal(first, second);
});

test("a later semanticEngine call does not keep earlier request bytes", async () => {
  const runner = createIsolatedSemanticEngineRunner();
  const first = await runner({
    path: "a.py",
    bytes: "def unique_first():\n    return 'PCR_ISOLATED_SEMANTIC_ENGINE_FIRST'\n",
  });
  const second = await runner({
    path: "b.py",
    bytes: "def unique_second():\n    return 'PCR_ISOLATED_SEMANTIC_ENGINE_SECOND'\n",
  });
  assert.equal(first.units[0].selector, "unique_first");
  assert.equal(second.units[0].selector, "unique_second");
  assert.equal(second.units.some((unit) => unit.selector === "unique_first"), false);
  assert.equal(second.units.some((unit) => unit.sha256 === first.units[0].sha256), false);
  const encoded = JSON.stringify(second);
  assert.equal(encoded.includes("PCR_ISOLATED_SEMANTIC_ENGINE_FIRST"), false);
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

  const engine = new FreshCtxEngine({ semanticEngineRunner: createIsolatedSemanticEngineRunner() });
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

test("nested functions in different parents get distinct enclosing paths", async () => {
  const cases = [
    [
      "a.py",
      [
        "def outer():",
        "    def helper():",
        "        return 1",
        "def other():",
        "    def helper():",
        "        return 2",
        "",
      ].join("\n"),
      ["function outer::function helper", "function other::function helper"],
    ],
    [
      "a.js",
      [
        "function outer() {",
        "  function helper() { return 1; }",
        "}",
        "function other() {",
        "  function helper() { return 2; }",
        "}",
        "",
      ].join("\n"),
      ["function outer::function helper", "function other::function helper"],
    ],
    [
      "a.ts",
      [
        "function outer() {",
        "  function helper() { return 1; }",
        "}",
        "function other() {",
        "  function helper() { return 2; }",
        "}",
        "",
      ].join("\n"),
      ["function outer::function helper", "function other::function helper"],
    ],
    [
      "a.rs",
      [
        "fn outer() {",
        "    fn helper() {",
        "        let x = 1;",
        "    }",
        "}",
        "fn other() {",
        "    fn helper() {",
        "        let y = 2;",
        "    }",
        "}",
        "",
      ].join("\n"),
      ["function outer::function helper", "function other::function helper"],
    ],
  ];
  for (const [path, bytes, expected] of cases) {
    const parsed = await parseSource({ path, bytes });
    assert.equal(parsed.error, null, path);
    const helpers = parsed.units.filter((unit) => unit.selector === "helper");
    assert.deepEqual(
      helpers.map((unit) => unit.qualifiedSelector),
      expected,
      path,
    );
  }
});

test("same-parent nested views in different blocks resolve", async () => {
  const bytes = [
    "class View:",
    "    def as_view(self):",
    "        def view():",
    "            return 1",
    "        if True:",
    "            def view():",
    "                return 2",
    "        return view",
    "",
  ].join("\n");
  const parsed = await parseSource({ path: "views.py", bytes });
  assert.equal(parsed.error, null);
  const views = parsed.units.filter((unit) => unit.selector === "view");
  assert.equal(views.length, 2);
  assert.equal(views[0].qualifiedSelector, "class View::method as_view::function view");
  assert.equal(views[1].qualifiedSelector, "class View::method as_view::if::function view");
  const asView = parsed.units.find((unit) => unit.selector === "as_view");
  assert.equal(asView.qualifiedSelector, "class View::method as_view");
});

test("JavaScript else-branch nested functions stay distinct from the if body", async () => {
  const bytes = [
    "function wrap() {",
    "  if (true) {",
    "    function view() { return 1; }",
    "  } else {",
    "    function view() { return 2; }",
    "  }",
    "}",
    "",
  ].join("\n");
  const parsed = await parseSource({ path: "a.js", bytes });
  assert.equal(parsed.error, null);
  const views = parsed.units.filter((unit) => unit.selector === "view");
  assert.equal(views.length, 2);
  assert.equal(views[0].qualifiedSelector, "function wrap::if::function view");
  assert.equal(views[1].qualifiedSelector, "function wrap::else::function view");
});

test("Go methods on different receivers keep class-qualified selectors", async () => {
  const parsed = await parseSource({
    path: "server.go",
    bytes: [
      "func (s *Server) Serve() {",
      "  return",
      "}",
      "func (c *Client) Serve() {",
      "  return",
      "}",
      "",
    ].join("\n"),
  });
  assert.equal(parsed.error, null);
  const serves = parsed.units.filter((unit) => unit.selector === "Serve");
  assert.deepEqual(
    serves.map((unit) => unit.qualifiedSelector),
    ["class Server::method Serve", "class Client::method Serve"],
  );
});

test("engine resolves a nested function by enclosing qualifiedSelector", async () => {
  const bytes = [
    "def outer():",
    "    def helper():",
    "        return 1",
    "def other():",
    "    def helper():",
    "        return 2",
    "",
  ].join("\n");
  const parsed = await parseSource({ path: "mod.py", bytes });
  const helper = parsed.units.find((unit) => unit.qualifiedSelector === "function outer::function helper");
  assert.ok(helper);
  const engine = new FreshCtxEngine({ semanticEngineRunner: createIsolatedSemanticEngineRunner() });
  engine.trackRead({
    path: "mod.py",
    content: bytes.split("\n").slice(helper.startLine - 1, helper.endLine).join("\n"),
    scope: "symbol",
    selector: helper.qualifiedSelector,
    startLine: helper.startLine,
    endLine: helper.endLine,
  });
  engine.advanceTurn();
  await engine.refresh({
    "mod.py": bytes.replace("        return 1", "        return 9"),
  });
  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "resolved");
  assert.match(unit.content, /return 9/u);
  assert.equal(unit.content.includes("return 2"), false);
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
  const source = await readFile(join(ROOT, "ise/treesitter/parse.mjs"), "utf8");
  assert.equal(source.includes("REGEX_LANGUAGES"), false);
  assert.equal(source.includes("parseWithRegex"), false);
  assert.equal(source.includes("PATTERNS"), false);
  assert.equal(source.includes("braceBalance"), false);
});

test("a later Go parse error fail-closes only the broken unit", async () => {
  const parsed = await parseSource({
    path: "a.go",
    bytes: "func Alpha() {\n  return\n}\nfunc broken(\n",
  });
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.units.map((unit) => unit.selector), ["Alpha"]);
  const body = "func Alpha() {\n  return\n}\nfunc broken(\n"
    .split("\n")
    .slice(parsed.units[0].startLine - 1, parsed.units[0].endLine)
    .join("\n");
  assert.equal(body.includes("func broken"), false);
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
