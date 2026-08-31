import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runPackEvaluation, stablePackRecord } from "../bench/evaluate-pack.mjs";
import {
  formatEvaluateOutput,
  runEmpiricalEvaluation,
  stableEvaluateRecord,
} from "../bench/empirical-verdict.mjs";
import { assertSafeReportPath, formatEvaluateReport, resolveReportProvenance } from "../bench/evaluate-report.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export function parseEvaluateArgs(argv) {
  const flags = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const value = eq === -1 ? true : arg.slice(eq + 1);
    if (key === "pack") {
      if (value === true || value === "") {
        throw new Error("--pack requires a pack id");
      }
      flags.pack = value;
      continue;
    }
    if (key === "report") {
      flags.report = true;
      continue;
    }
    if (key === "report-path") {
      if (value === true || value === "") {
        throw new Error("--report-path requires a file path");
      }
      flags.report = true;
      flags.reportPath = value;
    }
  }
  return flags;
}

export function evaluateJudge({ pack, report } = {}) {
  return pack && !report ? "pack-on-disk" : "empirical-verdict";
}

export async function runEvaluateBenchmark({ pack, root = repoRoot, report } = {}) {
  if (pack && !report) return runPackEvaluation({ packId: pack, root });
  const env = pack ? { ...process.env, FRESHCTX_EVAL_PACK: pack } : process.env;
  return runEmpiricalEvaluation({ root, env });
}

function listFreshCtxTestFiles() {
  const testDir = join(repoRoot, "test");
  return readdirSync(testDir)
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => join(testDir, name));
}

function gateHeld(value) {
  return value === true || value === "pass";
}

function evaluateVerdict(result) {
  if (result.verdict === "PASS" || result.verdict === "FAIL") return result.verdict;
  return Object.values(result.hardGates ?? {}).every(gateHeld) ? "PASS" : "FAIL";
}

function benchmarkRecordsMatch(left, right) {
  if (left.schemaVersion === 1 && left.verdict) {
    return JSON.stringify(stableEvaluateRecord(left)) === JSON.stringify(stableEvaluateRecord(right));
  }
  return JSON.stringify(stablePackRecord(left)) === JSON.stringify(stablePackRecord(right));
}

export function printEvaluateResult(result) {
  const judge = result.schemaVersion === 1 && result.verdict
    ? "empirical-verdict"
    : "pack-on-disk";
  const body = result.schemaVersion === 1 && result.verdict
    ? formatEvaluateOutput(result)
    : `EVALUATE_VERDICT=${evaluateVerdict(result)}\n${JSON.stringify(result, null, 2)}\n`;
  return `judge=${judge}\n${body}`;
}

export async function evaluate(options = {}) {
  const testFiles = listFreshCtxTestFiles();
  if (testFiles.length === 0) {
    throw new Error("hard gate failed: no FreshCtx regression tests found");
  }

  const testRun = spawnSync(process.execPath, ["--test", ...testFiles], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (testRun.status !== 0) {
    process.stderr.write(testRun.stdout ?? "");
    process.stderr.write(testRun.stderr ?? "");
    const detail = testRun.error?.message ?? testRun.signal ?? `status ${testRun.status}`;
    throw new Error(`hard gate failed: regression tests did not pass (${detail})`);
  }

  const result = await runEvaluateBenchmark(options);
  const repeated = await runEvaluateBenchmark(options);
  if (!benchmarkRecordsMatch(result, repeated)) {
    throw new Error("hard gate failed: benchmark output is not deterministic");
  }

  const failedGates = Object.entries(result.hardGates ?? {})
    .filter(([, status]) => !gateHeld(status))
    .map(([name]) => name);
  if (failedGates.length > 0) {
    throw new Error(`hard gate failed: ${failedGates.join(", ")}`);
  }
  if (evaluateVerdict(result) !== "PASS") {
    throw new Error("hard gate failed: empirical verdict is FAIL");
  }

  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const args = parseEvaluateArgs(process.argv);
  const result = await evaluate(args);
  process.stdout.write(printEvaluateResult(result));
  if (args.report || args.reportPath) {
    const provenance = await resolveReportProvenance({ root: repoRoot });
    const markdown = formatEvaluateReport(result, provenance);
    process.stdout.write(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
    if (args.reportPath) {
      assertSafeReportPath(args.reportPath);
      await mkdir(dirname(args.reportPath), { recursive: true });
      await writeFile(args.reportPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
    }
  }
}
