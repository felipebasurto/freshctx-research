import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { finalCapture, runTrace } from "./trace-runner.mjs";
import { finalHermesCapture, runHermesTrace } from "./hermes-trace-runner.mjs";
import { finalPiCapture, runPiTrace } from "./pi-trace-runner.mjs";
import { finalPiNativeCapture, runPiNativeTrace } from "./pi-native-trace-runner.mjs";
import { finalHermesNativeCapture, runHermesNativeTrace } from "./hermes-native-trace-runner.mjs";
import { hermesFreshMatchesRegion } from "./budget-pressure-hermes-fresh.mjs";
import { percentile } from "./metrics.mjs";
import { sha256 } from "../src/hash.mjs";
import { guardLegacyHoldoutEntrypoint, HOLDOUT_V01 } from "./legacy-holdout-guard.mjs";
import { shouldWriteTrackedReports } from "./report-artifacts.mjs";
import { HOSTS_LOCK_PATH } from "./hosts-path.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TRACES_DIR = join(ROOT, "bench", "traces", "holdout");
const REPORTS_DIR = join(ROOT, "bench", "reports");
const REPOS_LOCK_PATH = join(ROOT, "bench", "repos.lock.json");
const NATIVE_HOLDOUT_REPORT_PATH = join(REPORTS_DIR, "native-holdout.md");
const HERMES_HOST_MODULE = join(ROOT, "bench", "hosts", "hermes", "agent", "context_engine.py");
const HOST_VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version;
const PCR_0038_SQUASH = "e45b2cdbf15aec2b4133e232e5b005dd832f49cb";
const DOOR_BLOB = "f8771c93894095348185ef3453a3c2498355b3c6";
const REPOS_LOCK_BLOB = "79e29d09a9ec12b1128617f683f50a35a3c8809e";

export const HOLDOUT_ADAPTER_BAKEOFF_LABEL = "holdout-adapter-bakeoff-dev-v0.1";

const COMPARISON_BASELINES = Object.freeze([
  "freshctx-region",
  "freshctx-file",
  "corvus-file",
  "hermes-fresh",
  "hermes-native",
  "pi-native",
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

async function listHoldoutTraces() {
  const names = await readdir(TRACES_DIR);
  const traces = [];
  for (const name of names.filter((item) => item.endsWith(".json") && !item.startsWith("candidates")).sort()) {
    traces.push(await loadJson(join(TRACES_DIR, name)));
  }
  return traces;
}

function captureRow(baseline, result, finalCaptureFn, { nativeMode = null, replayed = false } = {}) {
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
    nativeMode: nativeMode ?? capture.nativeMode ?? null,
    replayed,
  };
}

function replayRow({
  baseline,
  repo,
  family,
  exactCurrent,
  stale,
  staleBytes,
  requiredRecall,
  projectionBytes,
  nativeMode = null,
}) {
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
    nativeMode,
    replayed: true,
  };
}

function parseNativeHoldoutReportTable(text, baselines) {
  const rows = [];
  const headerIndex = text.indexOf("## Per-cell metrics (10 traces)");
  if (headerIndex === -1) return rows;
  const section = text.slice(headerIndex);
  const lines = section.split("\n").filter((line) => line.startsWith("|") && !line.includes("---"));
  for (const line of lines.slice(1)) {
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 9) continue;
    const [
      baseline,
      repo,
      family,
      exactCurrent,
      stale,
      staleBytes,
      ,
      requiredRecall,
      projectionBytes,
    ] = cells;
    if (!baselines.includes(baseline)) continue;
    rows.push(replayRow({
      baseline,
      repo,
      family,
      exactCurrent: Number(exactCurrent),
      stale: Number(stale),
      staleBytes: Number(staleBytes),
      requiredRecall: Number(requiredRecall),
      projectionBytes: Number(projectionBytes),
      nativeMode: baseline === "hermes-native" ? "native-no-op" : null,
    }));
  }
  return rows;
}

async function loadNativeHoldoutReplayRows(baselines) {
  if (!existsSync(NATIVE_HOLDOUT_REPORT_PATH)) return [];
  const text = await readFile(NATIVE_HOLDOUT_REPORT_PATH, "utf8");
  return parseNativeHoldoutReportTable(text, baselines);
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
      nativeModes: [],
      replayed: row.replayed,
    };
    bucket.exactCurrent.push(row.exactCurrent);
    bucket.stale.push(row.stale);
    bucket.staleBytes.push(row.staleBytes);
    bucket.requiredRecall.push(row.requiredRecall);
    bucket.projectionBytes.push(row.projectionBytes);
    bucket.transformP50.push(row.transformMs);
    bucket.transformP95.push(row.transformMs);
    if (row.nativeMode) bucket.nativeModes.push(row.nativeMode);
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
    nativeMode: bucket.nativeModes.length > 0 ? bucket.nativeModes.at(-1) : null,
    replayed: bucket.replayed,
  }));
}

export function corvusFileStaleRecallVsRegion(rows) {
  const regionByKey = new Map(
    rows.filter((row) => row.baseline === "freshctx-region").map((row) => [`${row.repo}\t${row.family}`, row]),
  );
  const corvusRows = rows.filter((row) => row.baseline === "corvus-file");
  const mismatches = [];
  for (const corvus of corvusRows) {
    const region = regionByKey.get(`${corvus.repo}\t${corvus.family}`);
    if (!region) {
      mismatches.push(`${corvus.repo}/${corvus.family}: missing freshctx-region control`);
      continue;
    }
    if (corvus.staleBytes !== region.staleBytes) {
      mismatches.push(
        `${corvus.repo}/${corvus.family}: stale-bytes corvus-file=${corvus.staleBytes} region=${region.staleBytes}`,
      );
    }
    if (corvus.requiredRecall !== region.requiredRecall) {
      mismatches.push(
        `${corvus.repo}/${corvus.family}: required-recall corvus-file=${corvus.requiredRecall} region=${region.requiredRecall}`,
      );
    }
  }
  return {
    matched: mismatches.length === 0,
    mismatches,
  };
}

export function summarizeHermesNativeModes(rows) {
  const nativeRows = rows.filter((row) => row.baseline === "hermes-native");
  const modes = new Set(nativeRows.map((row) => row.nativeMode ?? "native-no-op"));
  const compressCells = nativeRows.filter((row) => row.nativeMode === "compress");
  return {
    allNativeNoOp: compressCells.length === 0,
    modes: [...modes].sort(),
    compressCount: compressCells.length,
    totalCells: nativeRows.length,
    cells: nativeRows.map((row) => ({
      repo: row.repo,
      family: row.family,
      mode: row.nativeMode ?? "native-no-op",
    })),
  };
}

function formatReport(rows, hostsLock, {
  systemCommit,
  mergeBaseCommit,
  matchResult,
  corvusMatchResult,
  corvusFileSource,
  hermesNativeSummary,
  hermesNativeSource,
}) {
  const lines = [
    `# CtxBench holdout adapter bake-off (${HOLDOUT_ADAPTER_BAKEOFF_LABEL})`,
    "",
    "Label: `public-repo-holdout` / `holdout-adapter-bakeoff`. Publishable table on sealed holdout v0.1 traces; not a SOTA claim.",
    "",
    `- pack: \`holdout-v0.1\``,
    `- status: candidate`,
    `- resultSetHash: null`,
    `- HEAD: \`${systemCommit}\``,
    `- merge-base vs ${PCR_0038_SQUASH.slice(0, 8)}: \`${mergeBaseCommit}\``,
    `- door blob (src/anchors.mjs): \`${DOOR_BLOB}\``,
    `- repos.lock blob: \`${REPOS_LOCK_BLOB}\``,
    `- hosts.lock SHA-256: \`${hostsLock.sha256}\``,
    `- pi host SHA: \`${hostsLock.pi}\``,
    `- hermes host SHA: \`${hostsLock.hermes}\``,
    `- hermes-native source: ${hermesNativeSource}`,
    `- corvus-file source: ${corvusFileSource}`,
    "",
    "## corvus-file vs freshctx-region (stale/recall)",
    "",
    corvusMatchResult.matched
      ? "**Finding:** corvus-file matched freshctx-region on required-recall and stale-bytes for all 10 holdout cells."
      : `**Finding:** corvus-file did **not** match freshctx-region on stale/recall:\n\n${corvusMatchResult.mismatches.map((item) => `- ${item}`).join("\n")}`,
    "",
    "## hermes-fresh vs freshctx-region (stale/recall)",
    "",
    matchResult.matched
      ? "**Finding:** hermes-fresh matched freshctx-region on required-recall and stale-bytes for all 10 holdout cells."
      : `**Finding:** hermes-fresh did **not** match freshctx-region on stale/recall:\n\n${matchResult.mismatches.map((item) => `- ${item}`).join("\n")}`,
    "",
    "## Hermes native compression (holdout window)",
    "",
    hermesNativeSummary.allNativeNoOp
      ? "**Finding:** Hermes native stayed **native-no-op** on all 10 cells (holdout window below `should_compress` threshold; no Hermes quality number claimed)."
      : `**Finding:** Hermes native reached **compress** on ${hermesNativeSummary.compressCount}/${hermesNativeSummary.totalCells} cells (modes: ${hermesNativeSummary.modes.join(", ")}); not a quality claim without live summarization.`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Per-cell metrics (10 traces)",
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

  if (hermesNativeSummary.cells.length > 0) {
    lines.push("", "## Hermes native mode per cell", "");
    lines.push("| repo | family | hermes-mode |");
    lines.push("| --- | --- | --- |");
    for (const cell of hermesNativeSummary.cells.sort((a, b) =>
      a.repo.localeCompare(b.repo) || a.family.localeCompare(b.family),
    )) {
      lines.push(`| ${cell.repo} | ${cell.family} | ${cell.mode} |`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function runHoldoutAdapterBakeoffPack({ skipReportWrite = false, invoked = false } = {}) {
  const writeArtifacts = shouldWriteTrackedReports({ skipReportWrite, invoked });
  guardLegacyHoldoutEntrypoint("ctxbench:holdout-adapter-bakeoff", { tracesDir: HOLDOUT_V01.tracesDir });

  const traces = await listHoldoutTraces();
  if (traces.length === 0) throw new Error("no holdout traces found in bench/traces/holdout");

  const traceHashes = traces.map((trace) => sha256(JSON.stringify(trace))).sort();
  const traceSetHash = sha256(traceHashes.join("\n"));

  const hostsLockBytes = await readFile(HOSTS_LOCK_PATH);
  const hostsLock = JSON.parse(hostsLockBytes.toString("utf8"));
  const reposLock = await loadJson(REPOS_LOCK_PATH);
  const systemCommit = gitCommit();
  const mergeBaseCommit = mergeBase(PCR_0038_SQUASH);
  const corvusFileSource = "live run (bench/corvus.mjs via trace-runner; not replayed)";
  const environmentSha256 = environmentDigest();
  const runId = createHash("sha256")
    .update(`${systemCommit}:holdout-adapter-bakeoff:${Date.now()}:${traces.length}`)
    .digest("hex")
    .slice(0, 16);
  const jsonlPath = join(REPORTS_DIR, "holdout-adapter-bakeoff.jsonl");
  if (writeArtifacts) {
    await mkdir(REPORTS_DIR, { recursive: true });
    await writeFile(jsonlPath, "");
  }

  const hermesHostReady = existsSync(HERMES_HOST_MODULE);
  const nativeReplayRows = hermesHostReady
    ? []
    : await loadNativeHoldoutReplayRows(["hermes-native"]);
  const replayByKey = new Map(
    nativeReplayRows.map((row) => [`${row.baseline}\t${row.repo}\t${row.family}`, row]),
  );
  const hermesNativeSource = hermesHostReady
    ? "live run (bench/hosts/hermes checkout present)"
    : (nativeReplayRows.length > 0
      ? "replayed from bench/reports/native-holdout.md (PCR 0032; holdout window native-no-op)"
      : "unavailable (no host checkout and no native-holdout replay report)");

  const perTraceRows = [];

  for (const trace of traces) {
    const traceSha256 = sha256(JSON.stringify(trace));
    const repoId = trace.name.split("/")[0];
    const repoCommit = reposLock.repositories[repoId]?.commit ?? trace.source?.commit;

    const [
      regionResult,
      fileResult,
      corvusResult,
      hermesFreshResult,
      piFreshResult,
      piNativeResult,
    ] = await Promise.all([
      runTrace(trace, "freshctx-region"),
      runTrace(trace, "freshctx-file"),
      runTrace(trace, "corvus-file"),
      runHermesTrace(trace),
      runPiTrace(trace),
      runPiNativeTrace(trace),
    ]);

    const rowsForTrace = [
      captureRow("freshctx-region", regionResult, finalCapture),
      captureRow("freshctx-file", fileResult, finalCapture),
      captureRow("corvus-file", corvusResult, finalCapture),
      captureRow("hermes-fresh", hermesFreshResult, finalHermesCapture),
      captureRow("pi-fresh", piFreshResult, finalPiCapture),
      captureRow("pi-native", piNativeResult, finalPiNativeCapture),
    ].filter(Boolean);

    if (hermesHostReady) {
      const hermesNativeResult = await runHermesNativeTrace(trace);
      const nativeCapture = finalHermesNativeCapture(hermesNativeResult);
      const nativeRow = captureRow(
        hermesNativeResult.baseline ?? "hermes-native",
        hermesNativeResult,
        finalHermesNativeCapture,
        { nativeMode: nativeCapture?.nativeMode ?? "native-no-op" },
      );
      if (nativeRow) rowsForTrace.push(nativeRow);
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
        label: HOLDOUT_ADAPTER_BAKEOFF_LABEL,
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
        native_mode: row.nativeMode,
      };
      await appendFile(jsonlPath, `${JSON.stringify(record)}\n`);
    }
  }

  const rows = aggregateRows(perTraceRows);
  const matchResult = hermesFreshMatchesRegion(rows);
  const corvusMatchResult = corvusFileStaleRecallVsRegion(rows);
  const hermesNativeSummary = summarizeHermesNativeModes(rows);
  const report = formatReport(rows, {
    sha256: sha256(hostsLockBytes),
    pi: hostsLock.hosts.pi.commit,
    hermes: hostsLock.hosts.hermes.commit,
  }, {
    systemCommit,
    mergeBaseCommit,
    matchResult,
    corvusMatchResult,
    corvusFileSource,
    hermesNativeSummary,
    hermesNativeSource,
  });
  const reportPath = join(REPORTS_DIR, "holdout-adapter-bakeoff.md");
  if (writeArtifacts) {
    await writeFile(reportPath, report);
  }

  return {
    label: HOLDOUT_ADAPTER_BAKEOFF_LABEL,
    packId: HOLDOUT_V01.packId,
    traces: traces.length,
    records: perTraceRows.length,
    traceSetHash,
    jsonlPath,
    reportPath,
    rows,
    hermesFreshMatchesRegion: matchResult.matched,
    hermesFreshMismatches: matchResult.mismatches,
    corvusFileStaleRecallMatchesRegion: corvusMatchResult.matched,
    corvusFileStaleRecallMismatches: corvusMatchResult.mismatches,
    corvusFileSource,
    hermesNativeSummary,
    hermesNativeSource,
    hermesHostReady,
    systemCommit,
    mergeBaseCommit,
    doorBlob: DOOR_BLOB,
    reposLockBlob: REPOS_LOCK_BLOB,
    hostsLockSha256: sha256(hostsLockBytes),
    hosts: {
      pi: hostsLock.hosts.pi.commit,
      hermes: hostsLock.hosts.hermes.commit,
    },
  };
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  const summary = await runHoldoutAdapterBakeoffPack({ invoked: true });
  console.log(JSON.stringify(summary, null, 2));
}
