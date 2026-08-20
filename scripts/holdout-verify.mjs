#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyPack, VerifyError } from "../bench/holdout-verify.mjs";
import { HOLDOUT_V01 } from "../bench/holdout-identity.mjs";

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
  const manifestPath = flags.manifest;
  const packId = flags.pack ?? (manifestPath ? undefined : HOLDOUT_V01.packId);

  try {
    const result = await verifyPack(ROOT, { manifestPath, packId });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof VerifyError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

await main();
