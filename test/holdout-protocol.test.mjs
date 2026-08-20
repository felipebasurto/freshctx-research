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
import { sha256 } from "../src/hash.mjs";

function git(cwd, args) {
  const run = spawnSync("git", args, { encoding: "utf8", cwd });
  if (run.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${run.stderr}`);
  }
  return run.stdout.trim();
}

async function initProtocolRepo() {
  const root = join(tmpdir(), `freshctx-protocol-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "protocol@test.local"]);
  git(root, ["config", "user.name", "Protocol Test"]);

  const policy = "export const DEFAULT_POLICY = { version: 1, maxUnits: 8 };\n";
  const anchors = "export function anchor() { return null; }\n";
  const projector = "export function project() { return []; }\n";
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
  await writeFile(join(root, "src/policy.mjs"), policy);
  await writeFile(join(root, "src/anchors.mjs"), anchors);
  await writeFile(join(root, "src/projector.mjs"), projector);
  await writeFile(join(root, "bench/repos.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);

  git(root, ["add", "."]);
  git(root, ["commit", "-m", "initial fixture"]);

  return { root, lock };
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

test("holdout protocol rejects generate before freeze", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/protocol-fixture.json";
  await assert.rejects(
    () => generatePack(root, manifestPath, syntheticFixtureTrace),
    (error) => error instanceof ProtocolError && /before freeze|ENOENT|no such file/i.test(error.message),
  );
  await rm(root, { recursive: true, force: true });
});

test("holdout protocol rejects run and report before generate", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/protocol-fixture.json";
  await freezePack(root, manifestPath, manifestDraft());
  await commitAll(root, "freeze manifest");

  await assert.rejects(
    () => runPack(root, manifestPath, syntheticFixtureRun),
    (error) => error instanceof ProtocolError && /before generate|generate before run/i.test(error.message),
  );
  await assert.rejects(
    () => reportPack(root, manifestPath, defaultReportFormatter),
    (error) => error instanceof ProtocolError && /before run|before generate|generate before run/i.test(error.message),
  );
  await rm(root, { recursive: true, force: true });
});

test("holdout protocol rejects uncommitted or dirty manifest", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/protocol-fixture.json";
  await freezePack(root, manifestPath, manifestDraft());

  await assert.rejects(
    () => generatePack(root, manifestPath, syntheticFixtureTrace),
    (error) => error instanceof ProtocolError && /not tracked|dirty|uncommitted/i.test(error.message),
  );

  await commitAll(root, "freeze manifest");
  const parsed = JSON.parse(await readFile(join(root, manifestPath), "utf8"));
  parsed.seeds.traceSelection = "dirty-uncommitted-seed";
  await writeFile(join(root, manifestPath), `${JSON.stringify(parsed, null, 2)}\n`);
  await assert.rejects(
    () => generatePack(root, manifestPath, syntheticFixtureTrace),
    (error) => error instanceof ProtocolError && /dirty|hash mismatch/i.test(error.message),
  );
  await rm(root, { recursive: true, force: true });
});

test("holdout protocol rejects tampered manifest hash after freeze commit", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/protocol-fixture.json";
  await freezePack(root, manifestPath, manifestDraft());
  await commitAll(root, "freeze manifest");

  const parsed = JSON.parse(await readFile(join(root, manifestPath), "utf8"));
  parsed.seeds.traceSelection = "tampered-seed";
  await writeFile(join(root, manifestPath), `${JSON.stringify(parsed, null, 2)}\n`);
  git(root, ["add", manifestPath]);
  git(root, ["commit", "-m", "tamper manifest without updating manifestSha256"]);

  await assert.rejects(
    () => generatePack(root, manifestPath, syntheticFixtureTrace),
    (error) => error instanceof ProtocolError && /hash mismatch|no commit contains manifest/i.test(error.message),
  );
  await rm(root, { recursive: true, force: true });
});

test("holdout protocol rejects artifacts already present at freeze commit", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/protocol-fixture.json";
  const tracesDir = "bench/packs/protocol-fixture/traces";
  await mkdir(join(root, tracesDir), { recursive: true });
  await writeFile(join(root, tracesDir, "preexisting.json"), "{}\n");

  await assert.rejects(
    () => freezePack(root, manifestPath, manifestDraft()),
    (error) => error instanceof ProtocolError && /traces already exist/i.test(error.message),
  );

  await rm(join(root, tracesDir), { recursive: true, force: true });
  const draft = manifestDraft();
  const frozen = await freezePack(root, manifestPath, draft);
  const manifest = JSON.parse(await readFile(join(root, manifestPath), "utf8"));
  await mkdir(join(root, tracesDir), { recursive: true });
  await writeFile(join(root, tracesDir, "preexisting.json"), "{}\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "freeze manifest with pre-seeded traces"]);

  await assert.rejects(
    () => generatePack(root, manifestPath, syntheticFixtureTrace),
    (error) => error instanceof ProtocolError && /already present at freeze commit/i.test(error.message),
  );
  assert.equal(manifest.manifestSha256, frozen.manifestSha256);
  await rm(root, { recursive: true, force: true });
});

test("holdout protocol rejects lock or implementation SHA drift from freeze record", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/protocol-fixture.json";
  await freezePack(root, manifestPath, manifestDraft());
  await commitAll(root, "freeze manifest");

  await writeFile(join(root, "src/policy.mjs"), "export const DEFAULT_POLICY = { version: 2 };\n");
  git(root, ["add", "src/policy.mjs"]);
  git(root, ["commit", "-m", "change policy"]);

  await assert.rejects(
    () => generatePack(root, manifestPath, syntheticFixtureTrace),
    (error) => error instanceof ProtocolError && /implementation path differs/i.test(error.message),
  );

  const { root: root2 } = await initProtocolRepo();
  const manifestPath2 = "bench/splits/protocol-fixture-lock.json";
  await freezePack(root2, manifestPath2, manifestDraft("protocol-fixture-lock"));
  await commitAll(root2, "freeze manifest");
  await writeFile(
    join(root2, "bench/repos.lock.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        repositories: {
          synthetic: {
            url: "synthetic://fixture",
            commit: "1111111111111111111111111111111111111111",
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  git(root2, ["add", "bench/repos.lock.json"]);
  git(root2, ["commit", "-m", "change lock"]);

  await assert.rejects(
    () => generatePack(root2, manifestPath2, syntheticFixtureTrace),
    (error) => error instanceof ProtocolError && /repos\.lock hash differs|repository lock SHA differs/i.test(error.message),
  );
  await rm(root2, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
});

test("holdout protocol happy path freeze → generate → run → report embeds provenance SHAs", async () => {
  const { root } = await initProtocolRepo();
  const manifestPath = "bench/splits/protocol-fixture.json";

  const frozen = await freezePack(root, manifestPath, manifestDraft());
  await commitAll(root, "freeze manifest");

  const generated = await generatePack(root, manifestPath, syntheticFixtureTrace);
  assert.equal(generated.provenance.manifestSha256, frozen.manifestSha256);
  assert.match(generated.provenance.freezeCommitSha, /^[0-9a-f]{40}$/);

  const ran = await runPack(root, manifestPath, syntheticFixtureRun);
  assert.equal(ran.provenance.freezeCommitSha, generated.provenance.freezeCommitSha);
  assert.equal(ran.provenance.implementationCommitSha, git(root, ["rev-parse", "HEAD"]));

  const reported = await reportPack(root, manifestPath, defaultReportFormatter);
  const report = reported.reportBody;
  assert.match(report, new RegExp(frozen.manifestSha256));
  assert.match(report, new RegExp(generated.provenance.freezeCommitSha));
  assert.match(report, new RegExp(ran.provenance.implementationCommitSha));
  assert.match(report, new RegExp(sha256(await readFile(join(root, "bench/repos.lock.json"), "utf8"))));
  assert.match(report, /0000000000000000000000000000000000000000/);

  await rm(root, { recursive: true, force: true });
});
