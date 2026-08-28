import assert from "node:assert/strict";
import { access, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { runCanaryPack } from "../scripts/canary-pack.mjs";
import {
  defaultReportFormatter,
  freezePack,
  generatePack,
  readManifest,
  reportPack,
  resolvePackPaths,
  runPack,
  syntheticFixtureRun,
} from "../bench/holdout-protocol.mjs";
import { generateSamplerCanaryTraces, samplerCanaryManifestDraft } from "../bench/sampler-canary-lab.mjs";
import { writeAttestation } from "../bench/holdout-state.mjs";
import { ATTESTATION_BINDING_MISMATCH, withBindingHash } from "../bench/holdout-hashes.mjs";
import { verifyPack } from "../bench/holdout-verify.mjs";

test("canary pack freeze-generate-run-report-verify then deletes", async () => {
  const { root, result } = await runCanaryPack({ packId: "sampler-canary" });
  assert.equal(result.valid, true, result.errors?.join("; "));
  await assert.rejects(() => access(root));
});

test("canary pack id cannot be holdout-v0.2", async () => {
  await assert.rejects(() => runCanaryPack({ packId: "holdout-v0.2" }), /must not be holdout-v0.2/);
});

test("tampered canary attestation fails ATTESTATION_BINDING_MISMATCH", async () => {
  const root = join(tmpdir(), `freshctx-canary-tamper-${Date.now()}`);
  const git = (args) => {
    const run = spawnSync("git", args, { encoding: "utf8", cwd: root });
    if (run.status !== 0) throw new Error(run.stderr);
    return run.stdout.trim();
  };
  await mkdir(root, { recursive: true });
  try {
    git(["init", "-b", "main"]);
    git(["config", "user.email", "canary@test.local"]);
    git(["config", "user.name", "Canary"]);
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "bench/splits"), { recursive: true });
    await writeFile(join(root, "src/policy.mjs"), "export const DEFAULT_POLICY = { version: 1 };\n");
    await writeFile(join(root, "src/anchors.mjs"), "export function anchor() { return null; }\n");
    await writeFile(join(root, "src/projector.mjs"), "export function project() { return []; }\n");
    await writeFile(
      join(root, "bench/repos.lock.json"),
      `${JSON.stringify({ schemaVersion: 1, repositories: { synthetic: { url: "synthetic://fixture", commit: "0".repeat(40) } } }, null, 2)}\n`,
    );
    git(["add", "."]);
    git(["commit", "-m", "seed"]);
    const manifestPath = "bench/splits/sampler-canary.json";
    await freezePack(root, manifestPath, samplerCanaryManifestDraft("sampler-canary"));
    git(["add", "-A"]);
    git(["commit", "-m", "freeze"]);
    await generatePack(root, manifestPath, generateSamplerCanaryTraces);
    await runPack(root, manifestPath, syntheticFixtureRun);
    await reportPack(root, manifestPath, defaultReportFormatter);
    const manifest = await readManifest(root, manifestPath);
    const pack = resolvePackPaths(root, { ...manifest, manifestPath });
    const attestation = withBindingHash({
      schemaVersion: 1,
      packId: "sampler-canary",
      freezeCommitSha: git(["rev-parse", "HEAD"]),
      manifestSha256: manifest.manifestSha256,
      reposLockSha256: manifest.reposLockSha256,
      repositoryLocks: manifest.repositoryLocks,
      workflowRunId: "9876543299",
      workflowRunUrl: "https://github.com/example/freshctx/actions/runs/9876543299",
      attestedAt: new Date().toISOString(),
    });
    await writeAttestation(root, pack, attestation);
    attestation.bindingSha256 = "a".repeat(64);
    await writeFile(join(root, pack.provenanceDir, "freeze-attestation.json"), `${JSON.stringify(attestation, null, 2)}\n`);
    const result = await verifyPack(root, { manifestPath });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes(ATTESTATION_BINDING_MISMATCH)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
