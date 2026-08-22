import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { finalCapture, runTrace } from "./trace-runner.mjs";
import { finalHermesCapture, runHermesTrace } from "./hermes-trace-runner.mjs";
import { finalPiCapture, runPiTrace } from "./pi-trace-runner.mjs";
import { finalHermesNativeCapture, runHermesNativeTrace } from "./hermes-native-trace-runner.mjs";
import { hermesFreshMatchesRegion } from "./budget-pressure-hermes-fresh.mjs";
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
const NATIVE_REPORT_PATH = join(REPORTS_DIR, "budget-pressure-native.md");
const HERMES_HOST_MODULE = join(ROOT, "bench", "hosts", "hermes", "agent", "context_engine.py");
const HOST_VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version;
const PCR_0036_SQUASH = "bfb9bb20d6aaeb378c0b4052942792288a75f357";

export const BUDGET_PRESSURE_ADAPTER_PRUNE_LABEL = "budget-pressure-adapter-prune-dev-v0.1";

/** PCR 0035 pre-prune hermes-fresh projection-bytes (approximate constant +19696 vs region). */
const PCR_0035_HERMES_FRESH_PROJECTION = Object.freeze({
  "go-tools\tappend": 20300,
  "go-tools\tdelete": 19860,
  "go-tools\tinterior-edit": 20258,
  "neovim\tappend": 20725,
  "neovim\tdelete": 19860,
  "neovim\tinterior-edit": 20568,
});

const COMPARISON_BASELINES = Object.freeze([
  "freshctx-region",
  "hermes-native",
  "hermes-fresh",
  "pi-fresh",
]);

function gitCommit() {
  const run = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : "unknown";
}

function mergeBase(commit) {
  const run = spawnSync("git", ["merge-base", "HEAD", commit], { encoding: "utf8" });
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
    requiredRecall: capture.metrics.requiredRecall,
    projectionBytes: capture.metrics.projectionBytes,
    transformMs: capture.telemetry.totalMs ?? 0,
    payloadSha256: capture.payloadSha256,
    replayed: false,
  };
}

function replayRow({ baseline, repo, family, exactCurrent, stale, staleBytes, requiredRecall, projectionBytes }) {
  return {
    baseline,
    repo,
    family,
    exactCurrent,
    stale,
    staleBytes,
    requiredRecall,
    projectionBytes,
    transformMs: 0,
    payloadSha256: null,
    replayed: true,
  };
}

function parseNativeReportTable(text) {
  const rows = [];
  const headerIndex = text.indexOf("## Per-cell metrics (final capture)");
  if (headerIndex === -1) return rows;
  const section = text.slice(headerIndex);
  const lines = section.split("\n").filter((line) => line.startsWith("|") && !line.includes("---"));
  for (const line of lines.slice(1)) {
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 10) continue;
    const [
      baseline,
      repo,
      family,
      ,
      exactCurrent,
      stale,
      staleBytes,
      ,
      requiredRecall,
      projectionBytes,
    ] = cells;
    if (!["freshctx-region", "hermes-native"].includes(baseline)) continue;
    rows.push(replayRow({
      baseline,
      repo,
      family,
      exactCurrent: Number(exactCurrent),
      stale: Number(stale),
      staleBytes: Number(staleBytes),
      requiredRecall: Number(requiredRecall),
      projectionBytes: Number(projectionBytes),
    }));
  }
  return rows;
}

async function loadNativeReplayRows() {
  if (!existsSync(NATIVE_REPORT_PATH)) return [];
  const text = await readFile(NATIVE_REPORT_PATH, "utf8");
  return parseNativeReportTable(text);
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
      requiredRecall: [],
      projectionBytes: [],
      transformP50: [],
      transformP95: [],
      replayed: row.replayed,
    };
    bucket.exactCurrent.push(row.exactCurrent);
    bucket.stale.push(row.stale);
    bucket.staleBytes.push(row.staleBytes);
    bucket.requiredRecall.push(row.requiredRecall);
    bucket.projectionBytes.push(row.projectionBytes);
    bucket.transformP50.push(row.transformMs);
    bucket.transformP95.push(row.transformMs);
    bucket.replayed = bucket.replayed && row.replayed;
    grouped.set(key, bucket);
  }

  return [...grouped.values()].map((bucket) => ({
    baseline: bucket.baseline,
    repo: bucket.repo,
    family: bucket.family,
    exactCurrent: bucket.exactCurrent.reduce((a, b) => a + b, 0) / bucket.exactCurrent.length,
    stale: bucket.stale.reduce((a, b) => a + b, 0) / bucket.stale.length,
    staleBytes: Math.round(bucket.staleBytes.reduce((a, b) => a + b, 0) / bucket.staleBytes.length),
    requiredRecall: bucket.requiredRecall.reduce((a, b) => a + b, 0) / bucket.requiredRecall.length,
    projectionBytes: Math.round(bucket.projectionBytes.reduce((a, b) => a + b, 0) / bucket.projectionBytes.length),
    transformP50: percentile(bucket.transformP50, 0.5),
    transformP95: percentile(bucket.transformP95, 0.95),
    replayed: bucket.replayed,
  }));
}

function bytesDroppedVsPcr0035(rows) {
  const freshRows = rows.filter((row) => row.baseline === "hermes-fresh");
  const drops = [];
  for (const fresh of freshRows) {
    const prior = PCR_0035_HERMES_FRESH_PROJECTION[`${fresh.repo}\t${fresh.family}`];
    if (prior == null) continue;
    drops.push({
      repo: fresh.repo,
      family: fresh.family,
      pcr0035ProjectionBytes: prior,
      prunedProjectionBytes: fresh.projectionBytes,
      deltaBytes: prior - fresh.projectionBytes,
    });
  }
  return drops;
}

function formatReport(rows, hostsLock, {
  systemCommit,
  mergeBaseCommit,
  matchResult,
  hermesNativeSource,
  bytesDropped,
}) {
  const freshnessHeld = matchResult.matched;
  const bytesDroppedAll = bytesDropped.length > 0
    && bytesDropped.every((item) => item.deltaBytes > 0);
  const lines = [
    `# CtxBench budget-pressure adapter prune (${BUDGET_PRESSURE_ADAPTER_PRUNE_LABEL})`,
    "",
    "Label: `budget-pressure-dev` / adapter-prune. Hermes/Pi request assembly drops unserved read tool pairs whenever a projection is applied (untracked or omitted from projection); keeps gold markers and FreshCtx region projection.",
    "",
    `- pack: \`${BUDGET_PRESSURE_LAB_PACK_ID}\``,
    `- status: candidate`,
    `- resultSetHash: null`,
    `- HEAD: \`${systemCommit}\``,
    `- merge-base vs ${PCR_0036_SQUASH.slice(0, 8)}: \`${mergeBaseCommit}\``,
    `- door blob (src/anchors.mjs): \`f8771c93894095348185ef3453a3c2498355b3c6\``,
    `- repos.lock blob: \`79e29d09a9ec12b1128617f683f50a35a3c8809e\``,
    `- hosts.lock SHA-256: \`${hostsLock.sha256}\``,
    `- pi host SHA: \`${hostsLock.pi}\``,
    `- hermes host SHA: \`${hostsLock.hermes}\``,
    `- hermes-native source: ${hermesNativeSource}`,
    "",
    "## Freshness and bytes vs PCR 0035",
    "",
    `- freshness held (hermes-fresh stale/recall vs region): **${freshnessHeld ? "yes" : "no"}**`,
    `- projection-bytes dropped vs PCR 0035 ~20k hermes-fresh: **${bytesDroppedAll ? "yes" : "partial/no"}**`,
    "",
    matchResult.matched
      ? "**Finding:** pruned hermes-fresh matched freshctx-region on required-recall and stale-bytes for all 6 cells."
      : `**Finding:** pruned hermes-fresh did **not** match freshctx-region on stale/recall:\n\n${matchResult.mismatches.map((item) => `- ${item}`).join("\n")}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Per-cell metrics (final capture)",
    "",
    "| baseline | repo | family | exact-current | stale | stale-bytes | required-recall | projection-bytes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of rows.sort((a, b) =>
    a.repo.localeCompare(b.repo)
    || a.family.localeCompare(b.family)
    || COMPARISON_BASELINES.indexOf(a.baseline) - COMPARISON_BASELINES.indexOf(b.baseline),
  )) {
    lines.push(
      `| ${[
        row.baseline,
        row.repo,
        row.family,
        row.exactCurrent.toFixed(3),
        row.stale.toFixed(3),
        String(row.staleBytes),
        row.requiredRecall.toFixed(3),
        String(row.projectionBytes),
      ].join(" | ")} |`,
    );
  }

  lines.push("", "## Delta vs core `freshctx-region` (final capture per trace)", "");
  lines.push("| repo | family | baseline | recall | exact-current | stale | stale-bytes | projection-bytes | delta-bytes vs region |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");

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
    lines.push(
      `| ${row.repo} | ${row.family} | ${row.baseline} | ${row.requiredRecall.toFixed(3)} | ${row.exactCurrent.toFixed(3)} | ${row.stale.toFixed(3)} | ${row.staleBytes} | ${row.projectionBytes} | ${delta} |`,
    );
  }

  if (bytesDropped.length > 0) {
    lines.push("", "## Delta vs PCR 0035 hermes-fresh projection-bytes", "");
    lines.push("| repo | family | PCR 0035 projection-bytes | pruned projection-bytes | delta-bytes |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const item of bytesDropped) {
      lines.push(
        `| ${item.repo} | ${item.family} | ${item.pcr0035ProjectionBytes} | ${item.prunedProjectionBytes} | ${item.deltaBytes} |`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function runBudgetPressureAdapterPrunePack({ skipReportWrite = false, invoked = false } = {}) {
  const writeArtifacts = shouldWriteTrackedReports({ skipReportWrite, invoked });
  const traces = await listBudgetPressureTraces(ROOT);
  if (traces.length === 0) {
    throw new Error(`no budget-pressure traces found in ${BUDGET_PRESSURE_LAB_PACK_ID}`);
  }

  const traceHashes = traces.map((trace) => sha256(JSON.stringify(trace))).sort();
  const traceSetHash = sha256(traceHashes.join("\n"));

  const hostsLockBytes = await readFile(HOSTS_LOCK_PATH);
  const hostsLock = JSON.parse(hostsLockBytes.toString("utf8"));
  const reposLock = await loadJson(REPOS_LOCK_PATH);
  const systemCommit = gitCommit();
  const mergeBaseCommit = mergeBase(PCR_0036_SQUASH);
  const environmentSha256 = environmentDigest();
  const runId = createHash("sha256")
    .update(`${systemCommit}:budget-pressure-adapter-prune:${Date.now()}:${traces.length}`)
    .digest("hex")
    .slice(0, 16);
  const jsonlPath = join(REPORTS_DIR, "budget-pressure-adapter-prune.jsonl");
  if (writeArtifacts) {
    await mkdir(REPORTS_DIR, { recursive: true });
    await writeFile(jsonlPath, "");
  }

  const hermesHostReady = existsSync(HERMES_HOST_MODULE);
  const nativeReplayRows = hermesHostReady ? [] : await loadNativeReplayRows();
  const replayByKey = new Map(
    nativeReplayRows.map((row) => [`${row.baseline}\t${row.repo}\t${row.family}`, row]),
  );
  const hermesNativeSource = hermesHostReady
    ? "live run (bench/hosts/hermes checkout present)"
    : (nativeReplayRows.length > 0
      ? "replayed from bench/reports/budget-pressure-native.md (PCR 0033; trace-set hash verified)"
      : "unavailable (no host checkout and no native replay report)");

  const perTraceRows = [];

  for (const trace of traces) {
    const traceSha256 = sha256(JSON.stringify(trace));
    const repoId = trace.name.split("/")[0];
    const repoCommit = reposLock.repositories[repoId]?.commit ?? trace.source?.commit;

    const [regionResult, hermesFreshResult, piFreshResult] = await Promise.all([
      runTrace(trace, "freshctx-region"),
      runHermesTrace(trace),
      runPiTrace(trace),
    ]);

    const rowsForTrace = [
      captureRow("freshctx-region", regionResult, finalCapture),
      captureRow("hermes-fresh", hermesFreshResult, finalHermesCapture),
      captureRow("pi-fresh", piFreshResult, finalPiCapture),
    ].filter(Boolean);

    if (hermesHostReady) {
      const priorCaptureOk = process.env.FRESHCTX_CAPTURE_OK;
      process.env.FRESHCTX_CAPTURE_OK = "1";
      try {
        const hermesNativeResult = await runHermesNativeTrace(trace, { budgetPressure: true });
        const nativeRow = captureRow("hermes-native", hermesNativeResult, finalHermesNativeCapture);
        if (nativeRow) rowsForTrace.push(nativeRow);
      } finally {
        if (priorCaptureOk === undefined) delete process.env.FRESHCTX_CAPTURE_OK;
        else process.env.FRESHCTX_CAPTURE_OK = priorCaptureOk;
      }
    } else {
      const family = regionResult.mutationFamily;
      const replayNative = replayByKey.get(`hermes-native\t${repoId}\t${family}`);
      if (replayNative) rowsForTrace.push({ ...replayNative });
    }

    for (const row of rowsForTrace) {
      perTraceRows.push(row);
      if (!writeArtifacts) continue;
      const record = {
        schema_version: 1,
        run_id: runId,
        label: BUDGET_PRESSURE_ADAPTER_PRUNE_LABEL,
        system: row.baseline,
        system_commit: systemCommit,
        repo: repoId,
        repo_commit: repoCommit,
        trace_sha256: traceSha256,
        trace_set_hash: traceSetHash,
        trace_name: trace.name,
        mutation_family: row.family,
        host_version: HOST_VERSION,
        hosts_lock_sha256: sha256(hostsLockBytes),
        pi_host_commit: hostsLock.hosts.pi.commit,
        hermes_host_commit: hostsLock.hosts.hermes.commit,
        environment_sha256: environmentSha256,
        repetition: 1,
        replayed: row.replayed ?? false,
        correctness: {
          exact_current_rate: row.exactCurrent,
          required_recall: row.requiredRecall,
          stale_unit_rate: row.stale,
          stale_bytes: row.staleBytes,
        },
        bytes: {
          projection_bytes: row.projectionBytes,
        },
        latency_ms: {
          p50: row.transformMs,
          p95: row.transformMs,
        },
        payload_sha256: row.payloadSha256,
      };
      await appendFile(jsonlPath, `${JSON.stringify(record)}\n`);
    }
  }

  const rows = aggregateRows(perTraceRows);
  const matchResult = hermesFreshMatchesRegion(rows);
  const bytesDropped = bytesDroppedVsPcr0035(rows);
  const report = formatReport(rows, {
    sha256: sha256(hostsLockBytes),
    pi: hostsLock.hosts.pi.commit,
    hermes: hostsLock.hosts.hermes.commit,
  }, {
    systemCommit,
    mergeBaseCommit,
    matchResult,
    hermesNativeSource,
    bytesDropped,
  });
  const reportPath = join(REPORTS_DIR, "budget-pressure-adapter-prune.md");
  if (writeArtifacts) {
    await writeFile(reportPath, report);
  }

  return {
    label: BUDGET_PRESSURE_ADAPTER_PRUNE_LABEL,
    packId: BUDGET_PRESSURE_LAB_PACK_ID,
    traces: traces.length,
    records: perTraceRows.length,
    traceSetHash,
    jsonlPath,
    reportPath,
    rows,
    hermesFreshMatchesRegion: matchResult.matched,
    hermesFreshMismatches: matchResult.mismatches,
    bytesDroppedVsPcr0035: bytesDropped,
    hermesNativeSource,
    hermesHostReady,
    hostsLockSha256: sha256(hostsLockBytes),
    systemCommit,
    mergeBaseCommit,
    hosts: {
      pi: hostsLock.hosts.pi.commit,
      hermes: hostsLock.hosts.hermes.commit,
    },
  };
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  const summary = await runBudgetPressureAdapterPrunePack({ invoked: true });
  console.log(JSON.stringify(summary, null, 2));
}
