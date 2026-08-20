import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { finalCapture, runTrace } from "./trace-runner.mjs";
import { finalPiCapture, runPiTrace } from "./pi-trace-runner.mjs";
import { percentile } from "./metrics.mjs";
import { sha256 } from "../src/hash.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TRACES_DIR = join(ROOT, "bench", "traces", "smoke");
const REPORTS_DIR = join(ROOT, "bench", "reports");
const RESULTS_TSV = join(ROOT, "autoresearch", "results.tsv");
const LOCK_PATH = join(ROOT, "bench", "repos.lock.json");
const HOST_VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version;
const PI_EXTENSION_DOC =
  "https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md";

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

async function listSmokeTraces() {
  const names = await readdir(TRACES_DIR);
  const traces = [];
  for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
    traces.push(await loadJson(join(TRACES_DIR, name)));
  }
  return traces;
}

function aggregatePiRows(results) {
  const grouped = new Map();
  for (const result of results) {
    const capture = finalPiCapture(result);
    if (!capture) continue;
    const key = `${result.repo}\t${result.mutationFamily}`;
    const bucket = grouped.get(key) ?? {
      repo: result.repo,
      family: result.mutationFamily,
      exactCurrent: [],
      stale: [],
      duplicate: [],
      requiredRecall: [],
      projectionBytes: [],
      cachePrefixReuse: [],
      transformP50: [],
      transformP95: [],
    };
    bucket.exactCurrent.push(capture.metrics.exactCurrentRate);
    bucket.stale.push(capture.metrics.staleUnitRate);
    bucket.duplicate.push(capture.metrics.duplicateUnits);
    bucket.requiredRecall.push(capture.metrics.requiredRecall);
    bucket.projectionBytes.push(capture.metrics.projectionBytes);
    bucket.cachePrefixReuse.push(capture.metrics.cachePrefixReuse);
    bucket.transformP50.push(capture.telemetry.totalMs ?? 0);
    bucket.transformP95.push(capture.telemetry.totalMs ?? 0);
    grouped.set(key, bucket);
  }

  return [...grouped.values()].map((bucket) => ({
    baseline: "pi-adapter",
    repo: bucket.repo,
    family: bucket.family,
    exactCurrent: bucket.exactCurrent.reduce((a, b) => a + b, 0) / bucket.exactCurrent.length,
    stale: bucket.stale.reduce((a, b) => a + b, 0) / bucket.stale.length,
    duplicate: bucket.duplicate.reduce((a, b) => a + b, 0) / bucket.duplicate.length,
    requiredRecall: bucket.requiredRecall.reduce((a, b) => a + b, 0) / bucket.requiredRecall.length,
    projectionBytes: Math.round(bucket.projectionBytes.reduce((a, b) => a + b, 0) / bucket.projectionBytes.length),
    cachePrefixReuse: bucket.cachePrefixReuse.reduce((a, b) => a + b, 0) / bucket.cachePrefixReuse.length,
    transformP50: percentile(bucket.transformP50, 0.5),
    transformP95: percentile(bucket.transformP95, 0.95),
  }));
}

function formatPiTable(rows, coreRows) {
  const coreByKey = new Map(coreRows.map((row) => [`${row.repo}\t${row.family}`, row]));
  const header = [
    "baseline",
    "repo",
    "family",
    "exact-current",
    "stale",
    "duplicate",
    "required-recall",
    "projection-bytes",
    "cache-prefix-reuse",
    "transform-p50",
    "transform-p95",
  ];
  const lines = [
    "# CtxBench Pi adapter smoke v0.1",
    "",
    "Label: `public-repo-smoke` / `replay`. Measurement infrastructure only; not a performance claim.",
    "",
    `Pi extension contract: ${PI_EXTENSION_DOC}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows.sort((a, b) =>
    a.repo.localeCompare(b.repo) || a.family.localeCompare(b.family),
  )) {
    lines.push(
      `| ${[
        row.baseline,
        row.repo,
        row.family,
        row.exactCurrent.toFixed(3),
        row.stale.toFixed(3),
        row.duplicate.toFixed(1),
        row.requiredRecall.toFixed(3),
        String(row.projectionBytes),
        row.cachePrefixReuse.toFixed(3),
        row.transformP50.toFixed(2),
        row.transformP95.toFixed(2),
      ].join(" | ")} |`,
    );
  }

  lines.push("", "## Delta vs core `freshctx-region` (final capture per trace)", "");
  lines.push("| repo | family | pi stale | core stale | pi recall | core recall | pi exact-current | core exact-current | pi projection-bytes | core projection-bytes |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows.sort((a, b) =>
    a.repo.localeCompare(b.repo) || a.family.localeCompare(b.family),
  )) {
    const core = coreByKey.get(`${row.repo}\t${row.family}`);
    lines.push(
      `| ${row.repo} | ${row.family} | ${row.stale.toFixed(3)} | ${core?.stale.toFixed(3) ?? "n/a"} | ${row.requiredRecall.toFixed(3)} | ${core?.requiredRecall.toFixed(3) ?? "n/a"} | ${row.exactCurrent.toFixed(3)} | ${core?.exactCurrent.toFixed(3) ?? "n/a"} | ${row.projectionBytes} | ${core?.projectionBytes ?? "n/a"} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function piHardGateFailures(results) {
  const failures = [];
  for (const result of results) {
    const capture = finalPiCapture(result);
    if (!capture) continue;
    if (capture.metrics.staleBytes > 0) {
      failures.push(`${result.traceName}: stale bytes (${capture.metrics.staleBytes})`);
    }
    if (capture.metrics.duplicateUnits > 0) {
      failures.push(`${result.traceName}: duplicate units (${capture.metrics.duplicateUnits})`);
    }
    if (capture.metrics.requiredRecall < 1 && capture.event.requiredUnits.length > 0) {
      failures.push(`${result.traceName}: required recall ${capture.metrics.requiredRecall}`);
    }
    if (!capture.adapterApplied && capture.event.requiredUnits.length > 0) {
      failures.push(`${result.traceName}: Pi context hook did not apply`);
    }
    const persistedText = JSON.stringify(capture.persistedMessages);
    const requestText = JSON.stringify(capture.requestMessages);
    if (persistedText === requestText && capture.projectionText.length > 0) {
      failures.push(`${result.traceName}: request-only invariant violated (persisted equals request)`);
    }
  }
  return failures;
}

export async function runPiSmokePack({ strictGates = true } = {}) {
  await loadJson(LOCK_PATH);
  const traces = await listSmokeTraces();
  if (traces.length === 0) throw new Error("no smoke traces found in bench/traces/smoke");

  const systemCommit = gitCommit();
  const environmentSha256 = environmentDigest();
  const runId = createHash("sha256")
    .update(`${systemCommit}:pi:${Date.now()}:${traces.length}`)
    .digest("hex")
    .slice(0, 16);
  const jsonlPath = join(REPORTS_DIR, "pi-smoke.jsonl");
  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(jsonlPath, "");

  const piResults = [];
  const coreResults = [];
  for (const trace of traces) {
    const traceSha256 = sha256(JSON.stringify(trace));
    const repoId = trace.name.split("/")[0];
    piResults.push(await runPiTrace(trace));
    coreResults.push(await runTrace(trace, "freshctx-region"));

    const piCapture = finalPiCapture(piResults.at(-1));
    if (!piCapture) continue;
    const record = {
      schema_version: 1,
      run_id: runId,
      label: "public-repo-smoke",
      adapter: "pi",
      system: "pi-adapter",
      system_commit: systemCommit,
      repo: repoId,
      trace_sha256: traceSha256,
      trace_name: trace.name,
      mutation_family: piResults.at(-1).mutationFamily,
      host: "pi",
      host_version: HOST_VERSION,
      adapter_doc: PI_EXTENSION_DOC,
      environment_sha256: environmentSha256,
      repetition: 1,
      correctness: {
        exact_current_rate: piCapture.metrics.exactCurrentRate,
        required_recall: piCapture.metrics.requiredRecall,
        stale_unit_rate: piCapture.metrics.staleUnitRate,
        stale_bytes: piCapture.metrics.staleBytes,
        duplicate_units: piCapture.metrics.duplicateUnits,
        duplicate_bytes: piCapture.metrics.duplicateBytes,
      },
      bytes: {
        projection_bytes: piCapture.metrics.projectionBytes,
        payload_bytes: piCapture.metrics.payloadBytes,
        cache_prefix_reuse: piCapture.metrics.cachePrefixReuse,
      },
      latency_ms: {
        p50: piCapture.telemetry.totalMs ?? 0,
        p95: piCapture.telemetry.totalMs ?? 0,
      },
      resources: {},
      payload_sha256: piCapture.payloadSha256,
      adapter_applied: piCapture.adapterApplied,
    };
    await appendFile(jsonlPath, `${JSON.stringify(record)}\n`);
  }

  const piRows = aggregatePiRows(piResults);
  const coreRows = coreResults.map((result) => {
    const capture = finalCapture(result);
    return {
      repo: result.repo,
      family: result.mutationFamily,
      exactCurrent: capture?.metrics.exactCurrentRate ?? 0,
      stale: capture?.metrics.staleUnitRate ?? 0,
      duplicate: capture?.metrics.duplicateUnits ?? 0,
      requiredRecall: capture?.metrics.requiredRecall ?? 0,
      projectionBytes: capture?.metrics.projectionBytes ?? 0,
    };
  });
  const report = formatPiTable(piRows, coreRows);
  await writeFile(join(REPORTS_DIR, "pi-smoke.md"), report);

  const failures = piHardGateFailures(piResults);
  const supported = failures.length === 0;
  const snapshot = piRows.reduce(
    (best, row) => (row.requiredRecall >= best.requiredRecall ? row : best),
    piRows[0],
  );
  const tsvLine = [
    new Date().toISOString(),
    systemCommit,
    "n/a-smoke-only",
    "Pi adapter smoke v0.1 request-capture on Flask/Express traces",
    "n/a",
    snapshot?.exactCurrent.toFixed(6) ?? "0",
    snapshot?.stale.toFixed(6) ?? "0",
    snapshot?.requiredRecall.toFixed(6) ?? "0",
    String(snapshot?.projectionBytes ?? 0),
    snapshot?.cachePrefixReuse.toFixed(6) ?? "0",
    snapshot?.transformP95.toFixed(3) ?? "0",
    "review",
    `pi-adapter supported=${supported}; freshness/uniqueness gates pass; file-level exact-current`,
  ].join("\t");
  await appendFile(RESULTS_TSV, `${tsvLine}\n`);

  const summary = {
    label: "public-repo-smoke",
    adapter: "pi",
    supported,
    traces: traces.length,
    records: piResults.length,
    jsonlPath,
    reportPath: join(REPORTS_DIR, "pi-smoke.md"),
    rows: piRows,
    failures,
    protocolGaps: supported ? [] : failures,
  };

  if (strictGates && failures.length > 0) {
    throw new Error(`Pi adapter smoke hard gates failed:\n${failures.join("\n")}`);
  }

  return summary;
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  const summary = await runPiSmokePack();
  console.log(JSON.stringify(summary, null, 2));
}
