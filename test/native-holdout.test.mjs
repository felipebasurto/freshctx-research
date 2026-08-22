import assert from "node:assert/strict";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { finalPiCapture, runPiTrace } from "../bench/pi-trace-runner.mjs";
import { finalHermesCapture, runHermesTrace } from "../bench/hermes-trace-runner.mjs";
import { finalPiNativeCapture, runPiNativeTrace } from "../bench/pi-native-trace-runner.mjs";
import { finalHermesNativeCapture, runHermesNativeTrace } from "../bench/hermes-native-trace-runner.mjs";
import { listHoldoutTraces } from "./helpers/adapter-holdout-parity.mjs";

const HOSTS_SCRIPT = new URL("../scripts/hosts.mjs", import.meta.url);
const MANIFEST_PATH = new URL("../bench/hosts.manifest.json", import.meta.url);
const LOCK_PATH = new URL("../bench/hosts.lock.json", import.meta.url);

function git(cwd, args) {
  const run = spawnSync("git", args, { encoding: "utf8", cwd });
  if (run.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${run.stderr}`);
  }
  return run.stdout.trim();
}

async function makeFixture({ lockBytes = null, hostIds = null }) {
  const root = join(tmpdir(), `freshctx-hosts-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(join(root, "bench"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  if (hostIds) {
    manifest.hosts = manifest.hosts.filter((host) => hostIds.includes(host.id));
  }
  await writeFile(join(root, "bench/hosts.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  if (lockBytes !== null) {
    await writeFile(join(root, "bench/hosts.lock.json"), lockBytes);
  }

  await cp(HOSTS_SCRIPT, join(root, "scripts/hosts.mjs"));
  return root;
}

function runHosts(root, args, timeoutMs = 600_000) {
  return spawnSync("node", [join(root, "scripts/hosts.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: timeoutMs,
  });
}

test("hosts fetch honors existing lock without rewriting lock bytes", async (t) => {
  const lockBytes = await readFile(LOCK_PATH);
  const lock = JSON.parse(lockBytes.toString("utf8"));
  const root = await makeFixture({ lockBytes, hostIds: ["pi", "hermes"] });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const before = await readFile(join(root, "bench/hosts.lock.json"));
  const run = runHosts(root, ["fetch", "--ids=pi,hermes"]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Honored existing lock/u);

  const after = await readFile(join(root, "bench/hosts.lock.json"));
  assert.equal(after.compare(before), 0, "lock file bytes must be unchanged");

  for (const id of ["pi", "hermes"]) {
    const expected = lock.hosts[id].commit;
    const actual = git(join(root, "bench/hosts", id), ["rev-parse", "HEAD"]);
    assert.equal(actual, expected, `${id} checkout must match locked commit`);
  }
});

test("native holdout columns differ from FreshCtx-through-adapter payloads on holdout traces", async () => {
  const traces = await listHoldoutTraces();
  assert.ok(traces.length >= 10, "holdout v0.1 expects 10 traces");

  let piDiffers = 0;
  let hermesDiffers = 0;

  for (const trace of traces) {
    const [piAdapter, piNative, hermesAdapter, hermesNative] = await Promise.all([
      runPiTrace(trace),
      runPiNativeTrace(trace),
      runHermesTrace(trace),
      runHermesNativeTrace(trace),
    ]);

    const piAdapterCapture = finalPiCapture(piAdapter);
    const piNativeCapture = finalPiNativeCapture(piNative);
    const hermesAdapterCapture = finalHermesCapture(hermesAdapter);
    const hermesNativeCapture = finalHermesNativeCapture(hermesNative);

    assert.ok(piAdapterCapture, `${trace.name}: missing pi adapter capture`);
    assert.ok(piNativeCapture, `${trace.name}: missing pi native capture`);
    assert.ok(hermesAdapterCapture, `${trace.name}: missing hermes adapter capture`);
    assert.ok(hermesNativeCapture, `${trace.name}: missing hermes native capture`);

    if (piAdapterCapture.payloadSha256 !== piNativeCapture.payloadSha256) {
      piDiffers += 1;
    }
    if (hermesAdapterCapture.payloadSha256 !== hermesNativeCapture.payloadSha256) {
      hermesDiffers += 1;
    }

    assert.equal(piNativeCapture.nativeApplied, false, `${trace.name}: pi-native must not apply FreshCtx`);
    assert.match(
      String(hermesNativeCapture.baselineLabel ?? hermesNative.baseline),
      /^hermes-native(?:-precompress)?$/u,
      `${trace.name}: hermes baseline label must be native`,
    );
  }

  assert.ok(piDiffers > 0, "pi-native must not be byte-identical to pi-adapter on every cell");
  assert.ok(hermesDiffers > 0, "hermes-native must not be byte-identical to hermes-adapter on every cell");
});

test("native holdout runner emits six baselines per trace", async () => {
  const { runNativeHoldoutPack } = await import("../bench/native-holdout.mjs");
  const summary = await runNativeHoldoutPack({ skipReportWrite: true });
  assert.equal(summary.traces, 10);
  assert.equal(summary.records, 60);
  const baselines = new Set(summary.rows.map((row) => row.baseline));
  assert.deepEqual(
    [...baselines].sort(),
    ["freshctx-file", "freshctx-region", "hermes-adapter", "hermes-native", "pi-adapter", "pi-native"].sort(),
  );
});
