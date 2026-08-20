import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runBenchmark } from "../bench/run.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function listFreshCtxTestFiles() {
  const testDir = join(repoRoot, "test");
  return readdirSync(testDir)
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => join(testDir, name));
}

export async function evaluate() {
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

  const result = await runBenchmark();
  const repeated = await runBenchmark();
  if (JSON.stringify(result) !== JSON.stringify(repeated)) {
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
  const result = await evaluate();
  console.log(`AUTORESEARCH_SCORE=${result.score.toFixed(6)}`);
  console.log(JSON.stringify({
    label: result.label,
    fixture: result.fixture,
    comparison: result.comparison,
    hardGates: result.hardGates,
    candidate: result.runs.find((run) => run.name === result.comparison.candidate),
  }, null, 2));
}
