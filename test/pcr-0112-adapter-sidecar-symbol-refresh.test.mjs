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
import { missingSidecarRunner } from "../sidecar/treesitter/client.mjs";

const PYTHON_OBSERVED = "def alpha():\n    return 1\n";
const PYTHON_UPDATED = "def alpha():\n    return 42\n";

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

test("Pi replay symbol refresh resolves through the injected sidecar", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0112-pi-"));
  await writeFile(join(workspace, "sample.py"), PYTHON_UPDATED);

  const adapter = createPiAdapter({ budgetChars: 8_000 });
  const ctx = { cwd: workspace };
  const callId = "call-symbol-1";

  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: callId,
      input: { path: "sample.py", scope: "symbol", selector: "alpha" },
      content: [{ type: "text", text: PYTHON_OBSERVED }],
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
    buildToolResultMessage({ toolCallId: callId, content: PYTHON_OBSERVED }),
    { role: "user", content: "refresh alpha" },
  ];

  const result = await adapter.onContext({ messages, budgetChars: 8_000 }, ctx);
  assert.ok(result);

  const unit = adapter.engine.registry.list()[0];
  assert.equal(unit.scope, "symbol");
  assert.equal(unit.selector, "alpha");
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "sidecar");
  assert.match(unit.content, /return 42/u);
  assert.match(messageText(result.messages), /return 42/u);
  assert.doesNotMatch(messageText(result.messages), /return 1/u);
});

test("Hermes replay symbol refresh resolves through the injected sidecar", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0112-hermes-"));
  await writeFile(join(workspace, "module.ts"), "export function main() {\n  return 1;\n}\n");

  const observed = "export function main() {\n  return 1;\n}\n";
  const updated = "export function main() {\n  return 99;\n}\n";
  await writeFile(join(workspace, "module.ts"), updated);

  const stateFile = await createHermesStateFile("freshctx-pcr-0112-hermes-state-");
  const adapter = createHermesAdapter({ stateFile, budgetChars: 8_000 });
  const ctx = { cwd: workspace };
  const callId = "call-symbol-ts";

  const persisted = [
    buildHermesReadToolCall({
      toolCallId: callId,
      path: "module.ts",
      scope: "symbol",
      selector: "main",
    }),
    buildToolResultMessage({ toolCallId: callId, content: observed }),
    { role: "user", content: "refresh main" },
  ];

  await adapter.onTurnComplete(structuredClone(persisted), ctx);
  const selectResult = await adapter.onSelectContext(structuredClone(persisted), ctx, {
    budgetChars: 8_000,
  });

  assert.ok(selectResult?.applied);
  assert.match(selectResult.projectionText ?? "", /return 99/u);
  assert.doesNotMatch(selectResult.projectionText ?? "", /return 1;/u);
});

test("adapter engine factory fails closed when sidecar is missing", async () => {
  const engine = createAdapterEngine({ sidecarRunner: missingSidecarRunner() });
  engine.trackRead({
    path: "sample.py",
    content: PYTHON_OBSERVED,
    scope: "symbol",
    selector: "alpha",
    startLine: 1,
    endLine: 2,
  });
  await engine.refresh({ "sample.py": PYTHON_UPDATED });
  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "sidecar-error");
});
