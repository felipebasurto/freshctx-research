import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { FILE_REGION_ISE_EXTENSIONS } from "../src/registry.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("file/region ISE gate is the PCR 0114 set and a subset of what the engine parses", async () => {
  assert.deepEqual([...FILE_REGION_ISE_EXTENSIONS].sort(), [".cjs", ".js", ".mjs", ".py", ".ts", ".tsx"]);
  // Read the parser's table as text so src/ never imports ise/ (ADR 0004).
  const parser = await readFile(join(ROOT, "ise", "treesitter", "parse.mjs"), "utf8");
  for (const extension of FILE_REGION_ISE_EXTENSIONS) {
    assert.ok(parser.includes(`"${extension}":`), `${extension} missing from parse.mjs LANGUAGE_BY_EXT`);
  }
});

test("Go and Rust are parsed by the engine but excluded from file/region refresh (documented gap)", async () => {
  const parser = await readFile(join(ROOT, "ise", "treesitter", "parse.mjs"), "utf8");
  assert.ok(parser.includes('".go": "go"'));
  assert.ok(parser.includes('".rs": "rust"'));
  assert.equal(FILE_REGION_ISE_EXTENSIONS.has(".go"), false);
  assert.equal(FILE_REGION_ISE_EXTENSIONS.has(".rs"), false);
  const architecture = await readFile(join(ROOT, "docs", "ARCHITECTURE.md"), "utf8");
  assert.match(architecture, /Go and Rust file\/region units/u);
});
