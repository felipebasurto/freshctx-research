import { accessSync, constants, existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FreshCtxRegionBaseline } from "./baselines.mjs";
import { percentile } from "./metrics.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";
import { createSidecarRunner } from "../sidecar/treesitter/client.mjs";

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CANDIDATE_NAME = "isolated-semantic-engine";
const BASELINE_NAME = "corvus-file";
const APEX_PACK_PATTERN = /(?:^|-)(apex|level-4|level4)(?:-|$)/iu;

export function discoverEvaluateTarget(root = DEFAULT_ROOT, { env = process.env } = {}) {
  const override = env.FRESHCTX_EVAL_PACK;
  if (override) {
    if (override === "public-repo-smoke") return smokeTarget(root);
    return packTarget(root, override);
  }

  const packsDir = join(root, "bench", "packs");
  const packIds = existsSync(packsDir)
    ? readdirSync(packsDir).filter((name) => existsSync(join(packsDir, name, "traces")))
    : [];
  const apex = packIds.filter((id) => APEX_PACK_PATTERN.test(id)).sort();
  if (apex.length > 0) return packTarget(root, apex.at(-1));

  return smokeTarget(root);
}

function smokeTarget(root) {
  return {
    id: "public-repo-smoke",
    kind: "trace-dir",
    label: "public-repo-smoke",
    classification: "physical-in-repo",
    tracesDir: join(root, "bench", "traces", "smoke"),
  };
}

function packTarget(root, packId) {
  const packDir = join(root, "bench", "packs", packId);
  const statePath = join(packDir, "state.json");
  let classification = "unknown";
  let label = packId;
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    classification = state.classification ?? classification;
    label = state.packId ?? label;
  }
  return {
    id: packId,
    kind: "pack",
    label,
    classification,
    tracesDir: join(packDir, "traces"),
  };
}

export function probeIsolatedSemanticEngine(root = DEFAULT_ROOT) {
  const parsePath = join(root, "sidecar", "treesitter", "parse.mjs");
  try {
    accessSync(parsePath, constants.R_OK);
    return { available: true };
  } catch {
    return { available: false };
  }
}

export async function loadPhysicalTraces(tracesDir) {
  const names = (await readdir(tracesDir))
    .filter((name) => name.endsWith(".json") && !name.startsWith("candidates"))
    .sort();
  const traces = [];
  for (const name of names) {
    traces.push(JSON.parse(await readFile(join(tracesDir, name), "utf8")));
  }
  return traces;
}

function gateStatus(held) {
  return held ? "pass" : "fail";
}

function isGoldError(error) {
  const message = String(error?.message ?? error);
  return message.includes("independent oracle mismatch") || message.includes("gold");
}

export function stableEvaluateRecord(result) {
  const { resources, traceRows, ...rest } = result;
  return rest;
}

export function formatEvaluateOutput(result) {
  return `EVALUATE_VERDICT=${result.verdict}\n${JSON.stringify(result, null, 2)}\n`;
}

export function countRedundantReadEvents(traces) {
  let readEvents = 0;
  let redundantReadEvents = 0;
  for (const trace of traces) {
    const seen = new Map();
    for (const event of trace.events ?? []) {
      if (event.type !== "read") continue;
      readEvents += 1;
      const key = `${event.path}\0${event.scope ?? ""}\0${event.selector ?? ""}`;
      const prior = seen.get(key) ?? 0;
      seen.set(key, prior + 1);
      if (prior > 0) redundantReadEvents += 1;
    }
  }
  return { readEvents, redundantReadEvents };
}

export function countReasoningCycles(traces) {
  let reasoningCycles = 0;
  for (const trace of traces) {
    for (const event of trace.events ?? []) {
      if (event.type === "capture-request") reasoningCycles += 1;
    }
  }
  return reasoningCycles;
}

function sumCaptureField(result, field) {
  return (result.captures ?? []).reduce((total, capture) => total + (capture.metrics?.[field] ?? 0), 0);
}

export function decideEmpiricalVerdict({
  failOpenDetected,
  engineAvailable,
  goldAbsentDetected,
  payloadDelta,
  recall,
  requiredCount,
}) {
  const recallHeld = requiredCount === 0 || recall >= 1;
  const hardGates = {
    "fail-open": gateStatus(!failOpenDetected),
    "missing-engine": gateStatus(engineAvailable),
    "gold-absent": gateStatus(!goldAbsentDetected),
    "required-recall": gateStatus(recallHeld),
  };
  const forensicHold = Object.values(hardGates).every((status) => status === "pass");
  return {
    hardGates,
    forensicHold,
    verdict: forensicHold && payloadDelta < 0 ? "PASS" : "FAIL",
  };
}

export async function runEmpiricalEvaluation({ root = DEFAULT_ROOT, env = process.env } = {}) {
  const target = discoverEvaluateTarget(root, { env });
  const traces = await loadPhysicalTraces(target.tracesDir);
  if (traces.length === 0) {
    throw new Error("hard gate failed: no physical traces found");
  }

  const engine = probeIsolatedSemanticEngine(root);
  const runner = engine.available ? createSidecarRunner() : null;
  let peakRssBytes = process.memoryUsage().rss;
  let failOpenDetected = false;
  let goldAbsentDetected = false;
  let candidateBytes = 0;
  let baselineBytes = 0;
  let candidateAccumulatedBytes = 0;
  let baselineAccumulatedBytes = 0;
  let duplicateCodeCopies = 0;
  let requiredCount = 0;
  let requiredHits = 0;
  const latencies = [];
  const traceRows = [];

  for (const trace of traces) {
    let iseResult;
    let corvusResult;
    try {
      iseResult = await runTrace(trace, "freshctx-region", {
        baseline: new FreshCtxRegionBaseline({ sidecarRunner: runner }),
      });
      corvusResult = await runTrace(trace, "corvus-file");
    } catch (error) {
      if (isGoldError(error)) {
        goldAbsentDetected = true;
        continue;
      }
      throw error;
    }

    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    const iseCapture = finalCapture(iseResult);
    const corvusCapture = finalCapture(corvusResult);
    if (!iseCapture || !corvusCapture) {
      goldAbsentDetected = true;
      continue;
    }

    candidateBytes += iseCapture.metrics.payloadBytes;
    baselineBytes += corvusCapture.metrics.payloadBytes;
    candidateAccumulatedBytes += sumCaptureField(iseResult, "payloadBytes");
    baselineAccumulatedBytes += sumCaptureField(corvusResult, "payloadBytes");
    duplicateCodeCopies += sumCaptureField(iseResult, "duplicateUnits");
    requiredCount += iseCapture.metrics.requiredCount;
    requiredHits += iseCapture.metrics.requiredRecall * iseCapture.metrics.requiredCount;
    const latencyMs = iseCapture.telemetry?.totalMs ?? iseCapture.metrics.transformP50Ms ?? 0;
    latencies.push(latencyMs);

    const requiredUnits = iseCapture.event?.requiredUnits ?? [];
    const recallHits = iseCapture.metrics.requiredRecall * iseCapture.metrics.requiredCount;
    traceRows.push({
      repo: String(trace.name ?? "").split("/")[0] ?? "",
      commit: trace.source?.commit ?? "",
      path: trace.goldExtract?.path ?? requiredUnits[0]?.path ?? "",
      selector: trace.goldExtract?.selector ?? requiredUnits[0]?.selector ?? "",
      payloadBytes: {
        candidate: iseCapture.metrics.payloadBytes,
        baseline: corvusCapture.metrics.payloadBytes,
        delta: iseCapture.metrics.payloadBytes - corvusCapture.metrics.payloadBytes,
      },
      recallHits,
      recallRequired: iseCapture.metrics.requiredCount,
      peakRssBytes,
      latencyMs,
    });
    if (requiredUnits.length > 0 && (iseCapture.metrics.projectionBytes ?? 0) === 0) {
      failOpenDetected = true;
    }
    if (requiredUnits.length > 0 && iseCapture.metrics.requiredCount === 0) {
      goldAbsentDetected = true;
    }
  }

  const payloadDelta = candidateBytes - baselineBytes;
  const recall = requiredCount === 0 ? 0 : requiredHits / requiredCount;
  const judged = decideEmpiricalVerdict({
    failOpenDetected,
    engineAvailable: engine.available,
    goldAbsentDetected,
    payloadDelta,
    recall,
    requiredCount,
  });
  const { hardGates, forensicHold, verdict } = judged;
  const reads = countRedundantReadEvents(traces);
  const reasoningCycles = countReasoningCycles(traces);
  const latencyMs = {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    max: latencies.length === 0 ? 0 : Math.max(...latencies),
  };

  return {
    schemaVersion: 1,
    verdict,
    pack: {
      id: target.id,
      kind: target.kind,
      label: target.label,
      classification: target.classification,
    },
    comparison: {
      candidate: CANDIDATE_NAME,
      baseline: BASELINE_NAME,
      payloadBytes: {
        candidate: candidateBytes,
        baseline: baselineBytes,
        delta: payloadDelta,
      },
      oracleRetention: {
        recall,
        requiredCount,
        hits: requiredHits,
      },
    },
    corvusEquivalents: {
      redundantReadEvents: reads.redundantReadEvents,
      readEvents: reads.readEvents,
      duplicateCodeCopies,
      reasoningCycles,
      cycleReductionVsCorvus: 0,
      finalRequestBytes: {
        candidate: candidateBytes,
        baseline: baselineBytes,
      },
      accumulatedPayloadBytes: {
        candidate: candidateAccumulatedBytes,
        baseline: baselineAccumulatedBytes,
      },
      passAt1: null,
      passAt1Reason: "out-of-scope-adr-0002",
    },
    forensicHold,
    host: "core",
    adapter: "none",
    resources: {
      peakRssBytes,
      latencyMs,
      executionTimeMs: latencyMs,
    },
    hardGates,
    traces: traces.length,
    traceRows,
  };
}
