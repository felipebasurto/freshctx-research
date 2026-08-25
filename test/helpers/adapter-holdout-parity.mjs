import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { finalCapture, runTrace } from "../../bench/trace-runner.mjs";
import { decodeProjectionUnits } from "../../src/projector.mjs";
import { sha256 } from "../../src/hash.mjs";

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

/**
 * Canonical hash of the FreshCtx provider-visible sync payload (markers, turn
 * envelope, and decoded projection units). Host transcript scaffolding may differ
 * between adapter and core messageText; this is the per-trace provider payload
 * contract compared against live core freshctx-region.
 */
export function finalProviderPayloadSha256(capture) {
  const text = String(capture.payloadText);
  const units = decodeProjectionUnits(text);
  const markers = [...text.matchAll(/\[freshctx:[^\]]+\][^\n]*/gu)].map((match) => match[0]);
  return sha256(
    JSON.stringify({
      markers,
      units: units
        .map((unit) => ({
          id: unit.id,
          path: unit.path,
          contentDigest: unit.content
            ? sha256(unit.content)
            : unit.revision?.startsWith("sha256:")
              ? unit.revision.slice("sha256:".length)
              : sha256(unit.content),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }),
  );
}

export function assertCaptureParity(adapterCapture, coreCapture, traceName) {
  assert.ok(adapterCapture, `${traceName}: missing adapter capture`);
  assert.ok(coreCapture, `${traceName}: missing core capture`);
  assert.equal(
    finalProviderPayloadSha256(adapterCapture),
    finalProviderPayloadSha256(coreCapture),
    `${traceName}: final provider payloadSha256 must match live core freshctx-region`,
  );
  for (const key of METRIC_KEYS) {
    if (key === "projectionBytes") {
      assert.ok(
        adapterCapture.metrics.projectionBytes <= coreCapture.metrics.projectionBytes,
        `${traceName}: adapter projectionBytes must not exceed live core freshctx-region`,
      );
      continue;
    }
    assert.equal(
      adapterCapture.metrics[key],
      coreCapture.metrics[key],
      `${traceName}: adapter metric ${key} must match live core freshctx-region`,
    );
  }
}

/**
 * Run every holdout trace through an adapter and core freshctx-region, asserting
 * provider payloadSha256 and metric parity. Compares to live core — never a
 * frozen historical recall.
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
      payloadSha256: finalProviderPayloadSha256(adapterCapture),
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
  assert.ok(
    summaryRow.projectionBytes <= comparison.coreMetrics.projectionBytes,
    `${adapterLabel} holdout aggregate projection-bytes must not exceed live core for ${summaryRow.repo}/${summaryRow.family}`,
  );
}

export function coreFreshctxRegionFailures(coreSummary) {
  return coreSummary.failures.filter((failure) => failure.includes("/freshctx-region"));
}

export function normalizeHoldoutFailure(failure) {
  const traceAndGate = failure.replace(/\/freshctx-region(?=:)/, "");
  return traceAndGate
    .replace(/: required recall \d+(?:\.\d+)?$/, ": required recall")
    .replace(/: stale bytes \(\d+\)$/, ": stale bytes")
    .replace(/: duplicate units \(\d+\)$/, ": duplicate units");
}

export function normalizedFailureSet(failures) {
  return failures.map(normalizeHoldoutFailure).sort();
}

export function assertFailureSetParity(adapterSummary, coreSummary, adapterLabel) {
  assert.deepEqual(
    normalizedFailureSet(adapterSummary.failures),
    normalizedFailureSet(coreFreshctxRegionFailures(coreSummary)),
    `${adapterLabel} holdout failure set must match live core freshctx-region (sorted membership)`,
  );
}

export function assertPackStatusParity(adapterSummary, coreSummary, adapterLabel) {
  const coreSupported = coreFreshctxRegionFailures(coreSummary).length === 0;
  assert.equal(
    adapterSummary.supported,
    coreSupported,
    `${adapterLabel} holdout supported flag must match live core freshctx-region exit status`,
  );
  assertFailureSetParity(adapterSummary, coreSummary, adapterLabel);
}
