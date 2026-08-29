import assert from "node:assert/strict";
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
  t1HostReadToolsValid,
  toolsFromExecutionStartEvents,
} from "../docs/lab/pi-trial-ts/auto-rpc-host-read.mjs";
import {
  applyForceHostReadInput,
  forceHostReadEnabled,
  handleForceHostReadExecutionStart,
  handleForceHostReadToolCall,
  registerForceHostReadExtension,
} from "../docs/lab/pi-trial-ts/force-host-read-core.mjs";
import forceHostReadExtension from "../docs/lab/pi-trial-ts/force-host-read.mjs";
import {
  TARGET_FILE,
  TARGET_SYMBOL,
  hostReadToolArgs,
} from "../docs/lab/pi-trial-ts/pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
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

function withForceHostReadEnv(run) {
  const prior = process.env[FORCE_HOST_READ_ENV];
  process.env[FORCE_HOST_READ_ENV] = "1";
  try {
    return run();
  } finally {
    if (prior === undefined) delete process.env[FORCE_HOST_READ_ENV];
    else process.env[FORCE_HOST_READ_ENV] = prior;
  }
}

test("PCR 0118 forceHostReadExtensionPath points at TypeScript entry for live Pi", () => {
  assert.match(forceHostReadExtensionPath(), /force-host-read\.ts$/u);
});

test("PCR 0118 handleForceHostReadExecutionStart mutates tool_execution_start args", () => {
  const state = { hostReadSatisfied: false };
  const event = {
    toolName: "read",
    args: { path: TARGET_FILE, offset: 1, limit: 2000 },
  };
  handleForceHostReadExecutionStart(event, state);
  assert.deepEqual(event.args, hostReadToolArgs());
});

test("PCR 0118 both hooks on one call mutate args and input after execution_start", () => {
  withForceHostReadEnv(() => {
    const pi = mockPi();
    registerForceHostReadExtension(pi);

    const startEvent = {
      toolCallId: "call-1",
      toolName: "read",
      args: { path: TARGET_FILE, offset: 1, limit: 2000 },
    };
    const callEvent = {
      toolCallId: "call-1",
      toolName: "read",
      input: { path: TARGET_FILE, offset: 1, limit: 2000 },
    };

    pi.handlers.get("tool_execution_start")(startEvent);
    pi.handlers.get("tool_call")(callEvent);

    assert.deepEqual(startEvent.args, hostReadToolArgs());
    assert.deepEqual(callEvent.input, hostReadToolArgs());
  });
});

test("PCR 0118 registerForceHostReadExtension no-ops hooks when env is unset", () => {
  const prior = process.env[FORCE_HOST_READ_ENV];
  delete process.env[FORCE_HOST_READ_ENV];
  try {
    const pi = mockPi();
    registerForceHostReadExtension(pi);
    pi.handlers.get("session_start")?.();
    assert.equal(pi.activeTools, null);

    const startEvent = { toolName: "read", args: { path: TARGET_FILE, offset: 1, limit: 5 } };
    pi.handlers.get("tool_execution_start")?.(startEvent);
    assert.deepEqual(startEvent.args, { path: TARGET_FILE, offset: 1, limit: 5 });
  } finally {
    if (prior === undefined) delete process.env[FORCE_HOST_READ_ENV];
    else process.env[FORCE_HOST_READ_ENV] = prior;
  }
});

test("PCR 0118 toolsFromExecutionStartEvents records live args without rewrite", () => {
  const events = [
    {
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "read",
      args: { path: TARGET_FILE, offset: 1, limit: 2000 },
    },
  ];
  const tools = toolsFromExecutionStartEvents(events);
  assert.deepEqual(tools, [
    {
      toolCallId: "call-1",
      toolName: "read",
      args: { path: TARGET_FILE, offset: 1, limit: 2000 },
    },
  ]);
  assert.throws(() => assertT1HostReadTools(tools, { arm: "freshctx-ts" }), /offset\/limit/u);
});

test("PCR 0118 toolsFromExecutionStartEvents leaves bash for fail-close assert", () => {
  const events = [
    {
      type: "tool_execution_start",
      toolCallId: "call-bash",
      toolName: "bash",
      args: { command: "grep ST0 src/settlement.ts" },
    },
    {
      type: "tool_execution_start",
      toolCallId: "call-read",
      toolName: "read",
      args: { path: TARGET_FILE, offset: 1, limit: 2000 },
    },
  ];
  const tools = toolsFromExecutionStartEvents(events);
  assert.equal(t1HostReadToolsValid(tools), false);
  assert.throws(() => assertT1HostReadTools(tools, { arm: "nothing" }), /leftover bash/u);
});

test("PCR 0118 piArgsForArm loads force-host-read.ts extension", () => {
  const args = piArgsForArm({
    dumpExt,
    freshCtxExtension: "/tmp/freshctx/adapters/pi/extension.ts",
    forceHostRead: true,
  });
  assert.ok(args.includes(forceHostReadExtensionPath()));
  assert.match(args[args.indexOf(forceHostReadExtensionPath())], /\.ts$/u);
});

test("PCR 0118 forceHostReadEnabled tracks harness env flag", () => {
  withForceHostReadEnv(() => {
    assert.equal(forceHostReadEnabled(), true);
    assert.equal(envWithForceHostRead({})[FORCE_HOST_READ_ENV], "1");
  });
});

test("PCR 0118 force-host-read.mjs wrapper still delegates to core register", () => {
  withForceHostReadEnv(() => {
    const pi = mockPi();
    forceHostReadExtension(pi);
    const readEvent = { toolName: "read", input: { path: TARGET_FILE, offset: 10, limit: 30 } };
    pi.handlers.get("tool_call")(readEvent);
    assert.deepEqual(readEvent.input, hostReadToolArgs());
    assert.ok(readToolMatchesHostArgs({ toolName: "read", args: readEvent.input }));
  });
});

test("PCR 0118 applyForceHostReadInput unchanged from PCR 0117", () => {
  const input = { path: TARGET_FILE, offset: 12, limit: 40 };
  applyForceHostReadInput(input);
  assert.deepEqual(input, hostReadToolArgs());
});

test("PCR 0118 registerForceHostReadExtension returns block from tool_execution_start", () => {
  withForceHostReadEnv(() => {
    const pi = mockPi();
    registerForceHostReadExtension(pi);
    const blocked = pi.handlers.get("tool_execution_start")({
      toolName: "bash",
      args: { command: "grep ST0 src/settlement.ts" },
    });
    assert.equal(blocked?.block, true);
  });
});

test("PCR 0118 registerForceHostReadExtension returns block from tool_call", () => {
  withForceHostReadEnv(() => {
    const pi = mockPi();
    registerForceHostReadExtension(pi);
    const blocked = pi.handlers.get("tool_call")({
      toolName: "grep",
      input: { pattern: "ST0", path: TARGET_FILE },
    });
    assert.equal(blocked?.block, true);
  });
});

test("PCR 0118 force-host-read.mjs wrapper returns block from registered tool_call", () => {
  withForceHostReadEnv(() => {
    const pi = mockPi();
    forceHostReadExtension(pi);
    const blocked = pi.handlers.get("tool_call")({
      toolName: "edit",
      input: { path: TARGET_FILE, oldText: "ST0", newText: "ST1" },
    });
    assert.equal(blocked?.block, true);
  });
});

test("PCR 0118 handleForceHostReadToolCall blocks bash after symbol read", () => {
  const state = { hostReadSatisfied: true };
  const blocked = handleForceHostReadToolCall(
    { toolName: "bash", input: { command: "grep ST0" } },
    state,
  );
  assert.equal(blocked?.block, true);
});
