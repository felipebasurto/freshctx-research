import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("ADR 0004 exists and forbids tree-sitter inside src/", async () => {
  const adr = await readFile(join(ROOT, "docs/decisions/0004-treesitter-sidecar.md"), "utf8");
  assert.match(adr, /sidecar/i);
  assert.match(adr, /stdlib/i);
  assert.match(adr, /second program/i);
  assert.match(adr, /LSP/i);
  assert.match(adr, /stateless/i);
  assert.match(adr, /adapters\/hermes\/bridge\.mjs/);
  assert.ok(adr.includes("not `import` `tree-sitter`"));

  const srcFiles = await readdir(join(ROOT, "src"));
  for (const name of srcFiles.filter((item) => item.endsWith(".mjs"))) {
    const source = await readFile(join(ROOT, "src", name), "utf8");
    assert.equal(source.includes("tree-sitter"), false, name);
  }
});
