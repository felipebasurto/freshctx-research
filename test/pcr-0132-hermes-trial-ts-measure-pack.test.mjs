import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  isolatedSemanticEngineOffFromEnv,
  semanticEngineOptionsForBridge,
} from "../adapters/hermes/bridge.mjs";
import { missingIsolatedSemanticEngineRunner } from "../ise/treesitter/client.mjs";
import {
  FORCE_HOST_READ_ENV,
  FORCE_HOST_READ_HOOK_ENV,
  FORCE_HOST_READ_PLUGIN_NAME,
  applyForceHostReadToTools,
  assertT1HostReadTools,
  envWithForceHostRead,
  forceHostReadHookPath,
  forceHostReadPluginDest,
  forceHostReadPluginDir,
  readRecordedHostReadTools,
  t1HostReadToolsInvalidReason,
  t1HostReadToolsValid,
  t1ToolsForAssert,
} from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  applyForceHostReadInput,
  handleForceHostReadToolCall,
  registerForceHostReadHermesPlugin,
} from "../docs/lab/hermes-trial-ts/force-host-read.mjs";
import {
  acpSessionPrompt,
  cliQueryArgs,
  parseNdjsonMessages,
  stdoutMatchesCurrent,
  toolsFromHermesEvents,
  tuiPromptSubmit,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import {
  detectHermesProtocol,
  hermesConfigYaml,
  hermesEnvForArm,
  hermesLaunchArgs,
  pluginsDirForHome,
  prepareHermesHome,
} from "../docs/lab/hermes-trial-ts/launch-hermes.mjs";
import {
  MARKER_V1,
  TARGET_FILE,
  TARGET_SYMBOL,
  hostReadToolArgs,
} from "../docs/lab/hermes-trial-ts/pack.mjs";
import { createDumpProxy, dummyChatCompletion, scanProviderPayload } from "../docs/lab/hermes-trial-ts/proxy.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("PCR 0132 Hermes Isolated Semantic Engine off env matches Pi harness knob", () => {
  assert.equal(isolatedSemanticEngineOffFromEnv({ FRESHCTX_ISOLATED_SEMANTIC_ENGINE: "off" }), true);
  assert.equal(isolatedSemanticEngineOffFromEnv({}), false);
  assert.deepEqual(
    semanticEngineOptionsForBridge({}, { FRESHCTX_ISOLATED_SEMANTIC_ENGINE: "off" }),
    { semanticEngineRunner: null },
  );
  assert.deepEqual(semanticEngineOptionsForBridge({}, {}), {});
  const runner = missingIsolatedSemanticEngineRunner();
  assert.deepEqual(
    semanticEngineOptionsForBridge({ semanticEngineRunner: runner }, { FRESHCTX_ISOLATED_SEMANTIC_ENGINE: "off" }),
    { semanticEngineRunner: runner },
  );
});

test("PCR 0132 force-host-read rewrites Hermes read_file to settleDailyLedger symbol scope", () => {
  const input = { path: TARGET_FILE, offset: 1, limit: 2000 };
  applyForceHostReadInput(input);
  assert.deepEqual(input, hostReadToolArgs());
  const state = { hostReadSatisfied: false };
  const event = { toolName: "read_file", args: { path: TARGET_FILE } };
  assert.equal(handleForceHostReadToolCall(event, state), null);
  assert.deepEqual(event.args, hostReadToolArgs());
  const blocked = handleForceHostReadToolCall({ toolName: "bash", args: { command: "grep ST0 src/settlement.ts" } }, state);
  assert.equal(blocked?.block, true);
});

test("PCR 0132 t1 host-read gate accepts read_file symbol args and rejects leftover bash", () => {
  const good = [{ toolName: "read_file", args: hostReadToolArgs() }];
  assert.equal(t1HostReadToolsValid(good), true);
  assert.equal(t1HostReadToolsInvalidReason([]), "t1-read recorded no host tools");
  assert.match(
    t1HostReadToolsInvalidReason([{ toolName: "bash", args: { command: "cat src/settlement.ts" } }]),
    /leftover bash/u,
  );
  assert.match(
    t1HostReadToolsInvalidReason([{ toolName: "read_file", args: { path: TARGET_FILE, offset: 1, limit: 40 } }]),
    /scope=symbol/u,
  );
  assert.doesNotThrow(() => assertT1HostReadTools(good, { arm: "freshctx-ts" }));
  const forced = applyForceHostReadToTools([{ toolName: "read_file", args: { path: TARGET_FILE, offset: 12 } }]);
  assert.deepEqual(forced[0].args, hostReadToolArgs());
});

test("PCR 0132 launch-hermes config and env keep Isolated Semantic Engine off on arm B", () => {
  assert.match(hermesConfigYaml({ engine: "freshctx" }), /engine: freshctx/u);
  assert.doesNotMatch(hermesConfigYaml({}), /engine: freshctx/u);
  assert.match(hermesConfigYaml({}), new RegExp(`enabled:\\n\\s+- ${FORCE_HOST_READ_PLUGIN_NAME}`, "u"));
  const env = hermesEnvForArm({
    arm: "freshctx-no-ts",
    proxyBaseUrl: "http://127.0.0.1:9/v1",
    dumpDir: "/tmp/hermes-trial-dump",
    hermesHome: "/tmp/hermes-home",
  });
  assert.equal(env.FRESHCTX_ISOLATED_SEMANTIC_ENGINE, "off");
  assert.equal(env[FORCE_HOST_READ_ENV], "1");
  assert.equal(env[FORCE_HOST_READ_HOOK_ENV], forceHostReadHookPath());
  assert.equal(env.OPENAI_MODEL, "deepseek-v4-flash");
  assert.equal(env.OPENAI_BASE_URL, "http://127.0.0.1:9/v1");
  assert.equal(envWithForceHostRead({}).HERMES_TRIAL_FORCE_HOST_READ, "1");
  assert.equal(pluginsDirForHome("/tmp/home"), join("/tmp/home", "plugins"));
  assert.equal(detectHermesProtocol("Usage: hermes acp"), "acp");
  assert.equal(detectHermesProtocol("tui_gateway"), "tui-gateway");
  assert.equal(detectHermesProtocol("chat -q"), "cli");
  assert.deepEqual(hermesLaunchArgs("acp"), ["acp"]);
});

test("PCR 0132 hermes-queries speak TUI gateway and ACP without inventing --mode rpc", () => {
  const tui = tuiPromptSubmit("hello", "p1");
  assert.equal(tui.method, "prompt.submit");
  assert.equal(tui.params.text, "hello");
  const acp = acpSessionPrompt({ sessionId: "s1", text: "hello", id: "p2" });
  assert.equal(acp.method, "session/prompt");
  assert.equal(acp.params.sessionId, "s1");
  const events = parseNdjsonMessages('ignore\n{"method":"tool.start","name":"read_file","args":{"path":"src/settlement.ts"}}\n');
  const tools = toolsFromHermesEvents(events);
  assert.equal(tools[0].toolName, "read_file");
  assert.equal(tools[0].args.scope, undefined);
  assert.equal(tools[0].args.selector, undefined);
  assert.match(t1HostReadToolsInvalidReason(tools), /scope=symbol/u);
  assert.throws(() => assertT1HostReadTools(tools, { arm: "nothing" }), /scope=symbol/u);
  assert.equal(stdoutMatchesCurrent("SETTLE=ST1"), true);
  assert.equal(stdoutMatchesCurrent("SETTLE=ST0"), false);
  assert.deepEqual(cliQueryArgs({ message: "x", continueSession: true }).slice(0, 3), ["--continue", "chat", "-q"]);
});

test("PCR 0132 dump proxy writes scan.json without printing secrets", async () => {
  const dumpDir = await mkdtemp(join(tmpdir(), "freshctx-hermes-trial-dump-"));
  const proxy = createDumpProxy({ dumpDir, dumpOnly: true });
  const bound = await proxy.listen();
  const payload = {
    model: "deepseek-v4-flash",
    messages: [
      {
        role: "user",
        content: `quote <freshctx-unit resolution="isolated-semantic-engine">${MARKER_V1}</freshctx-unit>`,
      },
    ],
  };
  const text = JSON.stringify(payload);
  const response = await fetch(`${bound.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: "Bearer SECRETKEY", "content-type": "application/json" },
    body: text,
  });
  assert.equal(response.status, 200);
  const dummy = dummyChatCompletion();
  assert.equal((await response.json()).id, dummy.id);
  const scan = JSON.parse(await readFile(join(dumpDir, "001.scan.json"), "utf8"));
  assert.equal(scan.t2ExactNewBytes, true);
  assert.equal(scan.resolution, "isolated-semantic-engine");
  assert.equal(scan.utf8Bytes, Buffer.byteLength(text));
  const redacted = proxy.redactHeaders({ Authorization: "Bearer SECRETKEY", accept: "application/json" });
  assert.equal(redacted.Authorization, "[redacted]");
  await proxy.close();
});

test("PCR 0132 scanProviderPayload reads Isolated Semantic Engine dump token after stringify", () => {
  const stringified = JSON.stringify({
    messages: [{ content: '<freshctx-unit resolution="isolated-semantic-engine">ST1</freshctx-unit>' }],
  });
  const scan = scanProviderPayload(stringified);
  assert.equal(scan.resolution, "isolated-semantic-engine");
  assert.equal(scan.t2ExactNewBytes, true);
  assert.equal(scan.targetFileMention, false);
  assert.ok(here.includes("test"));
});

test("PCR 0132 registerForceHostReadHermesPlugin wires handleForceHostReadToolCall on pre_tool_call", () => {
  const hooks = new Map();
  const recorded = [];
  const ctx = {
    register_hook(name, fn) {
      hooks.set(name, fn);
    },
  };
  const prior = process.env[FORCE_HOST_READ_ENV];
  process.env[FORCE_HOST_READ_ENV] = "1";
  try {
    registerForceHostReadHermesPlugin(ctx, { record: (tool) => recorded.push(tool) });
    const hook = hooks.get("pre_tool_call");
    assert.equal(typeof hook, "function");
    const args = { path: TARGET_FILE, offset: 1, limit: 40 };
    const directive = hook("read_file", args, "t1");
    assert.equal(directive.action, "modify");
    assert.deepEqual(directive.args, hostReadToolArgs());
    assert.deepEqual(args, hostReadToolArgs());
    assert.equal(recorded.length, 1);
    assert.deepEqual(recorded[0].args, hostReadToolArgs());
    const blocked = hook("bash", { command: "grep ST0 src/settlement.ts" }, "t1");
    assert.equal(blocked.action, "block");
    assert.match(blocked.message, /settleDailyLedger/u);
  } finally {
    if (prior === undefined) delete process.env[FORCE_HOST_READ_ENV];
    else process.env[FORCE_HOST_READ_ENV] = prior;
  }
});

test("PCR 0132 force-host-read hook CLI invokes handleForceHostReadToolCall", () => {
  const prior = process.env[FORCE_HOST_READ_ENV];
  process.env[FORCE_HOST_READ_ENV] = "1";
  try {
    const result = spawnSync(process.execPath, [forceHostReadHookPath()], {
      input: JSON.stringify({
        toolName: "read_file",
        args: { path: TARGET_FILE, offset: 12, limit: 9 },
      }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.equal(out.enabled, true);
    assert.equal(out.directive.action, "modify");
    assert.deepEqual(out.directive.args, hostReadToolArgs());
    assert.deepEqual(out.tool.args, hostReadToolArgs());
  } finally {
    if (prior === undefined) delete process.env[FORCE_HOST_READ_ENV];
    else process.env[FORCE_HOST_READ_ENV] = prior;
  }
});

test("PCR 0132 prepareHermesHome installs force-host-read plugin on nothing arm", async () => {
  const hermesHome = await mkdtemp(join(tmpdir(), "freshctx-hermes-home-"));
  const prepared = await prepareHermesHome({ arm: "nothing", hermesHome });
  assert.equal(prepared.engine, null);
  const dest = forceHostReadPluginDest(prepared.pluginsDir);
  const yaml = await readFile(join(dest, "plugin.yaml"), "utf8");
  assert.match(yaml, /name:\s*force-host-read/u);
  const init = await readFile(join(dest, "__init__.py"), "utf8");
  assert.match(init, /register_hook\("pre_tool_call"/u);
  assert.match(init, /handleForceHostReadToolCall/u);
  const config = await readFile(join(hermesHome, "config.yaml"), "utf8");
  assert.match(config, /force-host-read/u);
  assert.doesNotMatch(config, /engine: freshctx/u);
  assert.equal(forceHostReadPluginDir().endsWith("force-host-read-plugin"), true);
});

test("PCR 0132 auto-rpc always asserts t1 host read when tools are empty", async () => {
  const src = await readFile(join(here, "../docs/lab/hermes-trial-ts/auto-rpc.mjs"), "utf8");
  const queries = await readFile(join(here, "../docs/lab/hermes-trial-ts/hermes-queries.mjs"), "utf8");
  assert.doesNotMatch(src, /t1-read" && tools\.length > 0/u);
  assert.match(src, /if \(cell\.id === "t1-read"\) \{\s*assertT1HostReadTools\(tools/u);
  assert.doesNotMatch(src, /applyForceHostReadToTools/u);
  assert.doesNotMatch(queries, /applyForceHostReadToTools/u);
  assert.equal(t1ToolsForAssert({ eventTools: [], recordedTools: [] }).length, 0);
  assert.equal(t1HostReadToolsInvalidReason(t1ToolsForAssert({ eventTools: [], recordedTools: [] })), "t1-read recorded no host tools");
  assert.throws(
    () => assertT1HostReadTools([], { arm: "nothing" }),
    /t1-read recorded no host tools/u,
  );
  const recorded = [{ toolName: "read_file", args: hostReadToolArgs() }];
  const rawEvents = [{ toolName: "read_file", args: { path: TARGET_FILE } }];
  assert.deepEqual(t1ToolsForAssert({ eventTools: [], recordedTools: recorded }), recorded);
  assert.deepEqual(t1ToolsForAssert({ eventTools: rawEvents, recordedTools: recorded }), recorded);
  assert.deepEqual(t1ToolsForAssert({ eventTools: rawEvents, recordedTools: [] }), rawEvents);
  assert.match(t1HostReadToolsInvalidReason(rawEvents), /scope=symbol/u);
  assert.equal(t1HostReadToolsValid(recorded), true);
});

test("PCR 0132 plugin-recorded tools feed t1 assert on CLI fallback", async () => {
  const dumpDir = await mkdtemp(join(tmpdir(), "freshctx-hermes-force-log-"));
  await writeFile(
    join(dumpDir, "force-host-read.tools.jsonl"),
    `${JSON.stringify({ toolName: "read_file", args: hostReadToolArgs() })}\n`,
  );
  const recorded = await readRecordedHostReadTools(dumpDir);
  const tools = t1ToolsForAssert({ eventTools: [], recordedTools: recorded });
  assert.doesNotThrow(() => assertT1HostReadTools(tools, { arm: "nothing" }));
  assert.equal(tools[0].args.selector, TARGET_SYMBOL);
});
