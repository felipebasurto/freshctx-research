import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { finalPiCapture, runPiTrace } from "../bench/pi-trace-runner.mjs";
import { finalPiNativeCapture, runPiNativeTrace } from "../bench/pi-native-trace-runner.mjs";
import { listHoldoutTraces } from "./helpers/adapter-holdout-parity.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOSTS_SCRIPT = new URL("../scripts/hosts.mjs", import.meta.url);

function git(cwd, args) {
  const run = spawnSync("git", args, { encoding: "utf8", cwd, env: process.env });
  if (run.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${run.stderr}`);
  }
  return run.stdout.trim();
}

function runHosts(root, args) {
  return spawnSync("node", [join(root, "scripts/hosts.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

async function seedFakeHostFixture() {
  const root = join(tmpdir(), `freshctx-hosts-unit-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(join(root, "bench", "scripts"), { recursive: true });
  await cp(HOSTS_SCRIPT, join(root, "scripts/hosts.mjs"));

  const contextModule = "agent/context_engine.py";
  const bare = join(root, "probe-bare.git");
  const seed = join(root, "probe-seed");
  await mkdir(join(seed, dirname(contextModule)), { recursive: true });
  await writeFile(join(seed, contextModule), "# probe\n");
  git(seed, ["init", "-b", "main"]);
  git(seed, ["config", "user.email", "probe@test"]);
  git(seed, ["config", "user.name", "probe"]);
  git(seed, ["add", "."]);
  git(seed, ["commit", "-m", "probe"]);
  const commit = git(seed, ["rev-parse", "HEAD"]);
  git(seed, ["clone", "--bare", ".", bare]);

  const checkout = join(root, "bench", "hosts", "probe");
  git(root, ["clone", bare, checkout]);

  const manifest = {
    schemaVersion: 1,
    freezeRule: "test fixture",
    hosts: [
      {
        id: "probe",
        url: bare,
        ref: commit,
        contextModule,
        license: "MIT",
      },
    ],
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(root, "bench/hosts.manifest.json"), manifestText);
  const manifestSha256 = createHash("sha256").update(manifestText).digest("hex");

  const lock = {
    schemaVersion: 1,
    manifestSha256,
    scope: "native-host-bakeout",
    resolvedAt: new Date().toISOString(),
    hosts: {
      probe: {
        url: bare,
        requestedRef: commit,
        commit,
        contextModule,
        license: "MIT",
      },
    },
  };
  await writeFile(join(root, "bench/hosts.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  return { root, commit };
}

test("hosts fetch honors existing lock without rewriting lock bytes (local fixture)", async (t) => {
  const { root, commit } = await seedFakeHostFixture();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const before = await readFile(join(root, "bench/hosts.lock.json"));
  const run = runHosts(root, ["fetch", "--ids=probe"]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Honored existing lock/u);

  const after = await readFile(join(root, "bench/hosts.lock.json"));
  assert.equal(after.compare(before), 0, "lock file bytes must be unchanged");
  assert.equal(git(join(root, "bench/hosts/probe"), ["rev-parse", "HEAD"]), commit);
});

test("pi-native payloads differ from pi-adapter on holdout traces (host-free)", async () => {
  const traces = await listHoldoutTraces();
  assert.ok(traces.length >= 10, "holdout v0.1 expects 10 traces");

  let piDiffers = 0;
  for (const trace of traces) {
    const [piAdapter, piNative] = await Promise.all([runPiTrace(trace), runPiNativeTrace(trace)]);
    const piAdapterCapture = finalPiCapture(piAdapter);
    const piNativeCapture = finalPiNativeCapture(piNative);
    assert.ok(piAdapterCapture, `${trace.name}: missing pi adapter capture`);
    assert.ok(piNativeCapture, `${trace.name}: missing pi native capture`);

    if (piAdapterCapture.payloadSha256 !== piNativeCapture.payloadSha256) {
      piDiffers += 1;
    }
    assert.equal(piNativeCapture.nativeApplied, false, `${trace.name}: pi-native must not apply FreshCtx`);
  }

  assert.ok(piDiffers > 0, "pi-native must not be byte-identical to pi-adapter on every cell");
});
