import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  ProtocolError,
  defaultReportFormatter,
  freezePack,
  generatePack,
  reportPack,
  runPack,
} from "../bench/holdout-protocol.mjs";
import { sha256 } from "../src/hash.mjs";

function git(cwd, args) {
  const run = spawnSync("git", args, { encoding: "utf8", cwd });
  if (run.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${run.stderr}`);
  }
  return run.stdout.trim();
}

async function initProtocolRepo() {
  const root = join(tmpdir(), `freshctx-v03-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "protocol@test.local"]);
  git(root, ["config", "user.name", "Protocol Test"]);

  const lock = {
    schemaVersion: 1,
    manifestSha256: "fixture",
    repositories: {
      synthetic: {
        url: "synthetic://fixture",
        commit: "0000000000000000000000000000000000000000",
      },
    },
  };

  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "bench/splits"), { recursive: true });
  await writeFile(join(root, "src/policy.mjs"), "export const DEFAULT_POLICY = { version: 1, maxUnits: 8 };\n");
  await writeFile(join(root, "src/anchors.mjs"), "export function anchor() { return null; }\n");
  await writeFile(join(root, "src/projector.mjs"), "export function project() { return []; }\n");
  await writeFile(join(root, "bench/repos.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "initial fixture"]);
  return root;
}

async function commitAll(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", message]);
}

function bindDraft(packId = "bind-existing") {
  return {
    packId,
    benchmarkVersion: `${packId}-v1`,
    label: "protocol-fixture",
    repositoryIds: ["synthetic"],
    mutationFamilies: ["interior-edit"],
    seeds: { traceSelection: "bind-seed" },
    samplingRules: { method: "sha256(commit + selector + scenario)", unitsPerFamily: 1 },
    metrics: ["payload-bytes"],
    gates: { requiredRecallMin: 1, staleBytesMax: 0, duplicateUnitsMax: 0 },
    exclusions: [],
    reposLockPath: "bench/repos.lock.json",
    bindExisting: true,
    generatorPath: "bench/generate-apex-pack.mjs",
    goldSource: "independent-symbols",
  };
}

test("bind-existing freeze hashes published traces and refuses to rewrite them", async () => {
  const root = await initProtocolRepo();
  const packId = "bind-existing";
  const manifestPath = `bench/splits/${packId}.json`;
  const tracesDir = `bench/packs/${packId}/traces`;
  const reportsDir = `bench/packs/${packId}/reports`;
  await mkdir(join(root, tracesDir), { recursive: true });
  await mkdir(join(root, reportsDir), { recursive: true });
  await writeFile(join(root, tracesDir, "cell.json"), `${JSON.stringify({ schemaVersion: 1, id: "cell" }, null, 2)}\n`);
  await writeFile(
    join(root, reportsDir, "results.jsonl"),
    `${JSON.stringify({ system: "isolated-semantic-engine", payloadBytes: 1 })}\n`,
  );
  await writeFile(join(root, "bench/generate-apex-pack.mjs"), "export const APEX_PACK_ID = \"holdout-v0.3-apex\";\n");

  await freezePack(root, manifestPath, bindDraft(packId), { bindExisting: true });
  await commitAll(root, "freeze bind-existing");

  const beforeTrace = sha256(await readFile(join(root, tracesDir, "cell.json"), "utf8"));
  const beforeJsonl = sha256(await readFile(join(root, reportsDir, "results.jsonl"), "utf8"));
  const frozen = JSON.parse(await readFile(join(root, manifestPath), "utf8"));
  assert.equal(frozen.bindExisting, true);
  assert.equal(frozen.traceSetHash.length, 64);
  assert.equal(frozen.resultSetHash.length, 64);
  assert.equal(frozen.generatorSha256.length, 64);

  await generatePack(root, manifestPath, async () => {
    throw new Error("must not regenerate traces");
  });
  await runPack(root, manifestPath, async () => {
    throw new Error("must not rerun results");
  });
  const reported = await reportPack(root, manifestPath, defaultReportFormatter);
  assert.equal(reported.classification, "locally-frozen");
  assert.equal(sha256(await readFile(join(root, tracesDir, "cell.json"), "utf8")), beforeTrace);
  assert.equal(sha256(await readFile(join(root, reportsDir, "results.jsonl"), "utf8")), beforeJsonl);
  await rm(root, { recursive: true, force: true });
});

test("bind-existing freeze refuses the sealed holdout-v0.2 tree", async () => {
  const root = await initProtocolRepo();
  await assert.rejects(
    () =>
      freezePack(
        root,
        "bench/splits/holdout-v0.2.json",
        { ...bindDraft("holdout-v0.2"), packId: "holdout-v0.2" },
        { bindExisting: true },
      ),
    (error) => error instanceof ProtocolError && /holdout-v0\.2/u.test(error.message),
  );
  await rm(root, { recursive: true, force: true });
});
