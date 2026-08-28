import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertNoResolverImport,
  classifyPath,
  generateSamplerTraces,
  rankKey,
  sampleUnits,
} from "../bench/unit-sampler.mjs";

const COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("rank key uses raw concatenation, not colon join", () => {
  const raw = rankKey(COMMIT, "src/a.py::file", "interior-edit");
  const colon = rankKey(`${COMMIT}:`, "src/a.py::file", `:interior-edit`);
  assert.notEqual(raw, colon);
  assert.equal(raw.length, 64);
});

test("sampleUnits is deterministic and records reject reasons", () => {
  const files = {
    "src/a.py": "def a():\n    return 1\n",
    "src/b.py": "def b():\n    return 2\n",
    "vendor/lib.py": "def lib():\n    return 0\n",
    "dist/out.js": "console.log(1)\n",
    "notes.txt": "readme\n",
    "../escape.py": "def no():\n    return 0\n",
  };
  const first = sampleUnits({ commit: COMMIT, scenario: "interior-edit", files, n: 10 });
  const second = sampleUnits({ commit: COMMIT, scenario: "interior-edit", files, n: 10 });
  assert.deepEqual(first.selected, second.selected);
  assert.deepEqual(first.rejected, second.rejected);
  assert.ok(first.rejected.some((row) => row.reason === "vendored"));
  assert.ok(first.rejected.some((row) => row.reason === "parser-not-implemented"));
  assert.ok(first.rejected.some((row) => row.reason === "path-escape"));
  assert.ok(first.selected.every((row) => row.scope === "file"));
  assert.ok(first.selected.length >= 1);
});

test("n cutoff records below-rank-cutoff", () => {
  const files = {
    "src/a.py": "a=1\n",
    "src/b.py": "b=1\n",
    "src/c.py": "c=1\n",
  };
  const sample = sampleUnits({ commit: COMMIT, scenario: "interior-edit", files, n: 1 });
  assert.equal(sample.selected.length, 1);
  assert.ok(sample.rejected.some((row) => row.reason === "below-rank-cutoff"));
});

test("classifyPath marks generated and escaped paths", () => {
  assert.equal(classifyPath("pkg/foo.min.js").reject, "generated-or-minified");
  assert.equal(classifyPath("../x.py").reject, "path-escape");
  assert.equal(classifyPath("src/ok.py").reject, null);
});

test("sampler source does not call resolveRegion", async () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const source = await readFile(join(root, "bench/unit-sampler.mjs"), "utf8");
  assert.equal(assertNoResolverImport(source), true);
  assert.equal(source.includes("from \"../src/anchors.mjs\""), false);
});

test("generateSamplerTraces writes candidates and traces", async () => {
  const root = await mkdtemp(join(tmpdir(), "sampler-"));
  const pack = { tracesDir: "traces" };
  const manifest = {
    mutationFamilies: ["interior-edit"],
    samplingRules: { unitsPerFamily: 1 },
    repositoryIds: ["synthetic"],
    implementationCommitSha: COMMIT,
    repositoryLocks: { synthetic: { commit: COMMIT } },
  };
  const summary = await generateSamplerTraces({ root, manifest, pack });
  assert.equal(summary.generator, "unit-sampler");
  assert.equal(summary.selected, 1);
  const record = JSON.parse(await readFile(join(root, "traces/candidates-rejected.json"), "utf8"));
  assert.equal(record.selectionRule, "sha256(commit + selector + scenario)");
  await rm(root, { recursive: true, force: true });
});
