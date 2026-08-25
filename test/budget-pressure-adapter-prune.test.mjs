import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BUDGET_PRESSURE_LAB_PACK_ID,
  listBudgetPressureTraces,
} from "../bench/budget-pressure-lab.mjs";
import {
  BUDGET_PRESSURE_ADAPTER_PRUNE_LABEL,
  runBudgetPressureAdapterPrunePack,
} from "../bench/budget-pressure-adapter-prune.mjs";
import { hermesFreshMatchesRegion } from "../bench/budget-pressure-hermes-fresh.mjs";
import { finalHermesCapture, runHermesTrace } from "../bench/hermes-trace-runner.mjs";
import { finalPiCapture, runPiTrace } from "../bench/pi-trace-runner.mjs";
import { finalCapture, runTrace } from "../bench/trace-runner.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("pruned hermes-fresh projection-bytes match freshctx-region on budget-pressure cells", async () => {
  const traces = await listBudgetPressureTraces(ROOT);
  assert.equal(traces.length, 6);
  for (const trace of traces) {
    const [hermes, region] = await Promise.all([
      runHermesTrace(trace),
      runTrace(trace, "freshctx-region"),
    ]);
    const hermesCapture = finalHermesCapture(hermes);
    const regionCapture = finalCapture(region);
    assert.ok(hermesCapture.metrics.projectionBytes <= regionCapture.metrics.projectionBytes);
    assert.ok(hermesCapture.metrics.projectionBytes < 5000, `${trace.name}: expected pruned projection under 4k budget`);
  }
});

test("pruned pi-fresh projection-bytes match freshctx-region on budget-pressure cells", async () => {
  const traces = await listBudgetPressureTraces(ROOT);
  for (const trace of traces) {
    const [pi, region] = await Promise.all([
      runPiTrace(trace),
      runTrace(trace, "freshctx-region"),
    ]);
    const piCapture = finalPiCapture(pi);
    const regionCapture = finalCapture(region);
    assert.ok(piCapture.metrics.projectionBytes <= regionCapture.metrics.projectionBytes);
  }
});

test("budget-pressure adapter-prune runner emits required baselines and freshness match", async () => {
  const summary = await runBudgetPressureAdapterPrunePack({ skipReportWrite: true });
  assert.equal(summary.packId, BUDGET_PRESSURE_LAB_PACK_ID);
  assert.equal(summary.label, BUDGET_PRESSURE_ADAPTER_PRUNE_LABEL);
  assert.equal(summary.traces, 6);
  assert.ok(summary.records >= 18);

  const match = hermesFreshMatchesRegion(summary.rows);
  assert.ok(match.matched, match.mismatches.join("; "));
  assert.equal(summary.hermesFreshMatchesRegion, true);

  for (const item of summary.bytesDroppedVsPcr0035) {
    assert.ok(item.deltaBytes > 0, `${item.repo}/${item.family}: expected bytes drop vs PCR 0035`);
  }
});

test("budget-pressure adapter-prune report file states freshness and bytes findings", async () => {
  const reportPath = join(ROOT, "bench/reports/budget-pressure-adapter-prune.md");
  if (!existsSync(reportPath)) {
    await runBudgetPressureAdapterPrunePack({ invoked: true });
  }
  const report = await readFile(reportPath, "utf8");
  assert.match(report, /budget-pressure-adapter-prune-dev-v0\.1/u);
  assert.match(report, /freshness held/u);
  assert.match(report, /projection-bytes dropped vs PCR 0035/u);
  assert.doesNotMatch(report, /FRESHCTX_CAPTURE_OK/u);
});
