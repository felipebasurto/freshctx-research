import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  FORCE_HOST_READ_ENV,
  envWithForceHostRead,
  forceHostReadExtensionPath,
  piArgsForArm,
  readToolMatchesHostArgs,
  rejectNonHostT1Tools,
  t1HostReadToolsValid,
} from "../docs/lab/pi-trial-ts/auto-rpc-host-read.mjs";
import {
  MARKER_V0,
  MARKER_V1,
  TARGET_FILE,
  TARGET_SYMBOL,
  hostReadToolArgs,
} from "../docs/lab/pi-trial-ts/pack.mjs";
import { flipTargetInteriorMarker, mutate, reset } from "../docs/lab/pi-trial-ts/live.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../docs/lab/pi-trial-ts/fixture/src/settlement.ts");
const dumpExt = join(here, "../docs/lab/pi-trial-ts/dump-request.ts");

test("PCR 0117 auto-rpc host read args use scope=symbol selector settleDailyLedger", () => {
  assert.deepEqual(hostReadToolArgs(), {
    path: TARGET_FILE,
    scope: "symbol",
    selector: TARGET_SYMBOL,
  });
});

test("PCR 0117 piArgsForArm loads force-host-read extension and deepseek-v4-flash only", () => {
  const args = piArgsForArm({
    arm: "freshctx-ts",
    repoRoot: "/tmp/freshctx",
    dumpExt,
    freshCtxExtension: "/tmp/freshctx/adapters/pi/extension.ts",
    forceHostRead: true,
  });
  assert.match(args.join(" "), /deepseek-v4-flash/u);
  assert.doesNotMatch(args.join(" "), /deepseek-v4-pro/u);
  assert.ok(args.includes(forceHostReadExtensionPath()));
  assert.ok(args.includes(dumpExt));
});

test("PCR 0117 envWithForceHostRead pins harness env for t1 host read", () => {
  assert.equal(envWithForceHostRead({ FRESHCTX_SIDECAR: "off" })[FORCE_HOST_READ_ENV], "1");
});

test("PCR 0117 readToolMatchesHostArgs rejects grep bash and offset reads", () => {
  const expected = hostReadToolArgs();
  assert.ok(
    readToolMatchesHostArgs({
      toolName: "read",
      args: expected,
    }),
  );
  assert.equal(
    readToolMatchesHostArgs({
      toolName: "read",
      args: { path: TARGET_FILE, offset: 1, limit: 40 },
    }),
    false,
  );
  assert.equal(
    readToolMatchesHostArgs({
      toolName: "bash",
      args: { command: `grep -n ${TARGET_SYMBOL} ${TARGET_FILE}` },
    }),
    false,
  );
  assert.equal(rejectNonHostT1Tools([{ toolName: "bash", args: { command: "grep ST0" } }]), true);
  assert.equal(
    rejectNonHostT1Tools([
      { toolName: "read", args: { path: TARGET_FILE, offset: 1, limit: 20 } },
    ]),
    true,
  );
  assert.equal(
    rejectNonHostT1Tools([{ toolName: "read", args: hostReadToolArgs() }]),
    false,
  );
});

test("PCR 0117 t1HostReadToolsValid requires symbol-scope read not region fallback", () => {
  assert.equal(
    t1HostReadToolsValid([{ toolName: "read", args: hostReadToolArgs() }]),
    true,
  );
  assert.equal(
    t1HostReadToolsValid([
      { toolName: "bash", args: { command: "grep ST0 src/settlement.ts" } },
      { toolName: "read", args: { path: TARGET_FILE, offset: 10, limit: 30 } },
    ]),
    false,
  );
});

test("PCR 0117 settlement.ts fixture flips ST0 to ST1 in settleDailyLedger only", async () => {
  const fixtureRoot = join(here, "../docs/lab/pi-trial-ts/fixture");
  await reset("nothing", fixtureRoot);
  const root = join(here, "../docs/lab/pi-trial-ts/.work/nothing");
  const path = join(root, TARGET_FILE);
  const before = await readFile(path, "utf8");
  assert.match(before, new RegExp(`const MARKER_SETTLE = "${MARKER_V0}"`, "u"));
  await mutate("nothing", "flip-settle");
  const after = await readFile(path, "utf8");
  assert.match(after, new RegExp(`const MARKER_SETTLE = "${MARKER_V1}"`, "u"));
  assert.doesNotMatch(after, new RegExp(MARKER_V0, "u"));

  const source = await readFile(fixturePath, "utf8");
  const flipped = flipTargetInteriorMarker(source, {
    v0: MARKER_V0,
    v1: MARKER_V1,
    symbol: TARGET_SYMBOL,
  });
  assert.match(flipped, new RegExp(`"${MARKER_V1}"`, "u"));
  assert.doesNotMatch(flipped, new RegExp(`"${MARKER_V0}"`, "u"));
});

test("PCR 0117 force-host-read extension source wires hostReadToolArgs", async () => {
  const source = await readFile(forceHostReadExtensionPath(), "utf8");
  assert.match(source, /hostReadToolArgs/u);
  assert.match(source, /PI_TRIAL_FORCE_HOST_READ/u);
  assert.match(source, /setActiveTools\(\["read"\]\)/u);
});
