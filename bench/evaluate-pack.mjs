import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  SYMBOL_PACK_ID,
  SYMBOL_PACK_LABEL,
  runSymbolPack,
} from "./generate-symbol-pack.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";

const PACK_TRACES_DIR = (root, packId) => join(root, "bench/packs", packId, "traces");

export async function runPackEvaluation({ packId, root }) {
  if (!packId) throw new Error("pack id required");
  if (packId === SYMBOL_PACK_ID) {
    return runSymbolScopePack({ root });
  }
  return runOnDiskTracePack({ packId, root });
}

async function runSymbolScopePack({ root }) {
  const result = await runSymbolPack({ root, skipReportWrite: true });
  const isolated = result.rows.filter((row) => row.system === "isolated-semantic-engine");
  const corvus = result.rows.filter((row) => row.system === "corvus-file");
  let payloadBytesDelta = 0;
  for (const row of isolated) {
    const baseline = corvus.find((item) => item.repo === row.repo && item.selector === row.selector);
    if (baseline) payloadBytesDelta += row.payloadBytes - baseline.payloadBytes;
  }
  const passed = result.rows.filter((row) => row.verdict === "pass").length;
  const tracesExecuted = new Set(result.rows.map((row) => `${row.repo}/${row.path}`)).size;
  return {
    label: SYMBOL_PACK_LABEL,
    fixture: SYMBOL_PACK_ID,
    packId: SYMBOL_PACK_ID,
    tracesExecuted,
    score: (passed / Math.max(1, result.rows.length)) * 100,
    hardGates: {
      allCellsPassed: result.rows.every((row) => row.verdict === "pass"),
      noFailOpen: result.rows.every((row) => row.failOpen === false),
      goldInPayload: result.rows.every((row) => row.goldInPayload === true),
    },
    comparison: {
      baseline: "corvus-file",
      candidate: "isolated-semantic-engine",
      payloadBytesDelta,
    },
    runs: result.rows.map((row) => ({
      name: `${row.system}/${row.repo}/${row.selector}`,
      system: row.system,
      repo: row.repo,
      selector: row.selector,
      verdict: row.verdict,
      reason: row.reason,
      payloadBytes: row.payloadBytes,
      goldInPayload: row.goldInPayload,
      failOpen: row.failOpen,
      payloadSha256: row.payloadSha256,
    })),
  };
}

async function listPackTraceFiles(root, packId) {
  const tracesDir = PACK_TRACES_DIR(root, packId);
  let names;
  try {
    names = await readdir(tracesDir);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`unknown pack: ${packId}`);
    }
    throw error;
  }
  return names
    .filter((name) => name.endsWith(".json") && !name.startsWith("candidates"))
    .sort()
    .map((name) => join(tracesDir, name));
}

export function judgeOnDiskCapture(capture) {
  if (!capture) return { verdict: "fail", reason: "no-capture" };
  if (capture.metrics.staleBytes > 0) return { verdict: "fail", reason: "stale-bytes" };
  if (capture.metrics.duplicateUnits > 0) return { verdict: "fail", reason: "duplicate-units" };
  const requiredCount = capture.event?.requiredUnits?.length ?? 0;
  if (requiredCount > 0 && capture.metrics.requiredRecall < 1) {
    return { verdict: "fail", reason: "required-recall" };
  }
  return { verdict: "pass", reason: null };
}

async function runOnDiskTracePack({ packId, root }) {
  const files = await listPackTraceFiles(root, packId);
  if (files.length === 0) {
    throw new Error(`no traces in pack ${packId}`);
  }
  const runs = [];
  for (const file of files) {
    const trace = JSON.parse(await readFile(file, "utf8"));
    const executed = await runTrace(trace, "freshctx-region");
    const capture = finalCapture(executed);
    const judged = judgeOnDiskCapture(capture);
    runs.push({
      name: trace.name,
      system: "freshctx-region",
      verdict: judged.verdict,
      reason: judged.reason,
      payloadBytes: capture?.metrics.payloadBytes ?? 0,
      payloadSha256: capture?.payloadSha256 ?? null,
      staleBytes: capture?.metrics.staleBytes ?? null,
      requiredRecall: capture?.metrics.requiredRecall ?? null,
      duplicateUnits: capture?.metrics.duplicateUnits ?? null,
    });
  }
  const passed = runs.filter((row) => row.verdict === "pass").length;
  return {
    label: packId,
    fixture: packId,
    packId,
    tracesExecuted: runs.length,
    score: (passed / Math.max(1, runs.length)) * 100,
    hardGates: {
      allCellsPassed: passed === runs.length,
      noStaleBytes: runs.every((row) => row.staleBytes === 0),
      noDuplicateUnits: runs.every((row) => (row.duplicateUnits ?? 0) === 0),
      fullRequiredRecall: runs.every((row) => row.requiredRecall === 1),
    },
    comparison: {
      baseline: "corvus-file",
      candidate: "freshctx-region",
    },
    runs,
  };
}

export function stablePackRecord(result) {
  return {
    label: result.label,
    fixture: result.fixture,
    packId: result.packId,
    tracesExecuted: result.tracesExecuted,
    hardGates: result.hardGates,
    comparison: result.comparison,
    runs: (result.runs ?? []).map((row) => ({
      name: row.name,
      system: row.system,
      verdict: row.verdict,
      payloadBytes: row.payloadBytes,
      payloadSha256: row.payloadSha256 ?? null,
    })),
  };
}
