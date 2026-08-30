import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runPackEvaluation, stablePackRecord } from "../bench/evaluate-pack.mjs";
import { runBenchmark } from "../bench/run.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export function parseEvaluateArgs(argv) {
  const flags = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const value = eq === -1 ? true : arg.slice(eq + 1);
    if (key !== "pack") continue;
    if (value === true || value === "") {
      throw new Error("--pack requires a pack id");
    }
    flags.pack = value;
  }
  return flags;
}

export async function runEvaluateBenchmark({ pack, root = repoRoot } = {}) {
  if (!pack) return runBenchmark();
  return runPackEvaluation({ packId: pack, root });
}

function listFreshCtxTestFiles() {
  const testDir = join(repoRoot, "test");
  return readdirSync(testDir)
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => join(testDir, name));
}

function benchmarkRecordsMatch(left, right) {
  if (left.label === "synthetic" && right.label === "synthetic") {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return JSON.stringify(stablePackRecord(left)) === JSON.stringify(stablePackRecord(right));
}

export async function evaluate(options = {}) {
  const testFiles = listFreshCtxTestFiles();
  if (testFiles.length === 0) {
    throw new Error("hard gate failed: no FreshCtx regression tests found");
  }

  const testRun = spawnSync(process.execPath, ["--test", ...testFiles], {
    encoding: "utf8",
  });
  if (testRun.status !== 0) {
    process.stderr.write(testRun.stdout);
    process.stderr.write(testRun.stderr);
    throw new Error("hard gate failed: regression tests did not pass");
  }

  const result = await runEvaluateBenchmark(options);
  const repeated = await runEvaluateBenchmark(options);
  if (!benchmarkRecordsMatch(result, repeated)) {
    throw new Error("hard gate failed: benchmark output is not deterministic");
  }
  const failedGates = Object.entries(result.hardGates)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedGates.length > 0) {
    throw new Error(`hard gate failed: ${failedGates.join(", ")}`);
  }

  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const result = await evaluate(parseEvaluateArgs(process.argv));
  console.log(`AUTORESEARCH_SCORE=${result.score.toFixed(6)}`);
  console.log(JSON.stringify({
    label: result.label,
    fixture: result.fixture,
    packId: result.packId,
    tracesExecuted: result.tracesExecuted,
    comparison: result.comparison,
    hardGates: result.hardGates,
    candidate: result.runs.find((run) =>
      run.name === result.comparison.candidate || run.system === result.comparison.candidate
    ),
  }, null, 2));
}
