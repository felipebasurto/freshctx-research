import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
  applyForceHostReadToTools,
  assertT1HostReadTools,
  envWithForceHostRead,
  t1HostReadToolsInvalidReason,
  t1HostReadToolsValid,
} from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  applyForceHostReadInput,
  handleForceHostReadToolCall,
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
  const env = hermesEnvForArm({
    arm: "freshctx-no-ts",
    proxyBaseUrl: "http://127.0.0.1:9/v1",
    dumpDir: "/tmp/hermes-trial-dump",
    hermesHome: "/tmp/hermes-home",
  });
  assert.equal(env.FRESHCTX_ISOLATED_SEMANTIC_ENGINE, "off");
  assert.equal(env[FORCE_HOST_READ_ENV], "1");
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
  const tools = toolsFromHermesEvents(events, { forceHostRead: true });
  assert.equal(tools[0].toolName, "read_file");
  assert.equal(tools[0].args.scope, "symbol");
  assert.equal(tools[0].args.selector, TARGET_SYMBOL);
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
