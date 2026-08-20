#!/usr/bin/env node
/**
 * Test-only stub for remote freeze attestation shape.
 * Production sealed classification MUST use real GHA attestation artifacts.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readManifest, resolvePackPaths } from "../bench/holdout-protocol.mjs";
import { attestationBindingHash } from "../bench/holdout-hashes.mjs";
import { writeAttestation } from "../bench/holdout-state.mjs";
import { ProtocolError } from "../bench/holdout-protocol.mjs";

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
  if (process.env.NODE_ENV === "production" || process.env.CI === "true") {
    if (flags.allowInCi !== "test-fixture") {
      process.stderr.write("holdout:attest-stub is test-only; use holdout-freeze-attest workflow in CI\n");
      process.exitCode = 1;
      return;
    }
  }

  const manifestPath = flags.manifest;
  if (!manifestPath) {
    process.stderr.write("Usage: holdout-attest-stub.mjs --manifest=<path> [--freeze-commit=SHA] [--run-id=id] [--run-url=url]\n");
    process.exitCode = 1;
    return;
  }

  try {
    const manifest = await readManifest(ROOT, manifestPath);
    const pack = resolvePackPaths(ROOT, { ...manifest, manifestPath });
    const attestation = {
      schemaVersion: 1,
      packId: pack.packId,
      freezeCommitSha: flags["freeze-commit"] ?? manifest.freezeCommitSha ?? "0000000000000000000000000000000000000000",
      manifestSha256: manifest.manifestSha256,
      reposLockSha256: manifest.reposLockSha256,
      repositoryLocks: manifest.repositoryLocks ?? {},
      workflowRunId: flags["run-id"] ?? "test-run-0001",
      workflowRunUrl: flags["run-url"] ?? "https://github.com/example/example/actions/runs/1",
      attestedAt: new Date().toISOString(),
      stub: true,
    };
    attestation.bindingSha256 = attestationBindingHash(attestation);
    const path = await writeAttestation(ROOT, pack, attestation);
    process.stdout.write(`${JSON.stringify({ attestationPath: path, ...attestation }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof ProtocolError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

await main();
