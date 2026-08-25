import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { hermesFreshMatchesRegion } from "../bench/budget-pressure-hermes-fresh.mjs";
import {
  HOLDOUT_ADAPTER_BAKEOFF_LABEL,
  corvusFileStaleRecallVsRegion,
  runHoldoutAdapterBakeoffPack,
  summarizeHermesNativeModes,
} from "../bench/holdout-adapter-bakeoff.mjs";
import { finalHermesCapture, runHermesTrace } from "../bench/hermes-trace-runner.mjs";
import { finalCapture, runTrace } from "../bench/trace-runner.mjs";
import { listHoldoutTraces } from "./helpers/adapter-holdout-parity.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("hermes-fresh stale/recall match freshctx-region on holdout v0.1 cells", async () => {
  const traces = await listHoldoutTraces();
  assert.equal(traces.length, 10);

  for (const trace of traces) {
    const [hermes, region] = await Promise.all([
      runHermesTrace(trace),
      runTrace(trace, "freshctx-region"),
    ]);
    const hermesCapture = finalHermesCapture(hermes);
    const regionCapture = finalCapture(region);
    assert.equal(hermesCapture.metrics.staleBytes, regionCapture.metrics.staleBytes, `${trace.name}: stale-bytes`);
    assert.equal(hermesCapture.metrics.requiredRecall, regionCapture.metrics.requiredRecall, `${trace.name}: recall`);
    assert.ok(hermesCapture.metrics.projectionBytes <= regionCapture.metrics.projectionBytes, `${trace.name}: projection-bytes`);
  }
});

test("holdout adapter bakeoff runner emits required baselines per trace", async () => {
  const summary = await runHoldoutAdapterBakeoffPack({ skipReportWrite: true });
  assert.equal(summary.label, HOLDOUT_ADAPTER_BAKEOFF_LABEL);
  assert.equal(summary.packId, "holdout-v0.1");
  assert.equal(summary.traces, 10);
  assert.ok(summary.records >= 60, "expected at least 6 baselines × 10 traces");

  const match = hermesFreshMatchesRegion(summary.rows);
  assert.ok(match.matched, match.mismatches.join("; "));
  assert.equal(summary.hermesFreshMatchesRegion, true);

  const corvusMatch = corvusFileStaleRecallVsRegion(summary.rows);
  assert.equal(summary.corvusFileStaleRecallMatchesRegion, corvusMatch.matched);

  for (const baseline of ["freshctx-region", "freshctx-file", "corvus-file", "hermes-fresh", "pi-native", "pi-fresh"]) {
    const count = summary.rows.filter((row) => row.baseline === baseline).length;
    assert.equal(count, 10, `${baseline}: expected 10 aggregated rows`);
  }

  const hermesNativeCount = summary.rows.filter((row) => row.baseline === "hermes-native").length;
  assert.ok(hermesNativeCount === 10 || hermesNativeCount === 0, "hermes-native rows depend on host checkout or replay");
  if (hermesNativeCount === 10) {
    const nativeSummary = summarizeHermesNativeModes(summary.rows);
    assert.ok(nativeSummary.allNativeNoOp, "holdout window should stay native-no-op unless compress explicitly fires");
  }
});

test("holdout adapter bakeoff report states hermes-fresh and native-no-op findings", async () => {
  const reportPath = join(ROOT, "bench/reports/holdout-adapter-bakeoff.md");
  if (!existsSync(reportPath)) {
    await runHoldoutAdapterBakeoffPack({ invoked: true });
  }
  const report = await readFile(reportPath, "utf8");
  assert.match(report, /holdout-adapter-bakeoff-dev-v0\.1/u);
  assert.match(report, /resultSetHash: null/u);
  assert.match(report, /corvus-file source: live run/u);
  assert.match(report, /corvus-file vs freshctx-region/u);
  assert.match(report, /hermes-fresh vs freshctx-region/u);
  assert.match(report, /Hermes native compression/u);
  assert.match(report, /door blob/u);
  assert.doesNotMatch(report, /FRESHCTX_CAPTURE_OK/u);
});
