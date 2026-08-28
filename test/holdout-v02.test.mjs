import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  defaultReportFormatter,
  freezePack,
  generatePack,
  reportPack,
  runPack,
  syntheticFixtureRun,
} from "../bench/holdout-protocol.mjs";
import { generateHoldoutV02Traces, holdoutV02ManifestDraft } from "../bench/holdout-v02-lab.mjs";
import { verifyPack } from "../bench/holdout-verify.mjs";
import { HOLDOUT_V02 } from "../bench/holdout-identity.mjs";

function git(cwd, args) {
  const run = spawnSync("git", args, { encoding: "utf8", cwd });
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stdout.trim();
}

async function initRepo() {
  const root = join(tmpdir(), `freshctx-v02-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "v02@test.local"]);
  git(root, ["config", "user.name", "V02"]);
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "bench/splits"), { recursive: true });
  await writeFile(join(root, "src/policy.mjs"), "export const DEFAULT_POLICY = { version: 1 };\n");
  await writeFile(join(root, "src/anchors.mjs"), "export function anchor() { return null; }\n");
  await writeFile(join(root, "src/projector.mjs"), "export function project() { return []; }\n");
  await writeFile(
    join(root, "bench/repos.lock.json"),
    `${JSON.stringify({ schemaVersion: 1, repositories: { flask: { url: "https://github.com/pallets/flask.git", commit: "0".repeat(40) }, synthetic: { url: "synthetic://fixture", commit: "0".repeat(40) } } }, null, 2)}\n`,
  );
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "seed"]);
  return root;
}

test("holdout v0.2 pipeline is locally-frozen and records sampler rejects", async () => {
  const root = await initRepo();
  try {
    const manifestPath = HOLDOUT_V02.splitManifest;
    await freezePack(root, manifestPath, holdoutV02ManifestDraft());
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "freeze policy first"]);
    const generated = await generatePack(root, manifestPath, generateHoldoutV02Traces);
    assert.equal(generated.provenance.generator, "unit-sampler");
    await runPack(root, manifestPath, syntheticFixtureRun);
    const reported = await reportPack(root, manifestPath, defaultReportFormatter);
    assert.notEqual(reported.classification, "sealed");
    const result = await verifyPack(root, { packId: HOLDOUT_V02.packId, manifestPath });
    assert.equal(result.valid, true, result.errors?.join("; "));
    assert.notEqual(result.classification, "sealed");
    const rejected = JSON.parse(
      await readFile(join(root, "bench/packs/holdout-v0.2/traces/candidates-rejected.json"), "utf8"),
    );
    assert.ok(rejected.rejected.some((row) => row.reason === "vendored" || row.reason === "parser-not-implemented"));
    const candidates = JSON.parse(
      await readFile(join(root, "bench/packs/holdout-v0.2/traces/candidates.json"), "utf8"),
    );
    assert.ok(candidates.selected.length >= 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("forged sealed claim on holdout v0.2 is rejected", async () => {
  const root = await initRepo();
  try {
    const manifestPath = HOLDOUT_V02.splitManifest;
    await freezePack(root, manifestPath, holdoutV02ManifestDraft());
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "freeze"]);
    await generatePack(root, manifestPath, generateHoldoutV02Traces);
    await runPack(root, manifestPath, syntheticFixtureRun);
    await reportPack(root, manifestPath, defaultReportFormatter);
    const statePath = join(root, "bench/packs/holdout-v0.2/state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.classification = "sealed";
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
    const result = await verifyPack(root, { packId: HOLDOUT_V02.packId, manifestPath });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => /sealed/i.test(error)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tampered holdout v0.2 results fail verify", async () => {
  const root = await initRepo();
  try {
    const manifestPath = HOLDOUT_V02.splitManifest;
    await freezePack(root, manifestPath, holdoutV02ManifestDraft());
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "freeze"]);
    await generatePack(root, manifestPath, generateHoldoutV02Traces);
    await runPack(root, manifestPath, syntheticFixtureRun);
    await reportPack(root, manifestPath, defaultReportFormatter);
    const resultsPath = join(root, "bench/packs/holdout-v0.2/reports/results.jsonl");
    await writeFile(resultsPath, `${await readFile(resultsPath, "utf8")}{"tamper":true}\n`);
    const result = await verifyPack(root, { packId: HOLDOUT_V02.packId, manifestPath });
    assert.equal(result.valid, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
