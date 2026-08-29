import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  extractIndependentSymbols,
  findUniqueSymbol,
  uniqueSymbols,
} from "../bench/independent-symbols.mjs";
import { parseSource } from "../sidecar/treesitter/parse.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("independent-symbols extracts Python via ast, not the Isolated Semantic Engine", async () => {
  const bytes = "class View:\n    def as_view(self):\n        return 1\n\ndef helper():\n    return 2\n";
  const extracted = extractIndependentSymbols({ path: "src/flask/views.py", bytes });
  assert.equal(extracted.language, "python");
  const asView = findUniqueSymbol(extracted.units, "as_view");
  assert.equal(asView.source, "python-ast");
  assert.equal(asView.selector, "as_view");
  assert.match(asView.bytes, /def as_view/u);
  assert.equal(asView.bytes.includes("def helper"), false);

  const engine = await parseSource({
    path: "src/flask/views.py",
    bytes: "class View:\n    def as_view(self):\n        return 9\n\ndef helper():\n    return 2\n",
  });
  assert.notEqual(asView.sha256, engine.units?.find((unit) => unit.selector === "as_view")?.sha256);
});

test("independent-symbols extracts JavaScript via declaration scan", () => {
  const bytes = "function createApplication() {\n  app.init();\n  return app;\n}\nfunction unused() {\n  return 1;\n}\n";
  const extracted = extractIndependentSymbols({ path: "lib/express.js", bytes });
  assert.equal(extracted.language, "javascript");
  const created = findUniqueSymbol(extracted.units, "createApplication");
  assert.equal(created.source, "javascript-declaration-scan");
  assert.equal(created.selector, "createApplication");
  assert.match(created.bytes, /app\.init/u);
  assert.equal(created.bytes.includes("function unused"), false);
});

test("independent-symbols drops duplicated names", () => {
  const bytes = "def dispatch_request():\n    return 1\nclass Other:\n    def dispatch_request(self):\n        return 2\n";
  const extracted = extractIndependentSymbols({ path: "mod.py", bytes });
  assert.equal(uniqueSymbols(extracted.units).some((unit) => unit.name === "dispatch_request"), false);
  assert.equal(uniqueSymbols(extracted.units).some((unit) => unit.name === "Other"), true);
});

test("independent-symbols module does not import the Isolated Semantic Engine", async () => {
  const source = await readFile(join(ROOT, "bench/independent-symbols.mjs"), "utf8");
  assert.equal(source.includes("sidecar"), false);
  assert.equal(source.includes("treesitter"), false);
  assert.equal(source.includes("parseSource"), false);
  assert.equal(source.includes("createSidecarRunner"), false);
});
