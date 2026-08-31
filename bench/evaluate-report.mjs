import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const CORVUS_PDF_SHA256 = "204af5d8df1a25d09dcc2ef154b2aac8d3d3fcea4c9c737a511129f40cd27eaf";

export function assertSafeReportPath(dest) {
  const normalized = String(dest).split("\\").join("/");
  if (normalized.endsWith("results.jsonl")) {
    throw new Error("refusing to write results.jsonl");
  }
  if (normalized.includes("holdout-v0.3-apex") || /(?:^|\/)holdout-v0\.2(?:\/|$)/.test(normalized)) {
    throw new Error("refusing to write sealed holdout artifacts");
  }
  if (normalized.endsWith("/reports/report.md") || normalized.endsWith("reports/report.md")) {
    throw new Error("refusing to write pack report.md");
  }
}

function requireProvenance(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`evaluate report missing provenance: ${label}`);
  }
  return value;
}

export function formatEvaluateReport(result, { implementationCommit, reposLockSha256 } = {}) {
  requireProvenance(implementationCommit, "FreshCtx commit SHA");
  requireProvenance(reposLockSha256, "repos.lock sha256");
  const rows = result.traceRows ?? [];
  if (rows.length === 0) {
    throw new Error("evaluate report missing provenance: traceRows");
  }
  for (const row of rows) {
    requireProvenance(row.repo, "repo");
    requireProvenance(row.commit, "commit");
    requireProvenance(row.path, "path");
    requireProvenance(row.selector, "selector");
  }

  const payload = result.comparison.payloadBytes;
  const retention = result.comparison.oracleRetention;
  const latency = result.resources.latencyMs;
  const lines = [
    "# Evaluate report",
    "",
    `- pack: \`${result.pack.id}\` (${result.pack.classification})`,
    `- FreshCtx commit: \`${implementationCommit}\``,
    `- repos.lock.json sha256: \`${reposLockSha256}\``,
    `- CORVUS PDF sha256: \`${CORVUS_PDF_SHA256}\``,
    "- citation: Zheng et al., arXiv:2607.22711v1",
    "- candidate: Isolated Semantic Engine; baseline: `corvus-file`",
    "- passAt1=null (ADR 0002)",
    "- cycleReductionVsCorvus=0 (same traces)",
    "",
    "| repo | commit | path | gold selector | ISE payloadBytes | corvus-file payloadBytes | delta | recall hits/required | peakRssBytes | latency p95 ms |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.repo} | \`${row.commit}\` | \`${row.path}\` | \`${row.selector}\` | ${row.payloadBytes.candidate} | ${row.payloadBytes.baseline} | ${row.payloadBytes.delta} | ${row.recallHits}/${row.recallRequired} | ${row.peakRssBytes} | ${row.latencyMs} |`,
    );
  }
  lines.push(
    "",
    "## Pack totals",
    "",
    `- Isolated Semantic Engine payloadBytes: ${payload.candidate}`,
    `- corvus-file payloadBytes: ${payload.baseline}`,
    `- delta: ${payload.delta}`,
    `- oracleRetention: ${retention.hits}/${retention.requiredCount} (recall ${retention.recall})`,
    `- peakRssBytes: ${result.resources.peakRssBytes}`,
    `- latencyMs p50/p95/max: ${latency.p50} / ${latency.p95} / ${latency.max}`,
    "",
    "RSS and latency are measured telemetry on this host. They are not a publishable latency claim.",
    "",
  );
  return lines.join("\n");
}

export async function resolveReportProvenance({ root } = {}) {
  const git = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (git.status !== 0) {
    throw new Error("evaluate report missing provenance: FreshCtx commit SHA");
  }
  const lockBytes = await readFile(join(root, "bench/repos.lock.json"));
  return {
    implementationCommit: git.stdout.trim(),
    reposLockSha256: createHash("sha256").update(lockBytes).digest("hex"),
  };
}
