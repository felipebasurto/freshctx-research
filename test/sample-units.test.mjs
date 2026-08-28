import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { classifyPath, rankKey, sampleUnits } from "../bench/sample-units.mjs";
import { assertNoResolverImport } from "../bench/unit-sampler.mjs";

test("sample-units rank key is raw concatenation", () => {
  const hashed = rankKey("c", "sel", "fam");
  assert.equal(hashed.length, 64);
  assert.notEqual(hashed, rankKey("c", "sel", "other"));
});

test("sample-units records reject reasons and determinism", () => {
  const files = {
    "src/a.py": "print(1)\n",
    "vendor/x.py": "print(0)\n",
    "notes.txt": "x\n",
  };
  const first = sampleUnits({ commit: "abc", scenario: "interior-edit", files, n: 10 });
  const second = sampleUnits({ commit: "abc", scenario: "interior-edit", files, n: 10 });
  assert.deepEqual(first.selected, second.selected);
  assert.deepEqual(first.rejected, second.rejected);
  assert.ok(first.rejected.every((row) => row.reason));
  assert.equal(classifyPath("vendor/x.py").reject, "vendored");
});

test("sample-units source does not import the resolver", async () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const source = await readFile(join(root, "bench/sample-units.mjs"), "utf8");
  assert.equal(assertNoResolverImport(source), true);
  assert.equal(source.includes("resolveRegion"), false);
});
