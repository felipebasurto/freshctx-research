#!/usr/bin/env node
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runHoldoutCiGuard } from "../bench/holdout-ci-guard.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const flags = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      flags[key] = value ?? true;
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv);
  const baseRef = flags.base ?? process.env.CI_BASE_REF ?? "main";
  const result = await runHoldoutCiGuard(ROOT, { baseRef });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

await main();
