import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runBenchmark } from "../bench/run.mjs";
import {
  countReasoningCycles,
  countRedundantReadEvents,
  decideEmpiricalVerdict,
  discoverEvaluateTarget,
  formatEvaluateOutput,
  runEmpiricalEvaluation,
  stableEvaluateRecord,
} from "../bench/empirical-verdict.mjs";
import { assertSafeReportPath, formatEvaluateReport } from "../bench/evaluate-report.mjs";

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
  assert.equal(result.forensicHold, true);
  assert.equal(result.host, "core");
  assert.equal(result.adapter, "none");
  assert.equal(result.corvusEquivalents.finalRequestBytes.candidate, result.comparison.payloadBytes.candidate);
  assert.equal(result.corvusEquivalents.finalRequestBytes.baseline, result.comparison.payloadBytes.baseline);
  assert.equal(result.corvusEquivalents.passAt1, null);
  assert.equal(result.corvusEquivalents.passAt1Reason, "out-of-scope-adr-0002");
  assert.equal(result.corvusEquivalents.cycleReductionVsCorvus, 0);
  assert.ok(result.corvusEquivalents.reasoningCycles >= result.traces);
  assert.ok(result.corvusEquivalents.accumulatedPayloadBytes.candidate >= result.comparison.payloadBytes.candidate);
  assert.deepEqual(result.resources.executionTimeMs, result.resources.latencyMs);
});

test("CORVUS equivalents count trace reads and capture-request cycles", () => {
  const traces = [
    {
      events: [
        { type: "read", path: "a.py", scope: "file" },
        { type: "read", path: "a.py", scope: "file" },
        { type: "read", path: "b.py", scope: "file" },
        { type: "capture-request" },
        { type: "capture-request" },
      ],
    },
  ];
  assert.deepEqual(countRedundantReadEvents(traces), { readEvents: 3, redundantReadEvents: 1 });
  assert.equal(countReasoningCycles(traces), 2);
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

function sampleReportResult() {
  return {
    schemaVersion: 1,
    verdict: "PASS",
    pack: { id: "holdout-v0.3-apex", classification: "locally-frozen" },
    comparison: {
      candidate: "isolated-semantic-engine",
      baseline: "corvus-file",
      payloadBytes: { candidate: 8504, baseline: 36701, delta: -28197 },
      oracleRetention: { recall: 1, requiredCount: 5, hits: 5 },
    },
    corvusEquivalents: {
      passAt1: null,
      passAt1Reason: "out-of-scope-adr-0002",
      cycleReductionVsCorvus: 0,
    },
    resources: {
      peakRssBytes: 51707904,
      latencyMs: { p50: 118, p95: 133, max: 133 },
    },
    traces: 1,
    traceRows: [
      {
        repo: "flask",
        commit: "d318b683471101618febed18996405ad26462110",
        path: "src/flask/views.py",
        selector: "class View::method as_view::if@0::function view",
        payloadBytes: { candidate: 1058, baseline: 7482, delta: -6424 },
        recallHits: 1,
        recallRequired: 1,
        peakRssBytes: 51707904,
        latencyMs: 133,
      },
    ],
  };
}

test("evaluate report cites locks and repeats JSON integers", () => {
  const result = sampleReportResult();
  const markdown = formatEvaluateReport(result, {
    implementationCommit: "abc123def456",
    reposLockSha256: "da5a3c1d15ec6d86e871956043dae19a471c1f496ec282e46358b2a60261a0d6",
  });
  assert.match(markdown, /holdout-v0\.3-apex/);
  assert.match(markdown, /abc123def456/);
  assert.match(markdown, /da5a3c1d15ec6d86e871956043dae19a471c1f496ec282e46358b2a60261a0d6/);
  assert.match(markdown, /204af5d8df1a25d09dcc2ef154b2aac8d3d3fcea4c9c737a511129f40cd27eaf/);
  assert.match(markdown, /arXiv:2607\.22711v1/);
  assert.match(markdown, /Isolated Semantic Engine/);
  assert.match(markdown, /corvus-file/);
  assert.match(markdown, /passAt1=null \(ADR 0002\)/);
  assert.match(markdown, /cycleReductionVsCorvus=0/);
  assert.match(markdown, /d318b683471101618febed18996405ad26462110/);
  assert.match(markdown, /class View::method as_view::if@0::function view/);
  assert.match(markdown, /(?<!\d)1058(?!\d)/);
  assert.match(markdown, /(?<!\d)7482(?!\d)/);
  assert.match(markdown, /-6424/);
  assert.match(markdown, /8504/);
  assert.match(markdown, /36701/);
  assert.match(markdown, /-28197/);
  assert.match(markdown, /51707904/);
  assert.match(markdown, /telemetry/);
  assert.equal(markdown.includes("sidecar"), false);
});

test("evaluate report fails closed without provenance", () => {
  const result = sampleReportResult();
  result.traceRows[0].commit = "";
  assert.throws(() => formatEvaluateReport(result, {
    implementationCommit: "abc123def456",
    reposLockSha256: "da5a3c1d15ec6d86e871956043dae19a471c1f496ec282e46358b2a60261a0d6",
  }), /missing provenance/);
});

test("evaluate report refuses sealed holdout write paths", () => {
  assert.throws(
    () => assertSafeReportPath("bench/packs/holdout-v0.3-apex/reports/report.md"),
    /refusing to write/,
  );
  assert.throws(
    () => assertSafeReportPath("bench/packs/holdout-v0.3-apex/reports/results.jsonl"),
    /refusing to write/,
  );
  assert.throws(
    () => assertSafeReportPath("bench/packs/symbol-scope-dev-v0.1/reports/results.jsonl"),
    /refusing to write/,
  );
  assertSafeReportPath("out/evaluate-corvus-table.md");
});

test("empirical evaluate rows sum to comparison payloadBytes", async () => {
  const result = await runEmpiricalEvaluation();
  const candidateSum = result.traceRows.reduce((total, row) => total + row.payloadBytes.candidate, 0);
  const baselineSum = result.traceRows.reduce((total, row) => total + row.payloadBytes.baseline, 0);
  assert.equal(candidateSum, result.comparison.payloadBytes.candidate);
  assert.equal(baselineSum, result.comparison.payloadBytes.baseline);
  assert.equal(result.traceRows.length, result.traces);
  const stable = stableEvaluateRecord(result);
  assert.equal(Object.hasOwn(stable, "resources"), false);
  assert.equal(Object.hasOwn(stable, "traceRows"), false);
  const printed = formatEvaluateOutput(result);
  assert.match(printed, /^EVALUATE_VERDICT=/);
  assert.equal(printed.includes("# Evaluate report"), false);
});
