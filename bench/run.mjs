import { pathToFileURL } from "node:url";

import { formatEvaluateOutput, runEmpiricalEvaluation } from "./empirical-verdict.mjs";

export async function runBenchmark(options = {}) {
  return runEmpiricalEvaluation(options);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const result = await runBenchmark();
  process.stdout.write(formatEvaluateOutput(result));
}
