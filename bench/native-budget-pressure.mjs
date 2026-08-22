import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { finalCapture, runTrace } from "./trace-runner.mjs";
import { finalPiNativeCapture, runPiNativeTrace } from "./pi-native-trace-runner.mjs";
import { finalHermesNativeCapture, runHermesNativeTrace } from "./hermes-native-trace-runner.mjs";
import { percentile } from "./metrics.mjs";
import { sha256 } from "../src/hash.mjs";
import { shouldWriteTrackedReports } from "./report-artifacts.mjs";
import { HOSTS_LOCK_PATH } from "./hosts-path.mjs";
import {
  BUDGET_PRESSURE_LAB_PACK_ID,
  listBudgetPressureTraces,
} from "./budget-pressure-lab.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPORTS_DIR = join(ROOT, "bench", "reports");
const REPOS_LOCK_PATH = join(ROOT, "bench", "repos.lock.json");
const HOST_VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version;

const COMPARISON_BASELINES = Object.freeze([
  "freshctx-region",
  "freshctx-file",
  "pi-native",
  "hermes-native",
]);

function gitCommit() {
  const run = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : "unknown";
}

function environmentDigest() {
  return sha256(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: ROOT,
    }),
  );
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function captureRow(baseline, result, finalCaptureFn) {
  const capture = finalCaptureFn(result);
  if (!capture) return null;
  return {
    baseline,
    repo: result.repo,
    family: result.mutationFamily,
    exactCurrent: capture.metrics.exactCurrentRate,
    stale: capture.metrics.staleUnitRate,
    staleBytes: capture.metrics.staleBytes,
    duplicate: capture.metrics.duplicateUnits,
    requiredRecall: capture.metrics.requiredRecall,
    projectionBytes: capture.metrics.projectionBytes,
    cachePrefixReuse: capture.metrics.cachePrefixReuse,
    transformMs: capture.telemetry.totalMs ?? 0,
    payloadSha256: capture.payloadSha256,
    nativeMode: capture.nativeMode ?? null,
    hermesMode: capture.nativeMode ?? null,
  };
}

function aggregateRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.baseline}\t${row.repo}\t${row.family}`;
    const bucket = grouped.get(key) ?? {
      baseline: row.baseline,
      repo: row.repo,
      family: row.family,
      exactCurrent: [],
      stale: [],
      staleBytes: [],
      duplicate: [],
      requiredRecall: [],
      projectionBytes: [],
      cachePrefixReuse: [],
      transformP50: [],
      transformP95: [],
      hermesMode: row.hermesMode,
    };
    bucket.exactCurrent.push(row.exactCurrent);
    bucket.stale.push(row.stale);
    bucket.staleBytes.push(row.staleBytes);
    bucket.duplicate.push(row.duplicate);
    bucket.requiredRecall.push(row.requiredRecall);
    bucket.projectionBytes.push(row.projectionBytes);
    bucket.cachePrefixReuse.push(row.cachePrefixReuse);
    bucket.transformP50.push(row.transformMs);
    bucket.transformP95.push(row.transformMs);
    if (row.hermesMode) bucket.hermesMode = row.hermesMode;
    grouped.set(key, bucket);
  }

  return [...grouped.values()].map((bucket) => ({
    baseline: bucket.baseline,
    repo: bucket.repo,
    family: bucket.family,
    exactCurrent: bucket.exactCurrent.reduce((a, b) => a + b, 0) / bucket.exactCurrent.length,
    stale: bucket.stale.reduce((a, b) => a + b, 0) / bucket.stale.length,
    staleBytes: Math.round(bucket.staleBytes.reduce((a, b) => a + b, 0) / bucket.staleBytes.length),
    duplicate: bucket.duplicate.reduce((a, b) => a + b, 0) / bucket.duplicate.length,
    requiredRecall: bucket.requiredRecall.reduce((a, b) => a + b, 0) / bucket.requiredRecall.length,
    projectionBytes: Math.round(bucket.projectionBytes.reduce((a, b) => a + b, 0) / bucket.projectionBytes.length),
    cachePrefixReuse: bucket.cachePrefixReuse.reduce((a, b) => a + b, 0) / bucket.cachePrefixReuse.length,
    transformP50: percentile(bucket.transformP50, 0.5),
    transformP95: percentile(bucket.transformP95, 0.95),
    hermesMode: bucket.hermesMode ?? null,
  }));
}

function formatBakeoffTable(rows, hostsLock) {
  const lines = [
    "# CtxBench budget-pressure native bake-off (budget-pressure-dev-v0.1)",
    "",
    "Label: `budget-pressure-dev` / `native-host`. Measurement infrastructure only; not a performance claim.",
    "",
    "Hermes `contextLength` is derived from assembled message tokens (`rough * 1.1`) so `should_compress` fires. Live summarization uses capture-provider stub when `FRESHCTX_CAPTURE_OK=1`.",
    "",
    `- pack: \`${BUDGET_PRESSURE_LAB_PACK_ID}\``,
    `- hosts.lock SHA-256: \`${hostsLock.sha256}\``,
    `- pi host SHA: \`${hostsLock.pi}\``,
    `- hermes host SHA: \`${hostsLock.hermes}\``,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Per-cell metrics (final capture)",
    "",
    "| baseline | repo | family | hermes-mode | exact-current | stale | stale-bytes | duplicate | required-recall | projection-bytes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of rows.sort((a, b) =>
    a.repo.localeCompare(b.repo)
    || a.family.localeCompare(b.family)
    || COMPARISON_BASELINES.indexOf(a.baseline) - COMPARISON_BASELINES.indexOf(b.baseline),
  )) {
    const hermesMode = row.baseline.startsWith("hermes") ? (row.hermesMode ?? "n/a") : "n/a";
    lines.push(
      `| ${[
        row.baseline,
        row.repo,
        row.family,
        hermesMode,
        row.exactCurrent.toFixed(3),
        row.stale.toFixed(3),
        String(row.staleBytes),
        row.duplicate.toFixed(1),
        row.requiredRecall.toFixed(3),
        String(row.projectionBytes),
      ].join(" | ")} |`,
    );
  }

  lines.push("", "## Delta vs core `freshctx-region` (final capture per trace)", "");
  lines.push("| repo | family | baseline | hermes-mode | recall | exact-current | stale | stale-bytes | projection-bytes | delta-bytes vs region |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

  const regionByKey = new Map(
    rows.filter((row) => row.baseline === "freshctx-region").map((row) => [`${row.repo}\t${row.family}`, row]),
  );
  for (const row of rows.sort((a, b) =>
    a.repo.localeCompare(b.repo)
    || a.family.localeCompare(b.family)
    || COMPARISON_BASELINES.indexOf(a.baseline) - COMPARISON_BASELINES.indexOf(b.baseline),
  )) {
    const region = regionByKey.get(`${row.repo}\t${row.family}`);
    const delta = region ? row.projectionBytes - region.projectionBytes : "n/a";
    const hermesMode = row.baseline.startsWith("hermes") ? (row.hermesMode ?? "n/a") : "n/a";
    lines.push(
      `| ${row.repo} | ${row.family} | ${row.baseline} | ${hermesMode} | ${row.requiredRecall.toFixed(3)} | ${row.exactCurrent.toFixed(3)} | ${row.stale.toFixed(3)} | ${row.staleBytes} | ${row.projectionBytes} | ${delta} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function runNativeBudgetPressurePack({ skipReportWrite = false, invoked = false } = {}) {
  const writeArtifacts = shouldWriteTrackedReports({ skipReportWrite, invoked });
  const traces = await listBudgetPressureTraces(ROOT);
  if (traces.length === 0) {
    throw new Error(`no budget-pressure traces found in ${BUDGET_PRESSURE_LAB_PACK_ID}`);
  }

  const priorCaptureOk = process.env.FRESHCTX_CAPTURE_OK;
  process.env.FRESHCTX_CAPTURE_OK = "1";

  const hostsLockBytes = await readFile(HOSTS_LOCK_PATH);
  const hostsLock = JSON.parse(hostsLockBytes.toString("utf8"));
  const reposLock = await loadJson(REPOS_LOCK_PATH);
  const systemCommit = gitCommit();
  const environmentSha256 = environmentDigest();
  const runId = createHash("sha256")
    .update(`${systemCommit}:native-budget-pressure:${Date.now()}:${traces.length}`)
    .digest("hex")
    .slice(0, 16);
  const jsonlPath = join(REPORTS_DIR, "budget-pressure-native.jsonl");
  if (writeArtifacts) {
    await mkdir(REPORTS_DIR, { recursive: true });
    await writeFile(jsonlPath, "");
  }

  const perTraceRows = [];
  const hermesModes = [];

  try {
    for (const trace of traces) {
      const traceSha256 = sha256(JSON.stringify(trace));
      const repoId = trace.name.split("/")[0];
      const repoCommit = reposLock.repositories[repoId]?.commit ?? trace.source?.commit;

      const [
        regionResult,
        fileResult,
        piNativeResult,
        hermesNativeResult,
      ] = await Promise.all([
        runTrace(trace, "freshctx-region"),
        runTrace(trace, "freshctx-file"),
        runPiNativeTrace(trace),
        runHermesNativeTrace(trace, { budgetPressure: true }),
      ]);

      const hermesCapture = finalHermesNativeCapture(hermesNativeResult);
      if (hermesCapture?.nativeMode) {
        hermesModes.push(hermesCapture.nativeMode);
      }

      const captures = [
        captureRow("freshctx-region", regionResult, finalCapture),
        captureRow("freshctx-file", fileResult, finalCapture),
        captureRow("pi-native", piNativeResult, finalPiNativeCapture),
        captureRow(hermesNativeResult.baseline ?? "hermes-native", hermesNativeResult, finalHermesNativeCapture),
      ].filter(Boolean);

      for (const row of captures) {
        perTraceRows.push(row);
        if (!writeArtifacts) continue;
        const record = {
          schema_version: 1,
          run_id: runId,
          label: "budget-pressure-dev",
          system: row.baseline,
          system_commit: systemCommit,
          repo: repoId,
          repo_commit: repoCommit,
          trace_sha256: traceSha256,
          trace_name: trace.name,
          mutation_family: row.family,
          host_version: HOST_VERSION,
          hosts_lock_sha256: sha256(hostsLockBytes),
          pi_host_commit: hostsLock.hosts.pi.commit,
          hermes_host_commit: hostsLock.hosts.hermes.commit,
          environment_sha256: environmentSha256,
          repetition: 1,
          correctness: {
            exact_current_rate: row.exactCurrent,
            required_recall: row.requiredRecall,
            stale_unit_rate: row.stale,
            stale_bytes: row.staleBytes,
            duplicate_units: row.duplicate,
          },
          bytes: {
            projection_bytes: row.projectionBytes,
            cache_prefix_reuse: row.cachePrefixReuse,
          },
          latency_ms: {
            p50: row.transformMs,
            p95: row.transformMs,
          },
          payload_sha256: row.payloadSha256,
          native_mode: row.nativeMode,
        };
        await appendFile(jsonlPath, `${JSON.stringify(record)}\n`);
      }
    }
  } finally {
    if (priorCaptureOk === undefined) {
      delete process.env.FRESHCTX_CAPTURE_OK;
    } else {
      process.env.FRESHCTX_CAPTURE_OK = priorCaptureOk;
    }
  }

  const rows = aggregateRows(perTraceRows);
  const report = formatBakeoffTable(rows, {
    sha256: sha256(hostsLockBytes),
    pi: hostsLock.hosts.pi.commit,
    hermes: hostsLock.hosts.hermes.commit,
  });
  const reportPath = join(REPORTS_DIR, "budget-pressure-native.md");
  if (writeArtifacts) {
    await writeFile(reportPath, report);
  }

  const allHermesNoOp = hermesModes.length > 0 && hermesModes.every((mode) => mode === "native-no-op");

  return {
    label: "budget-pressure-dev",
    packId: BUDGET_PRESSURE_LAB_PACK_ID,
    traces: traces.length,
    records: perTraceRows.length,
    jsonlPath,
    reportPath,
    rows: rows.filter((row) => typeof row.baseline === "string"),
    hermesModes: [...new Set(hermesModes)],
    allHermesNoOp,
    hostsLockSha256: sha256(hostsLockBytes),
    hosts: {
      pi: hostsLock.hosts.pi.commit,
      hermes: hostsLock.hosts.hermes.commit,
    },
  };
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  const summary = await runNativeBudgetPressurePack({ invoked: true });
  console.log(JSON.stringify(summary, null, 2));
}
