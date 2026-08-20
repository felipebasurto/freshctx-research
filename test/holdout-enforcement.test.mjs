import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  ProtocolError,
  computeManifestHash,
  defaultReportFormatter,
  freezePack,
  generatePack,
  reportPack,
  runPack,
  syntheticFixtureRun,
  syntheticFixtureTrace,
} from "../bench/holdout-protocol.mjs";
import { verifyPack, VerifyError } from "../bench/holdout-verify.mjs";
import { HOLDOUT_V01, PROTOCOL_COMMAND_HINT } from "../bench/holdout-identity.mjs";
import { guardLegacyHoldoutEntrypoint } from "../bench/legacy-holdout-guard.mjs";
import { runHoldoutCiGuard, scanProtocolExempt, scanMixedIntroduction } from "../bench/holdout-ci-guard.mjs";
import { sha256 } from "../src/hash.mjs";

function git(cwd, args) {
  const run = spawnSync("git", args, { encoding: "utf8", cwd });
  if (run.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${run.stderr}`);
  }
  return run.stdout.trim();
}

async function initProtocolRepo() {
  const root = join(tmpdir(), `freshctx-enforce-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "enforce@test.local"]);
  git(root, ["config", "user.name", "Enforce Test"]);

  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "bench/splits"), { recursive: true });
  await writeFile(join(root, "src/policy.mjs"), "export const DEFAULT_POLICY = { version: 1, maxUnits: 8 };\n");
  await writeFile(join(root, "src/anchors.mjs"), "export function anchor() { return null; }\n");
  await writeFile(join(root, "src/projector.mjs"), "export function project() { return []; }\n");
  await writeFile(
    join(root, "bench/repos.lock.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        repositories: {
          synthetic: {
            url: "synthetic://fixture",
            commit: "0000000000000000000000000000000000000000",
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "initial"]);
  return { root };
}

async function commitAll(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", message]);
}

function manifestDraft(packId = "protocol-fixture") {
  return {
    packId,
    benchmarkVersion: `${packId}-v1`,
    label: "protocol-fixture",
    repositoryIds: ["synthetic"],
    mutationFamilies: ["interior-edit"],
    seeds: { traceSelection: "test-seed-001" },
    samplingRules: { method: "sha256(commit + selector + scenario)", unitsPerFamily: 1 },
    metrics: ["exact-current-precision", "required-current-recall"],
    gates: { requiredRecallMin: 1, staleBytesMax: 0, duplicateUnitsMax: 0 },
    exclusions: [],
    reposLockPath: "bench/repos.lock.json",
  };
}

test("legacy entrypoints reject hypothetical v0.2 pack", () => {
  assert.throws(
    () => guardLegacyHoldoutEntrypoint("ctxbench:holdout", { packId: "holdout-v0.2" }),
    (error) => error.name === "LegacyHoldoutError" && error.message.includes("holdout:freeze"),
  );
  assert.throws(
    () => guardLegacyHoldoutEntrypoint("build-holdout-traces", { tracesDir: "bench/packs/holdout-v0.2/traces" }),
    (error) => error.message.includes("holdout:generate"),
  );
});

test("legacy entrypoints accept hard-coded v0.1 identity", () => {
  assert.doesNotThrow(() =>
    guardLegacyHoldoutEntrypoint("ctxbench:holdout", { packId: HOLDOUT_V01.packId, tracesDir: HOLDOUT_V01.tracesDir }),
  );
});

test("local freeze does not produce sealed classification", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/local-only.json";
  await freezePack(root, manifestPath, manifestDraft("local-only"));
  await commitAll(root, "freeze");
  await generatePack(root, manifestPath, syntheticFixtureTrace);
  await runPack(root, manifestPath, syntheticFixtureRun);
  const reported = await reportPack(root, manifestPath, defaultReportFormatter);
  assert.notEqual(reported.classification, "sealed");
  assert.match(reported.classification, /locally-frozen|candidate/);
  await rm(root, { recursive: true, force: true });
});

test("verify fails on tampered manifest, traces, results, report", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/tamper-fixture.json";
  await freezePack(root, manifestPath, manifestDraft("tamper-fixture"));
  await commitAll(root, "freeze");
  await generatePack(root, manifestPath, syntheticFixtureTrace);
  await runPack(root, manifestPath, syntheticFixtureRun);
  await reportPack(root, manifestPath, defaultReportFormatter);

  let result = await verifyPack(root, { manifestPath });
  assert.equal(result.valid, true);

  const manifest = JSON.parse(await readFile(join(root, manifestPath), "utf8"));
  manifest.seeds.traceSelection = "tampered";
  await writeFile(join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  result = await verifyPack(root, { manifestPath });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /manifest hash mismatch/i.test(e)));

  const manifest2 = JSON.parse(await readFile(join(root, manifestPath), "utf8"));
  manifest2.seeds.traceSelection = "test-seed-001";
  manifest2.manifestSha256 = computeManifestHash(manifest2);
  await writeFile(join(root, manifestPath), `${JSON.stringify(manifest2, null, 2)}\n`);

  await writeFile(join(root, "bench/packs/tamper-fixture/traces/protocol-fixture-interior-edit.json"), "{}\n");
  result = await verifyPack(root, { manifestPath });
  assert.ok(result.errors.some((e) => /trace-set hash mismatch/i.test(e)));

  await writeFile(join(root, "bench/packs/tamper-fixture/reports/results.jsonl"), '{"tampered":true}\n');
  result = await verifyPack(root, { manifestPath });
  assert.ok(result.errors.some((e) => /result-set hash mismatch/i.test(e)));

  await rm(root, { recursive: true, force: true });
});

test("sealed without remote attestation fails verify", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/fake-sealed.json";
  await freezePack(root, manifestPath, manifestDraft("fake-sealed"));
  await commitAll(root, "freeze");
  await generatePack(root, manifestPath, syntheticFixtureTrace);
  await runPack(root, manifestPath, syntheticFixtureRun);
  await reportPack(root, manifestPath, defaultReportFormatter);

  const statePath = join(root, "bench/packs/fake-sealed/state.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.classification = "sealed";
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

  const result = await verifyPack(root, { manifestPath });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /sealed classification requires remote attestation/i.test(e)));
  await rm(root, { recursive: true, force: true });
});

test("v0.1 cannot be relabeled sealed in corpus split", async () => {
  const { root } = await initProtocolRepo();
  await mkdir(join(root, "bench/traces/holdout"), { recursive: true });
  await mkdir(join(root, "bench/packs/holdout-v0.1"), { recursive: true });
  await writeFile(join(root, "bench/traces/holdout/fixture.json"), '{"schemaVersion":1,"name":"x"}\n');
  await writeFile(
    join(root, "bench/corpus-split.json"),
    `${JSON.stringify({ status: "sealed", splits: { holdout: { classification: "sealed" } } }, null, 2)}\n`,
  );
  await writeFile(
    join(root, "bench/packs/holdout-v0.1/state.json"),
    `${JSON.stringify({ classification: "sealed" }, null, 2)}\n`,
  );
  const result = await verifyPack(root, { packId: HOLDOUT_V01.packId });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /cannot be relabeled sealed/i.test(e)));
  await rm(root, { recursive: true, force: true });
});

test("hand-edited report markdown fails verify", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/report-tamper.json";
  await freezePack(root, manifestPath, manifestDraft("report-tamper"));
  await commitAll(root, "freeze");
  await generatePack(root, manifestPath, syntheticFixtureTrace);
  await runPack(root, manifestPath, syntheticFixtureRun);
  await reportPack(root, manifestPath, defaultReportFormatter);

  const reportPath = join(root, "bench/packs/report-tamper/reports/report.md");
  await writeFile(reportPath, "# tampered report\n");
  const result = await verifyPack(root, { manifestPath });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /report hash mismatch/i.test(e)));
  await rm(root, { recursive: true, force: true });
});

test("protocolExempt on new pack fails CI guard scan", async () => {
  const { root } = await initProtocolRepo();
  await mkdir(join(root, "bench/splits"), { recursive: true });
  await writeFile(
    join(root, "bench/splits/holdout-v0.2.json"),
    `${JSON.stringify({ packId: "holdout-v0.2", protocolExempt: true }, null, 2)}\n`,
  );
  const errors = await scanProtocolExempt(root, "main");
  assert.ok(errors.some((e) => /protocolExempt forbidden/i.test(e)));
  await rm(root, { recursive: true, force: true });
});

test("CI guard fails mixed introduction of manifest traces report", async () => {
  const { root } = await initProtocolRepo();
  const base = git(root, ["rev-parse", "HEAD"]);
  await mkdir(join(root, "bench/packs/holdout-v0.2/traces"), { recursive: true });
  await mkdir(join(root, "bench/packs/holdout-v0.2/reports"), { recursive: true });
  await mkdir(join(root, "bench/splits"), { recursive: true });
  await writeFile(join(root, "bench/splits/holdout-v0.2.json"), '{"packId":"holdout-v0.2"}\n');
  await writeFile(join(root, "bench/packs/holdout-v0.2/traces/a.json"), "{}\n");
  await writeFile(join(root, "bench/packs/holdout-v0.2/reports/report.md"), "# r\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "mixed intro"]);

  const errors = await scanMixedIntroduction(root, base);
  assert.ok(errors.some((e) => /manifest\+traces\+report introduced together/i.test(e)));
  await rm(root, { recursive: true, force: true });
});

test("stub or local attestation with reportPack must not classify sealed", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/stub-attest.json";
  await freezePack(root, manifestPath, manifestDraft("stub-attest"));
  await commitAll(root, "freeze manifest");

  const { writeAttestation } = await import("../bench/holdout-state.mjs");
  const { resolvePackPaths, readManifest } = await import("../bench/holdout-protocol.mjs");
  const manifest = await readManifest(root, manifestPath);
  const pack = resolvePackPaths(root, { ...manifest, manifestPath });
  await writeAttestation(root, pack, {
    schemaVersion: 1,
    packId: "stub-attest",
    freezeCommitSha: git(root, ["rev-parse", "HEAD"]),
    manifestSha256: manifest.manifestSha256,
    reposLockSha256: manifest.reposLockSha256,
    repositoryLocks: manifest.repositoryLocks,
    workflowRunId: "test-run-0001",
    workflowRunUrl: "https://github.com/example/example/actions/runs/1",
    attestedAt: new Date().toISOString(),
    stub: true,
  });
  await commitAll(root, "stub attestation");

  await generatePack(root, manifestPath, syntheticFixtureTrace);
  await runPack(root, manifestPath, syntheticFixtureRun);
  const reported = await reportPack(root, manifestPath, defaultReportFormatter);
  assert.notEqual(reported.classification, "sealed");
  assert.notEqual(reported.classification, "remotely-attested");

  const result = await verifyPack(root, { manifestPath });
  if (result.classification === "sealed" || result.classification === "remotely-attested") {
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /non-production attestation|production GHA attestation/i.test(e)));
  }
  await rm(root, { recursive: true, force: true });
});

test("ci-guard fails when base ref is missing or unresolvable", async () => {
  const { root } = await initProtocolRepo();
  const result = await runHoldoutCiGuard(root, { baseRef: "origin/this-branch-does-not-exist-xyz" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /base ref not resolvable|git fetch.*failed/i.test(e)));
  await rm(root, { recursive: true, force: true });
});

test("sealed classification with production attestation in GHA passes verify", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/sealed-fixture.json";
  await freezePack(root, manifestPath, manifestDraft("sealed-fixture"));
  await commitAll(root, "freeze manifest");

  const { writeAttestation } = await import("../bench/holdout-state.mjs");
  const { resolvePackPaths, readManifest } = await import("../bench/holdout-protocol.mjs");
  const manifest = await readManifest(root, manifestPath);
  const pack = resolvePackPaths(root, { ...manifest, manifestPath });
  await writeAttestation(root, pack, {
    schemaVersion: 1,
    packId: "sealed-fixture",
    freezeCommitSha: git(root, ["rev-parse", "HEAD"]),
    manifestSha256: manifest.manifestSha256,
    reposLockSha256: manifest.reposLockSha256,
    repositoryLocks: manifest.repositoryLocks,
    workflowRunId: "9876543210",
    workflowRunUrl: "https://github.com/fil/freshctx/actions/runs/9876543210",
    attestedAt: new Date().toISOString(),
  });
  await commitAll(root, "production-shaped attestation");

  const prevActions = process.env.GITHUB_ACTIONS;
  process.env.GITHUB_ACTIONS = "true";
  try {
    await generatePack(root, manifestPath, syntheticFixtureTrace);
    await runPack(root, manifestPath, syntheticFixtureRun);
    const reported = await reportPack(root, manifestPath, defaultReportFormatter);
    assert.equal(reported.classification, "sealed");

    const result = await verifyPack(root, { manifestPath });
    assert.equal(result.classification, "sealed");
    assert.equal(result.valid, true, result.errors?.join("; "));
  } finally {
    if (prevActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = prevActions;
  }
  await rm(root, { recursive: true, force: true });
});
