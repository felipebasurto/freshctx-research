import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { finalCapture, runTrace } from "../../bench/trace-runner.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TRACES_DIR = join(ROOT, "bench", "traces", "holdout");

const METRIC_KEYS = Object.freeze([
  "exactCurrentRate",
  "requiredRecall",
  "staleUnitRate",
  "staleBytes",
  "duplicateUnits",
  "duplicateBytes",
  "projectionBytes",
]);

export async function listHoldoutTraces() {
  const names = await readdir(TRACES_DIR);
  const traces = [];
  for (const name of names.filter((item) => item.endsWith(".json") && !item.startsWith("candidates")).sort()) {
    traces.push(JSON.parse(await readFile(join(TRACES_DIR, name), "utf8")));
  }
  return traces;
}

export function assertCaptureParity(adapterCapture, coreCapture, traceName) {
  assert.ok(adapterCapture, `${traceName}: missing adapter capture`);
  assert.ok(coreCapture, `${traceName}: missing core capture`);
  for (const key of METRIC_KEYS) {
    assert.equal(
      adapterCapture.metrics[key],
      coreCapture.metrics[key],
      `${traceName}: adapter metric ${key} must match live core freshctx-region`,
    );
  }
}

/**
 * Run every holdout trace through an adapter and core freshctx-region, asserting
 * payload and metric parity. Compares to live core — never a frozen historical recall.
 */
export async function compareAdapterToCoreHoldout({ runAdapterTrace, finalAdapterCapture }) {
  const traces = await listHoldoutTraces();
  const comparisons = [];

  for (const trace of traces) {
    const [adapterResult, coreResult] = await Promise.all([
      runAdapterTrace(trace),
      runTrace(trace, "freshctx-region"),
    ]);
    const adapterCapture = finalAdapterCapture(adapterResult);
    const coreCapture = finalCapture(coreResult);
    assertCaptureParity(adapterCapture, coreCapture, trace.name);
    comparisons.push({
      traceName: trace.name,
      repo: adapterResult.repo,
      mutationFamily: adapterResult.mutationFamily,
      adapterMetrics: adapterCapture.metrics,
      coreMetrics: coreCapture.metrics,
    });
  }

  return comparisons;
}

export function findComparison(comparisons, repo, family) {
  return comparisons.find((row) => row.repo === repo && row.mutationFamily === family);
}

export function assertRowMatchesLiveCore(summaryRow, comparison, adapterLabel) {
  assert.ok(comparison, `${adapterLabel} holdout row missing comparison for ${summaryRow.repo}/${summaryRow.family}`);
  assert.equal(
    summaryRow.requiredRecall,
    comparison.coreMetrics.requiredRecall,
    `${adapterLabel} holdout aggregate recall must match live core for ${summaryRow.repo}/${summaryRow.family}`,
  );
  assert.equal(
    summaryRow.stale,
    comparison.coreMetrics.staleUnitRate,
    `${adapterLabel} holdout aggregate stale must match live core for ${summaryRow.repo}/${summaryRow.family}`,
  );
  assert.equal(
    summaryRow.exactCurrent,
    comparison.coreMetrics.exactCurrentRate,
    `${adapterLabel} holdout aggregate exact-current must match live core for ${summaryRow.repo}/${summaryRow.family}`,
  );
  assert.equal(
    summaryRow.projectionBytes,
    comparison.coreMetrics.projectionBytes,
    `${adapterLabel} holdout aggregate projection-bytes must match live core for ${summaryRow.repo}/${summaryRow.family}`,
  );
}
