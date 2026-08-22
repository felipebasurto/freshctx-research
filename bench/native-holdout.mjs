import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { finalCapture, runTrace } from "./trace-runner.mjs";
import { finalPiCapture, runPiTrace } from "./pi-trace-runner.mjs";
import { finalHermesCapture, runHermesTrace } from "./hermes-trace-runner.mjs";
import { finalPiNativeCapture, runPiNativeTrace } from "./pi-native-trace-runner.mjs";
import { finalHermesNativeCapture, runHermesNativeTrace } from "./hermes-native-trace-runner.mjs";
import { percentile } from "./metrics.mjs";
import { sha256 } from "../src/hash.mjs";
import { guardLegacyHoldoutEntrypoint, HOLDOUT_V01 } from "./legacy-holdout-guard.mjs";
import { shouldWriteTrackedReports } from "./report-artifacts.mjs";
import { HOSTS_LOCK_PATH } from "./hosts-path.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TRACES_DIR = join(ROOT, "bench", "traces", "holdout");
const REPORTS_DIR = join(ROOT, "bench", "reports");
const RESULTS_TSV = join(ROOT, "autoresearch", "results.tsv");
const REPOS_LOCK_PATH = join(ROOT, "bench", "repos.lock.json");
const HOST_VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version;

const COMPARISON_BASELINES = Object.freeze([
  "freshctx-region",
  "freshctx-file",
  "pi-adapter",
  "hermes-adapter",
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

async function listHoldoutTraces() {
  const names = await readdir(TRACES_DIR);
  const traces = [];
  for (const name of names.filter((item) => item.endsWith(".json") && !item.startsWith("candidates")).sort()) {
    traces.push(await loadJson(join(TRACES_DIR, name)));
  }
  return traces;
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
  }));
}

function formatBakeoffTable(rows) {
  const hostsLock = rows._hostsLock;
  const lines = [
    "# CtxBench native host context bake-off (holdout v0.1)",
    "",
    "Label: `public-repo-holdout` / `native-host`. Measurement infrastructure only; not a performance claim.",
    "",
    "Native columns run each host's own context manager on the same 10 holdout traces. Adapter columns (PCR 0008) replay FreshCtx-through-the-adapter for contrast.",
    "",
    `- hosts.lock SHA-256: \`${hostsLock.sha256}\``,
    `- pi host SHA: \`${hostsLock.pi}\``,
    `- hermes host SHA: \`${hostsLock.hermes}\``,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Per-cell metrics (10 traces)",
    "",
    "| baseline | repo | family | exact-current | stale | stale-bytes | duplicate | required-recall | projection-bytes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
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
        row.duplicate.toFixed(1),
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

  return `${lines.join("\n")}\n`;
}

export async function runNativeHoldoutPack({ packId, skipReportWrite = false, invoked = false } = {}) {
  const writeArtifacts = shouldWriteTrackedReports({ skipReportWrite, invoked });
  guardLegacyHoldoutEntrypoint("ctxbench:native-holdout", { packId, tracesDir: HOLDOUT_V01.tracesDir });

  const traces = await listHoldoutTraces();
  if (traces.length === 0) throw new Error("no holdout traces found in bench/traces/holdout");

  const hostsLockBytes = await readFile(HOSTS_LOCK_PATH);
  const hostsLock = JSON.parse(hostsLockBytes.toString("utf8"));
  const reposLock = await loadJson(REPOS_LOCK_PATH);
  const systemCommit = gitCommit();
  const environmentSha256 = environmentDigest();
  const runId = createHash("sha256")
    .update(`${systemCommit}:native-holdout:${Date.now()}:${traces.length}`)
    .digest("hex")
    .slice(0, 16);
  const jsonlPath = join(REPORTS_DIR, "native-holdout.jsonl");
  if (writeArtifacts) {
    await mkdir(REPORTS_DIR, { recursive: true });
    await writeFile(jsonlPath, "");
  }

  const perTraceRows = [];
  for (const trace of traces) {
    const traceSha256 = sha256(JSON.stringify(trace));
    const repoId = trace.name.split("/")[0];
    const repoCommit = reposLock.repositories[repoId]?.commit ?? trace.source?.commit;

    const [
      regionResult,
      fileResult,
      piAdapterResult,
      hermesAdapterResult,
      piNativeResult,
      hermesNativeResult,
    ] = await Promise.all([
      runTrace(trace, "freshctx-region"),
      runTrace(trace, "freshctx-file"),
      runPiTrace(trace),
      runHermesTrace(trace),
      runPiNativeTrace(trace),
      runHermesNativeTrace(trace),
    ]);

    const captures = [
      captureRow("freshctx-region", regionResult, finalCapture),
      captureRow("freshctx-file", fileResult, finalCapture),
      captureRow("pi-adapter", piAdapterResult, finalPiCapture),
      captureRow("hermes-adapter", hermesAdapterResult, finalHermesCapture),
      captureRow("pi-native", piNativeResult, finalPiNativeCapture),
      captureRow(hermesNativeResult.baseline ?? "hermes-native", hermesNativeResult, finalHermesNativeCapture),
    ].filter(Boolean);

    for (const row of captures) {
      perTraceRows.push(row);
      if (!writeArtifacts) continue;
      const record = {
        schema_version: 1,
        run_id: runId,
        label: "public-repo-holdout",
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

  const rows = aggregateRows(perTraceRows);
  rows._hostsLock = {
    sha256: sha256(hostsLockBytes),
    pi: hostsLock.hosts.pi.commit,
    hermes: hostsLock.hosts.hermes.commit,
  };
  const report = formatBakeoffTable(rows);
  const reportPath = join(REPORTS_DIR, "native-holdout.md");
  if (writeArtifacts) {
    await writeFile(reportPath, report);
  }

  const snapshot = rows.find((row) => row.baseline === "pi-native") ?? rows[0];
  const tsvLine = [
    new Date().toISOString(),
    systemCommit,
    "n/a-holdout-only",
    "Native host context bake-off on holdout v0.1 traces",
    "n/a",
    snapshot?.exactCurrent.toFixed(6) ?? "0",
    snapshot?.stale.toFixed(6) ?? "0",
    snapshot?.requiredRecall.toFixed(6) ?? "0",
    String(snapshot?.projectionBytes ?? 0),
    snapshot?.cachePrefixReuse.toFixed(6) ?? "0",
    snapshot?.transformP95.toFixed(3) ?? "0",
    "review",
    `native-host bake-off scaffold; pi=${hostsLock.hosts.pi.commit.slice(0, 7)} hermes=${hostsLock.hosts.hermes.commit.slice(0, 7)}`,
  ].join("\t");
  if (writeArtifacts) {
    await appendFile(RESULTS_TSV, `${tsvLine}\n`);
  }

  return {
    label: "public-repo-holdout",
    traces: traces.length,
    records: perTraceRows.length,
    jsonlPath,
    reportPath,
    rows: rows.filter((row) => typeof row.baseline === "string"),
    hostsLockSha256: sha256(hostsLockBytes),
    hosts: {
      pi: hostsLock.hosts.pi.commit,
      hermes: hostsLock.hosts.hermes.commit,
    },
  };
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  const summary = await runNativeHoldoutPack({ invoked: true });
  console.log(JSON.stringify(summary, null, 2));
}
