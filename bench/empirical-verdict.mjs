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
  const { resources, ...rest } = result;
  return rest;
}

export function formatEvaluateOutput(result) {
  return `EVALUATE_VERDICT=${result.verdict}\n${JSON.stringify(result, null, 2)}\n`;
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
  let requiredCount = 0;
  let requiredHits = 0;
  const latencies = [];

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
    requiredCount += iseCapture.metrics.requiredCount;
    requiredHits += iseCapture.metrics.requiredRecall * iseCapture.metrics.requiredCount;
    latencies.push(iseCapture.telemetry?.totalMs ?? iseCapture.metrics.transformP50Ms ?? 0);

    const requiredUnits = iseCapture.event?.requiredUnits ?? [];
    if (requiredUnits.length > 0 && (iseCapture.metrics.projectionBytes ?? 0) === 0) {
      failOpenDetected = true;
    }
    if (requiredUnits.length > 0 && iseCapture.metrics.requiredCount === 0) {
      goldAbsentDetected = true;
    }
  }

  const payloadDelta = candidateBytes - baselineBytes;
  const recall = requiredCount === 0 ? 0 : requiredHits / requiredCount;
  const hardGates = {
    "fail-open": gateStatus(!failOpenDetected),
    "missing-engine": gateStatus(engine.available),
    "gold-absent": gateStatus(!goldAbsentDetected),
  };
  const forensicHold = Object.values(hardGates).every((status) => status === "pass");
  const verdict = forensicHold && payloadDelta < 0 ? "PASS" : "FAIL";

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
    resources: {
      peakRssBytes,
      latencyMs: {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        max: latencies.length === 0 ? 0 : Math.max(...latencies),
      },
    },
    hardGates,
    traces: traces.length,
  };
}
