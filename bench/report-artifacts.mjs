import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Tracked paths that benchmark runners must not rewrite during unit tests. */
export const TRACKED_REPORT_PATHS = Object.freeze([
  "bench/reports/pi-smoke.md",
  "bench/reports/hermes-smoke.md",
  "bench/reports/pi-holdout.md",
  "bench/reports/hermes-holdout.md",
  "bench/reports/holdout.md",
  "autoresearch/results.tsv",
]);

export function repoRoot() {
  return ROOT;
}

/**
 * Whether a benchmark runner may write tracked report artifacts.
 * CLI entrypoints pass invoked=true; unit tests rely on the default (no writes).
 * Set FRESHCTX_WRITE_REPORTS=1 to force writes from programmatic callers.
 */
export function shouldWriteTrackedReports({ skipReportWrite = false, invoked = false } = {}) {
  if (skipReportWrite) return false;
  if (process.env.FRESHCTX_WRITE_REPORTS === "1") return true;
  return invoked;
}

export function resolveTrackedPath(relPath) {
  return join(ROOT, relPath);
}
