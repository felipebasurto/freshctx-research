import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseEvaluateArgs, runEvaluateBenchmark } from "../autoresearch/evaluate.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("evaluate CLI binds --pack and defaults to the synthetic fixture", () => {
  assert.deepEqual(parseEvaluateArgs(["node", "evaluate.mjs", "--pack=symbol-scope-dev-v0.1"]), {
    pack: "symbol-scope-dev-v0.1",
  });
  assert.deepEqual(parseEvaluateArgs(["node", "evaluate.mjs"]), {});
});

test("evaluate --pack runs that pack instead of the synthetic fixture", async () => {
  const result = await runEvaluateBenchmark({
    pack: "symbol-scope-dev-v0.1",
    root: ROOT,
  });
  assert.notEqual(result.label, "synthetic");
  assert.equal(result.packId, "symbol-scope-dev-v0.1");
  assert.ok(result.tracesExecuted > 0);
  assert.ok(Object.values(result.hardGates).every(Boolean));
});

test("evaluate without --pack still runs the synthetic benchmark", async () => {
  const result = await runEvaluateBenchmark({ root: ROOT });
  assert.equal(result.label, "synthetic");
  assert.equal(result.fixture, "auth-region-after-interior-edit");
});

test("evaluate refuses an unknown pack instead of falling back to synthetic", async () => {
  await assert.rejects(
    () => runEvaluateBenchmark({ pack: "does-not-exist", root: ROOT }),
    /unknown pack|no traces/i,
  );
});

test("evaluate-pack routing stays off the holdout protocol writer", async () => {
  const source = await readFile(join(ROOT, "bench/evaluate-pack.mjs"), "utf8");
  assert.equal(source.includes("holdout-protocol"), false);
  assert.equal(source.includes("runPack("), false);
});
