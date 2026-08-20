import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { BASELINES } from "./baselines.mjs";
import { percentile } from "./metrics.mjs";
import { finalCapture, runTrace } from "./trace-runner.mjs";
import { sha256 } from "../src/hash.mjs";
import { DEFAULT_POLICY } from "../src/policy.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TRACES_DIR = join(ROOT, "bench", "traces", "holdout");
const REPORTS_DIR = join(ROOT, "bench", "reports");
const RESULTS_TSV = join(ROOT, "autoresearch", "results.tsv");
const LOCK_PATH = join(ROOT, "bench", "repos.lock.json");
const HOST_VERSION = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")).version;

function gitCommit() {
  const run = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (run.error?.code === "ENOENT" || run.status !== 0) {
    throw new Error("git unavailable; holdout runner requires git for commit identity");
  }
  return run.stdout.trim();
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

function aggregateRows(results) {
  const grouped = new Map();
  for (const result of results) {
    const capture = finalCapture(result);
    if (!capture) continue;
    const key = `${result.baseline}\t${result.repo}\t${result.mutationFamily}`;
    const bucket = grouped.get(key) ?? {
      baseline: result.baseline,
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
    bucket.transformP50.push(capture.telemetry.totalMs ?? capture.metrics.transformP50Ms);
    bucket.transformP95.push(capture.telemetry.totalMs ?? capture.metrics.transformP95Ms);
    grouped.set(key, bucket);
  }

  return [...grouped.values()].map((bucket) => ({
    baseline: bucket.baseline,
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

function formatTable(rows) {
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
    `# CtxBench holdout v0.1 (first slice)`,
    "",
    "Label: `public-repo-holdout`. Status: `unsealed-regression-development-pack` (not preregistered; predates freeze protocol).",
    "Measurement only; not a performance or SOTA claim.",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows.sort((a, b) =>
    a.baseline.localeCompare(b.baseline) ||
    a.repo.localeCompare(b.repo) ||
    a.family.localeCompare(b.family),
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
  return `${lines.join("\n")}\n`;
}

function hardGateFailures(results) {
  const failures = [];
  for (const result of results) {
    if (!result.baseline.startsWith("freshctx")) continue;
    const capture = finalCapture(result);
    if (!capture) continue;
    if (capture.metrics.staleBytes > 0) failures.push(`${result.traceName}/${result.baseline}: stale bytes`);
    if (capture.metrics.duplicateUnits > 0) failures.push(`${result.traceName}/${result.baseline}: duplicate units`);
    if (capture.metrics.requiredRecall < 1 && capture.event.requiredUnits.length > 0) {
      failures.push(`${result.traceName}/${result.baseline}: required recall`);
    }
  }
  return failures;
}

export async function runHoldoutPack() {
  const lock = await loadJson(LOCK_PATH);
  const traces = await listHoldoutTraces();
  if (traces.length === 0) throw new Error("no holdout traces found in bench/traces/holdout");

  const baselineNames = Object.keys(BASELINES);
  const systemCommit = gitCommit();
  const policySha256 = sha256(JSON.stringify(DEFAULT_POLICY));
  const environmentSha256 = environmentDigest();
  const runId = createHash("sha256")
    .update(`${systemCommit}:holdout:${Date.now()}:${traces.length}`)
    .digest("hex")
    .slice(0, 16);
  const jsonlPath = join(REPORTS_DIR, "public-repo-holdout.jsonl");
  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(jsonlPath, "");

  const results = [];
  for (const trace of traces) {
    const traceSha256 = sha256(JSON.stringify(trace));
    const repoId = trace.name.split("/")[0];
    const repoCommit = lock.repositories[repoId]?.commit ?? trace.source.commit;
    for (const baselineName of baselineNames) {
      const result = await runTrace(trace, baselineName);
      results.push(result);
      const capture = finalCapture(result);
      if (!capture) continue;
      const record = {
        schema_version: 1,
        run_id: runId,
        label: "public-repo-holdout",
        system: baselineName,
        system_commit: systemCommit,
        repo: repoId,
        repo_commit: repoCommit,
        trace_sha256: traceSha256,
        trace_name: trace.name,
        mutation_family: result.mutationFamily,
        policy_sha256: policySha256,
        host: "core",
        host_version: HOST_VERSION,
        environment_sha256: environmentSha256,
        repetition: 1,
        correctness: {
          exact_current_rate: capture.metrics.exactCurrentRate,
          required_recall: capture.metrics.requiredRecall,
          stale_unit_rate: capture.metrics.staleUnitRate,
          stale_bytes: capture.metrics.staleBytes,
          duplicate_units: capture.metrics.duplicateUnits,
          duplicate_bytes: capture.metrics.duplicateBytes,
        },
        bytes: {
          projection_bytes: capture.metrics.projectionBytes,
          payload_bytes: capture.metrics.payloadBytes,
          cache_prefix_reuse: capture.metrics.cachePrefixReuse,
        },
        latency_ms: {
          p50: capture.telemetry.totalMs ?? 0,
          p95: capture.telemetry.totalMs ?? 0,
        },
        resources: {},
        payload_sha256: capture.payloadSha256,
      };
      await appendFile(jsonlPath, `${JSON.stringify(record)}\n`);
    }
  }

  const rows = aggregateRows(results);
  const report = formatTable(rows);
  await writeFile(join(REPORTS_DIR, "holdout.md"), report);

  const freshctxRows = rows.filter(
    (row) => row.baseline === "freshctx-region" && row.requiredRecall === 1,
  );
  const snapshot = freshctxRows.reduce(
    (best, row) => (row.exactCurrent >= best.exactCurrent ? row : best),
    freshctxRows[0] ?? rows.find((row) => row.baseline === "freshctx-region"),
  );
  const tsvLine = [
    new Date().toISOString(),
    systemCommit,
    "n/a-holdout-only",
    "CtxBench holdout v0.1 first slice (go-tools+neovim)",
    "n/a",
    snapshot?.exactCurrent.toFixed(6) ?? "0",
    snapshot?.stale.toFixed(6) ?? "0",
    snapshot?.requiredRecall.toFixed(6) ?? "0",
    String(snapshot?.projectionBytes ?? 0),
    snapshot?.cachePrefixReuse.toFixed(6) ?? "0",
    snapshot?.transformP95.toFixed(3) ?? "0",
    "review",
    "public-repo-holdout measurement row; not an autoresearch accept",
  ].join("\t");
  await appendFile(RESULTS_TSV, `${tsvLine}\n`);

  const failures = hardGateFailures(results);
  if (failures.length > 0) {
    process.stderr.write(`FreshCtx holdout hard gate failures (recorded, not tuned):\n${failures.join("\n")}\n`);
  }

  return {
    label: "public-repo-holdout",
    traces: traces.length,
    baselines: baselineNames.length,
    records: results.length,
    jsonlPath,
    reportPath: join(REPORTS_DIR, "holdout.md"),
    rows,
    failures,
  };
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  const summary = await runHoldoutPack();
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failures.length > 0) process.exitCode = 1;
}
