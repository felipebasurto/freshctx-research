import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runBenchmark } from "../bench/run.mjs";
import {
  decideEmpiricalVerdict,
  discoverEvaluateTarget,
  formatEvaluateOutput,
  runEmpiricalEvaluation,
} from "../bench/empirical-verdict.mjs";

test("evaluate default target is a physical board, not the synthetic or alpha/beta sampler", () => {
  const target = discoverEvaluateTarget();
  assert.notEqual(target.id, "auth-region-after-interior-edit");
  assert.notEqual(target.id, "holdout-v0.2");
  assert.equal(target.id, "holdout-v0.3-apex");
});

test("an apex pack on disk wins over the smoke default", async () => {
  const root = join(tmpdir(), `freshctx-apex-eval-${Date.now()}`);
  await mkdir(join(root, "bench", "packs", "level-4-apex-v0.1", "traces"), { recursive: true });
  await writeFile(
    join(root, "bench", "packs", "level-4-apex-v0.1", "state.json"),
    `${JSON.stringify({ packId: "level-4-apex-v0.1", classification: "candidate" })}\n`,
  );
  try {
    const target = discoverEvaluateTarget(root);
    assert.equal(target.id, "level-4-apex-v0.1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("empirical evaluation reports Isolated Semantic Engine vs CORVUS without a synthetic scalar", async () => {
  const result = await runEmpiricalEvaluation();
  const printed = formatEvaluateOutput(result);

  assert.equal(result.verdict, "PASS");
  assert.equal(result.comparison.candidate, "isolated-semantic-engine");
  assert.equal(result.comparison.baseline, "corvus-file");
  assert.ok(result.comparison.payloadBytes.delta < 0);
  assert.equal(result.hardGates["fail-open"], "pass");
  assert.equal(result.hardGates["missing-engine"], "pass");
  assert.equal(result.hardGates["gold-absent"], "pass");
  assert.equal(result.hardGates["required-recall"], "pass");
  assert.equal(result.comparison.oracleRetention.recall, 1);
  assert.ok(Number.isFinite(result.resources.peakRssBytes));
  assert.ok(Number.isFinite(result.resources.latencyMs.p95));
  assert.equal(Object.hasOwn(result, "score"), false);
  assert.equal(printed.includes("89.107165"), false);
  assert.equal(printed.includes("AUTORESEARCH_SCORE"), false);
  assert.match(printed, /^EVALUATE_VERDICT=PASS\n/);
});

test("empirical PASS fails when required recall is below 1 even if payload shrinks", () => {
  const judged = decideEmpiricalVerdict({
    failOpenDetected: false,
    engineAvailable: true,
    goldAbsentDetected: false,
    payloadDelta: -27440,
    recall: 0,
    requiredCount: 1,
  });
  assert.equal(judged.hardGates["required-recall"], "fail");
  assert.equal(judged.forensicHold, false);
  assert.equal(judged.verdict, "FAIL");
});

test("npm run bench is EmpiricalVerdict, not a synthetic scalar", async () => {
  const result = await runBenchmark();
  assert.equal(Object.hasOwn(result, "score"), false);
  assert.equal(result.verdict, "PASS");
  assert.equal(result.pack.id, "holdout-v0.3-apex");
  assert.equal(result.comparison.candidate, "isolated-semantic-engine");
});
