#!/usr/bin/env node
/** Write production-shaped freeze attestation (GitHub Actions only). */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { computeManifestHash, readManifest, resolvePackPaths } from "../bench/holdout-protocol.mjs";
import { attestationBindingHash } from "../bench/holdout-hashes.mjs";

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

function gitFreezeCommit(manifestPath) {
  const run = spawnSync("git", ["log", "-1", "--format=%H", "HEAD", "--", manifestPath], {
    encoding: "utf8",
    cwd: ROOT,
  });
  if (run.status !== 0 || !run.stdout.trim()) {
    throw new Error(`no git commit for manifest: ${manifestPath}`);
  }
  return run.stdout.trim();
}

async function main() {
  const flags = parseArgs(process.argv);
  const manifestPath = flags.manifest;
  if (!manifestPath) {
    process.stderr.write("Usage: holdout-write-attestation.mjs --manifest=<path>\n");
    process.exitCode = 1;
    return;
  }

  if (process.env.GITHUB_ACTIONS !== "true" || !process.env.GITHUB_RUN_ID) {
    process.stderr.write(
      "holdout-write-attestation requires GitHub Actions (GITHUB_ACTIONS=true and GITHUB_RUN_ID). " +
        "Local laptops cannot write production attestations; use holdout:attest-stub in tests only.\n",
    );
    process.exitCode = 1;
    return;
  }

  const manifest = await readManifest(ROOT, manifestPath);
  if (manifest.status !== "frozen") {
    throw new Error("manifest not frozen");
  }
  const computed = computeManifestHash(manifest);
  if (computed !== manifest.manifestSha256) {
    throw new Error("manifest hash mismatch");
  }

  const pack = resolvePackPaths(ROOT, { ...manifest, manifestPath });
  const freezeCommitSha = flags["freeze-commit"] ?? gitFreezeCommit(manifestPath);
  const runId = String(process.env.GITHUB_RUN_ID);
  const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}`;

  const attestation = {
    schemaVersion: 1,
    packId: pack.packId,
    freezeCommitSha,
    manifestSha256: manifest.manifestSha256,
    reposLockSha256: manifest.reposLockSha256,
    repositoryLocks: manifest.repositoryLocks ?? {},
    workflowRunId: runId,
    workflowRunUrl: runUrl,
    attestedAt: new Date().toISOString(),
  };
  attestation.bindingSha256 = attestationBindingHash(attestation);

  const rel = join(pack.provenanceDir, "freeze-attestation.json").replace(/\\/g, "/");
  const full = join(ROOT, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, `${JSON.stringify(attestation, null, 2)}\n`);

  if (flags["artifact-out"]) {
    await writeFile(join(ROOT, flags["artifact-out"]), `${JSON.stringify(attestation, null, 2)}\n`);
  }

  process.stdout.write(`${JSON.stringify({ attestationPath: rel, bindingSha256: attestation.bindingSha256 }, null, 2)}\n`);
}

await main();
