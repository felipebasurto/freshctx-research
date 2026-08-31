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
  BUDGET_PRESSURE_HERMES_FRESH_LABEL,
  hermesFreshMatchesRegion,
  runBudgetPressureHermesFreshPack,
} from "../bench/budget-pressure-hermes-fresh.mjs";
import { finalHermesCapture, runHermesTrace } from "../bench/hermes-trace-runner.mjs";
import { runTrace } from "../bench/trace-runner.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HERMES_CONTEXT_MODULE = join(ROOT, "bench", "hosts", "hermes", "agent", "context_engine.py");
const hermesHostReady = existsSync(HERMES_CONTEXT_MODULE);

test("hermes-fresh runs on budget-pressure traces without host checkout", async () => {
  const traces = await listBudgetPressureTraces(ROOT);
  assert.equal(traces.length, 6);
  for (const trace of traces) {
    await assert.doesNotReject(() => runHermesTrace(trace));
    const result = await runHermesTrace(trace);
    const capture = finalHermesCapture(result);
    assert.ok(capture, `${trace.name}: missing hermes-fresh capture`);
    assert.equal(capture.adapterApplied, true, `${trace.name}: adapter must apply`);
  }
});

test("budget-pressure hermes-fresh runner emits required baselines per trace", async () => {
  const summary = await runBudgetPressureHermesFreshPack({ skipReportWrite: true });
  assert.equal(summary.packId, BUDGET_PRESSURE_LAB_PACK_ID);
  assert.equal(summary.label, BUDGET_PRESSURE_HERMES_FRESH_LABEL);
  assert.equal(summary.traces, 6);
  assert.ok(summary.records >= 18, "expected at least region + hermes-fresh + pi-fresh per trace");

  const baselines = new Set(summary.rows.map((row) => row.baseline));
  for (const baseline of ["freshctx-region", "hermes-fresh", "pi-fresh"]) {
    assert.ok(baselines.has(baseline), `missing baseline ${baseline}`);
  }

  if (hermesHostReady) {
    assert.ok(baselines.has("hermes-native"));
    assert.match(summary.hermesNativeSource, /live run/u);
  } else {
    assert.match(summary.hermesNativeSource, /replayed|unavailable/u);
    const nativeRows = summary.rows.filter((row) => row.baseline === "hermes-native");
    if (nativeRows.length > 0) {
      assert.ok(nativeRows.every((row) => row.replayed), "hermes-native should be replayed without host");
    }
  }
});

test("hermes-fresh stale/recall match freshctx-region on budget-pressure cells", async () => {
  const summary = await runBudgetPressureHermesFreshPack({ skipReportWrite: true });
  const match = hermesFreshMatchesRegion(summary.rows);
  assert.ok(match.matched, match.mismatches.join("; "));
  assert.equal(summary.hermesFreshMatchesRegion, true);

  const regionRows = summary.rows.filter((row) => row.baseline === "freshctx-region");
  const freshRows = summary.rows.filter((row) => row.baseline === "hermes-fresh");
  assert.equal(regionRows.length, 6);
  assert.equal(freshRows.length, 6);
  for (const fresh of freshRows) {
    const region = regionRows.find((row) => row.repo === fresh.repo && row.family === fresh.family);
    assert.ok(region);
    assert.equal(fresh.staleBytes, region.staleBytes);
    assert.equal(fresh.requiredRecall, region.requiredRecall);
  }
});

test("budget-pressure hermes-fresh report file states region match finding", async () => {
  const reportPath = join(ROOT, "bench/reports/budget-pressure-hermes-fresh.md");
  if (!existsSync(reportPath)) {
    await runBudgetPressureHermesFreshPack({ invoked: true });
  }
  const report = await readFile(reportPath, "utf8");
  assert.match(report, /budget-pressure-hermes-fresh-dev-v0\.1/u);
  assert.match(report, /hermes-fresh vs freshctx-region/u);
  assert.match(report, /matched freshctx-region on required-recall and stale-bytes/u);
  assert.doesNotMatch(report, /FRESHCTX_CAPTURE_OK/u);
});
