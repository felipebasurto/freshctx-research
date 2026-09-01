import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  FORCE_HOST_READ_ENV,
  assertT1HostReadTools,
  envWithForceHostRead,
  forceHostReadExtensionPath,
  piArgsForArm,
  readToolMatchesHostArgs,
  t1HostReadToolsInvalidReason,
  t1HostReadToolsValid,
} from "../docs/lab/pi-trial-ts/auto-rpc-host-read.mjs";
import {
  applyForceHostReadInput,
  handleForceHostReadToolCall,
  registerForceHostReadExtension,
} from "../docs/lab/pi-trial-ts/force-host-read-core.mjs";
import forceHostReadExtension from "../docs/lab/pi-trial-ts/force-host-read.mjs";
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

function mockPi() {
  const handlers = new Map();
  return {
    handlers,
    on(event, handler) {
      handlers.set(event, handler);
    },
    setActiveTools(names) {
      this.activeTools = names;
    },
    activeTools: null,
  };
}

test("PCR 0117 hostReadToolArgs pass scope=symbol selector settleDailyLedger", () => {
  assert.deepEqual(hostReadToolArgs(), {
    path: TARGET_FILE,
    scope: "symbol",
    selector: TARGET_SYMBOL,
  });
});

test("PCR 0117 force-host-read core mutates offset read input to hostReadToolArgs", () => {
  const input = { path: TARGET_FILE, offset: 12, limit: 40 };
  applyForceHostReadInput(input);
  assert.deepEqual(input, hostReadToolArgs());
});

test("PCR 0117 force-host-read core blocks bash and accepts symbol read", () => {
  const state = { hostReadSatisfied: false };
  const readEvent = { toolName: "read", input: { path: TARGET_FILE, offset: 1, limit: 5 } };
  assert.equal(handleForceHostReadToolCall(readEvent, state), null);
  assert.deepEqual(readEvent.input, hostReadToolArgs());
  assert.equal(state.hostReadSatisfied, true);

  const bashEvent = { toolName: "bash", input: { command: "grep ST0 src/settlement.ts" } };
  const blocked = handleForceHostReadToolCall(bashEvent, state);
  assert.equal(blocked?.block, true);
});

test("PCR 0117 registerForceHostReadExtension runs on mock Pi when env is set", () => {
  const prior = process.env.PI_TRIAL_FORCE_HOST_READ;
  process.env.PI_TRIAL_FORCE_HOST_READ = "1";
  try {
    const pi = mockPi();
    registerForceHostReadExtension(pi);
    assert.equal(typeof pi.handlers.get("session_start"), "function");
    assert.equal(typeof pi.handlers.get("tool_call"), "function");
    pi.handlers.get("session_start")();
    assert.deepEqual(pi.activeTools, ["read"]);

    const readEvent = { toolName: "read", input: { path: TARGET_FILE, offset: 3, limit: 9 } };
    pi.handlers.get("tool_call")(readEvent);
    assert.deepEqual(readEvent.input, hostReadToolArgs());
  } finally {
    if (prior === undefined) delete process.env.PI_TRIAL_FORCE_HOST_READ;
    else process.env.PI_TRIAL_FORCE_HOST_READ = prior;
  }
});

test("PCR 0117 force-host-read.mjs wrapper delegates to core register", () => {
  const prior = process.env.PI_TRIAL_FORCE_HOST_READ;
  process.env.PI_TRIAL_FORCE_HOST_READ = "1";
  try {
    const pi = mockPi();
    forceHostReadExtension(pi);
    const readEvent = { toolName: "read", input: { path: TARGET_FILE, limit: 2 } };
    pi.handlers.get("tool_call")(readEvent);
    assert.deepEqual(readEvent.input, hostReadToolArgs());
  } finally {
    if (prior === undefined) delete process.env.PI_TRIAL_FORCE_HOST_READ;
    else process.env.PI_TRIAL_FORCE_HOST_READ = prior;
  }
});

test("PCR 0117 piArgsForArm loads force-host-read extension and deepseek-v4-flash only", () => {
  const args = piArgsForArm({
    dumpExt,
    freshCtxExtension: "/tmp/freshctx/adapters/pi/extension.ts",
    forceHostRead: true,
  });
  assert.match(args.join(" "), /deepseek-v4-flash/u);
  assert.doesNotMatch(args.join(" "), /deepseek-v4-pro/u);
  assert.ok(args.includes(forceHostReadExtensionPath()));
  assert.ok(args.includes(dumpExt));
});

test("PCR 0117 t1HostReadToolsValid rejects leftover bash or offset even with one matching read", () => {
  const hostRead = { toolName: "read", args: hostReadToolArgs() };
  assert.equal(t1HostReadToolsValid([hostRead]), true);
  assert.equal(
    t1HostReadToolsInvalidReason([
      { toolName: "bash", args: { command: "grep ST0 src/settlement.ts" } },
      hostRead,
    ]),
    "t1-read leftover bash tool is invalid",
  );
  assert.equal(
    t1HostReadToolsInvalidReason([
      { toolName: "read", args: { path: TARGET_FILE, offset: 10, limit: 30 } },
      hostRead,
    ]),
    "t1-read read tool must use scope=symbol selector settleDailyLedger with no offset/limit",
  );
  assert.equal(
    t1HostReadToolsValid([
      { toolName: "bash", args: { command: "grep ST0 src/settlement.ts" } },
      hostRead,
    ]),
    false,
  );
});

test("PCR 0117 assertT1HostReadTools fail-closes invalid t1 captures", () => {
  assert.throws(
    () =>
      assertT1HostReadTools(
        [
          { toolName: "bash", args: { command: "grep ST0" } },
          { toolName: "read", args: hostReadToolArgs() },
        ],
        { arm: "freshctx-ts" },
      ),
    /leftover bash tool is invalid/u,
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

test("PCR 0117 readToolMatchesHostArgs rejects offset reads", () => {
  assert.ok(readToolMatchesHostArgs({ toolName: "read", args: hostReadToolArgs() }));
  assert.equal(
    readToolMatchesHostArgs({
      toolName: "read",
      args: { path: TARGET_FILE, offset: 1, limit: 40 },
    }),
    false,
  );
});

test("PCR 0117 envWithForceHostRead pins harness env for t1 host read", () => {
  assert.equal(envWithForceHostRead({ FRESHCTX_ISOLATED_SEMANTIC_ENGINE: "off" })[FORCE_HOST_READ_ENV], "1");
});
