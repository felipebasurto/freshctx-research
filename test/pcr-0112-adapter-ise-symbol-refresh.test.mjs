import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createAdapterEngine } from "../adapters/engine-factory.mjs";
import {
  buildReadToolCall,
  buildToolResultMessage,
  createPiAdapter,
  messageText,
  readScopeFromInput,
} from "../adapters/pi/replay.mjs";
import {
  buildReadToolCall as buildHermesReadToolCall,
  createHermesAdapter,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import { readScopeFromHermesArgs } from "../adapters/hermes/bridge.mjs";
import { latestReadCallIdsByObservation } from "../adapters/request-prune.mjs";
import { missingIsolatedSemanticEngineRunner } from "../ise/treesitter/client.mjs";

const PYTHON_ALPHA_OBSERVED = "def alpha():\n    return 1\n";
const PYTHON_BETA_OBSERVED = "def beta():\n    return 2\n";
const PYTHON_DUAL_UPDATED =
  "def alpha():\n    return 11\n\ndef beta():\n    return 22\n";

const TS_ALPHA_OBSERVED = "export function alpha() {\n  return 1;\n}\n";
const TS_BETA_MARKER = "BETA_SYMBOL_MARKER";
const TS_DUAL_UPDATED =
  `export function alpha() {\n  return 99;\n}\nexport function beta() {\n  return ${TS_BETA_MARKER};\n}\n`;

test("read scope parsers accept symbol metadata", () => {
  assert.deepEqual(readScopeFromInput({ scope: "symbol", selector: "alpha" }, 10), {
    scope: "symbol",
    selector: "alpha",
  });
  assert.deepEqual(readScopeFromHermesArgs({ scope: "symbol", selector: "main" }, 10), {
    scope: "symbol",
    selector: "main",
  });
  assert.deepEqual(readScopeFromInput({ scope: "symbol" }, 10), { scope: "file" });
});

test("observation keys keep two symbols and file+symbol distinct on one path", () => {
  const observations = new Map([
    ["call-file", { path: "mod.py", scope: "file" }],
    ["call-alpha", { path: "mod.py", scope: "symbol", selector: "alpha" }],
    ["call-beta", { path: "mod.py", scope: "symbol", selector: "beta" }],
  ]);
  const messages = [
    buildReadToolCall({ toolCallId: "call-file", path: "mod.py" }),
    buildToolResultMessage({ toolCallId: "call-file", content: "whole file" }),
    buildReadToolCall({
      toolCallId: "call-alpha",
      path: "mod.py",
      scope: "symbol",
      selector: "alpha",
    }),
    buildToolResultMessage({ toolCallId: "call-alpha", content: PYTHON_ALPHA_OBSERVED }),
    buildReadToolCall({
      toolCallId: "call-beta",
      path: "mod.py",
      scope: "symbol",
      selector: "beta",
    }),
    buildToolResultMessage({ toolCallId: "call-beta", content: PYTHON_BETA_OBSERVED }),
  ];

  assert.deepEqual(
    [...latestReadCallIdsByObservation(messages, observations, new Set(["read"]))].sort(),
    ["call-alpha", "call-beta", "call-file"],
  );
});

test("Pi replay keeps two symbol observations on one file and refreshes both via isolated-semantic-engine", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0112-pi-dual-"));
  await writeFile(join(workspace, "mod.py"), PYTHON_DUAL_UPDATED);

  const adapter = createPiAdapter({ budgetChars: 16_000 });
  const ctx = { cwd: workspace };

  for (const [callId, selector, observed] of [
    ["call-alpha", "alpha", PYTHON_ALPHA_OBSERVED],
    ["call-beta", "beta", PYTHON_BETA_OBSERVED],
  ]) {
    await adapter.onToolResult(
      {
        toolName: "read",
        toolCallId: callId,
        input: { path: "mod.py", scope: "symbol", selector },
        content: [{ type: "text", text: observed }],
        isError: false,
      },
      ctx,
    );
  }

  const messages = [
    buildReadToolCall({
      toolCallId: "call-alpha",
      path: "mod.py",
      scope: "symbol",
      selector: "alpha",
    }),
    buildToolResultMessage({ toolCallId: "call-alpha", content: PYTHON_ALPHA_OBSERVED }),
    buildReadToolCall({
      toolCallId: "call-beta",
      path: "mod.py",
      scope: "symbol",
      selector: "beta",
    }),
    buildToolResultMessage({ toolCallId: "call-beta", content: PYTHON_BETA_OBSERVED }),
    { role: "user", content: "refresh both symbols" },
  ];

  const result = await adapter.onContext({ messages, budgetChars: 16_000 }, ctx);
  assert.ok(result);

  const units = adapter.engine.registry.list().sort((a, b) => a.selector.localeCompare(b.selector));
  assert.equal(units.length, 2);
  assert.equal(units[0].selector, "alpha");
  assert.equal(units[0].resolutionMethod, "isolated-semantic-engine");
  assert.match(units[0].content, /return 11/u);
  assert.equal(units[1].selector, "beta");
  assert.equal(units[1].resolutionMethod, "isolated-semantic-engine");
  assert.match(units[1].content, /return 22/u);

  const payloadText = messageText(result.messages);
  assert.match(payloadText, /return 11/u);
  assert.match(payloadText, /return 22/u);
});

test("Pi replay symbol refresh resolves through the injected isolated-semantic-engine", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0112-pi-"));
  await writeFile(join(workspace, "sample.py"), "def alpha():\n    return 42\n");

  const adapter = createPiAdapter({ budgetChars: 8_000 });
  const ctx = { cwd: workspace };
  const callId = "call-symbol-1";

  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: callId,
      input: { path: "sample.py", scope: "symbol", selector: "alpha" },
      content: [{ type: "text", text: PYTHON_ALPHA_OBSERVED }],
      isError: false,
    },
    ctx,
  );

  const messages = [
    buildReadToolCall({
      toolCallId: callId,
      path: "sample.py",
      scope: "symbol",
      selector: "alpha",
    }),
    buildToolResultMessage({ toolCallId: callId, content: PYTHON_ALPHA_OBSERVED }),
    { role: "user", content: "refresh alpha" },
  ];

  const result = await adapter.onContext({ messages, budgetChars: 8_000 }, ctx);
  assert.ok(result);

  const unit = adapter.engine.registry.list()[0];
  assert.equal(unit.scope, "symbol");
  assert.equal(unit.selector, "alpha");
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "isolated-semantic-engine");
  assert.match(unit.content, /return 42/u);
  assert.match(messageText(result.messages), /return 42/u);
  assert.doesNotMatch(messageText(result.messages), /return 1/u);
});

test("Hermes replay symbol refresh resolves through the injected isolated-semantic-engine", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0112-hermes-"));
  await writeFile(join(workspace, "module.ts"), TS_DUAL_UPDATED);

  const stateFile = await createHermesStateFile("freshctx-pcr-0112-hermes-state-");
  const adapter = createHermesAdapter({ stateFile, budgetChars: 16_000 });
  const ctx = { cwd: workspace };
  const callId = "call-symbol-alpha";

  const persisted = [
    buildHermesReadToolCall({
      toolCallId: callId,
      path: "module.ts",
      scope: "symbol",
      selector: "alpha",
    }),
    buildToolResultMessage({ toolCallId: callId, content: TS_ALPHA_OBSERVED }),
    { role: "user", content: "refresh alpha only" },
  ];

  await adapter.onTurnComplete(structuredClone(persisted), ctx);
  const selectResult = await adapter.onSelectContext(structuredClone(persisted), ctx, {
    budgetChars: 16_000,
  });

  assert.ok(selectResult?.applied);
  const projectionText = selectResult.projectionText ?? "";
  assert.match(projectionText, /return 99/u);
  assert.doesNotMatch(projectionText, /return 1;/u);
  assert.doesNotMatch(projectionText, new RegExp(TS_BETA_MARKER, "u"));
});

test("Hermes replay fails closed on symbol refresh when the semanticEngine is missing", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0112-hermes-missing-"));
  await writeFile(join(workspace, "module.ts"), TS_DUAL_UPDATED);

  const stateFile = await createHermesStateFile("freshctx-pcr-0112-hermes-missing-state-");
  const adapter = createHermesAdapter({
    stateFile,
    budgetChars: 16_000,
    semanticEngineRunner: missingIsolatedSemanticEngineRunner(),
  });
  const ctx = { cwd: workspace };
  const callId = "call-symbol-alpha";

  const persisted = [
    buildHermesReadToolCall({
      toolCallId: callId,
      path: "module.ts",
      scope: "symbol",
      selector: "alpha",
    }),
    buildToolResultMessage({ toolCallId: callId, content: TS_ALPHA_OBSERVED }),
    { role: "user", content: "refresh alpha only" },
  ];

  await adapter.onTurnComplete(structuredClone(persisted), ctx);
  const selectResult = await adapter.onSelectContext(structuredClone(persisted), ctx, {
    budgetChars: 16_000,
  });

  const projectionText = selectResult?.projectionText ?? "";
  assert.doesNotMatch(projectionText, /return 99/u);
});

test("adapter engine factory fails closed when semanticEngine is missing", async () => {
  const engine = createAdapterEngine({ semanticEngineRunner: missingIsolatedSemanticEngineRunner() });
  engine.trackRead({
    path: "sample.py",
    content: PYTHON_ALPHA_OBSERVED,
    scope: "symbol",
    selector: "alpha",
    startLine: 1,
    endLine: 2,
  });
  await engine.refresh({ "sample.py": "def alpha():\n    return 42\n" });
  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "isolated-semantic-engine-error");
});
