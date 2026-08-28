#!/usr/bin/env node
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  defaultReportFormatter,
  freezePack,
  generatePack,
  reportPack,
  runPack,
  syntheticFixtureRun,
} from "../bench/holdout-protocol.mjs";
import { generateSamplerCanaryTraces, samplerCanaryManifestDraft } from "../bench/sampler-canary-lab.mjs";
import { verifyPack } from "../bench/holdout-verify.mjs";

function git(cwd, args) {
  const run = spawnSync("git", args, { encoding: "utf8", cwd });
  if (run.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${run.stderr}`);
  }
  return run.stdout.trim();
}

function assertNoHoldoutV02(root) {
  const listed = spawnSync("git", ["ls-files", "*holdout-v0.2*"], { encoding: "utf8", cwd: root });
  if (listed.stdout.trim()) {
    throw new Error("canary wrote holdout-v0.2");
  }
}

export async function runCanaryPack({ packId = "sampler-canary" } = {}) {
  if (packId.includes("holdout-v0.2")) {
    throw new Error("canary pack id must not be holdout-v0.2");
  }
  const root = join(tmpdir(), `freshctx-canary-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "canary@test.local"]);
    git(root, ["config", "user.name", "Canary"]);
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "bench/splits"), { recursive: true });
    await writeFile(join(root, "src/policy.mjs"), "export const DEFAULT_POLICY = { version: 1 };\n");
    await writeFile(join(root, "src/anchors.mjs"), "export function anchor() { return null; }\n");
    await writeFile(join(root, "src/projector.mjs"), "export function project() { return []; }\n");
    await writeFile(
      join(root, "bench/repos.lock.json"),
      `${JSON.stringify({ schemaVersion: 1, repositories: { synthetic: { url: "synthetic://fixture", commit: "0".repeat(40) } } }, null, 2)}\n`,
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "canary seed"]);

    const manifestPath = `bench/splits/${packId}.json`;
    await freezePack(root, manifestPath, samplerCanaryManifestDraft(packId));
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "freeze"]);
    await generatePack(root, manifestPath, generateSamplerCanaryTraces);
    await runPack(root, manifestPath, syntheticFixtureRun);
    await reportPack(root, manifestPath, defaultReportFormatter);
    const result = await verifyPack(root, { manifestPath });
    assertNoHoldoutV02(root);
    return { root, result, deleted: false };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith("canary-pack.mjs");
if (isMain) {
  const result = await runCanaryPack();
  process.stdout.write(`${JSON.stringify({ ok: true, valid: result.result.valid, classification: result.result.classification }, null, 2)}\n`);
}
