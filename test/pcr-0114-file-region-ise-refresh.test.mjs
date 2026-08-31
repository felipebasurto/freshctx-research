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
} from "../adapters/pi/replay.mjs";
import { missingIsolatedSemanticEngineRunner } from "../ise/treesitter/client.mjs";
import { parseSource } from "../ise/treesitter/parse.mjs";

const TS_OBSERVED = "export function alpha() {\n  return 1;\n}\n";
const TS_UPDATED = "export function alpha() {\n  return 99;\n}\n";

const PY_ALPHA_OBSERVED = "def alpha():\n    return 1\n";
const PY_ALPHA_UPDATED = "def alpha():\n    return 11\n";

const PY_DUAL_INITIAL =
  "def alpha():\n    return 1\n\ndef beta():\n    return 2\n";
const PY_RELOCATED =
  "def beta():\n    return 22\n\ndef alpha():\n    return 11\n";

test("Pi replay file-scope TypeScript refresh uses injected semanticEngine without symbol args", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0114-pi-ts-file-"));
  await writeFile(join(workspace, "module.ts"), TS_UPDATED);

  const adapter = createPiAdapter({ budgetChars: 8_000 });
  const ctx = { cwd: workspace };
  const callId = "call-file-ts";

  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: callId,
      input: { path: "module.ts" },
      content: [{ type: "text", text: TS_OBSERVED }],
      isError: false,
    },
    ctx,
  );

  const messages = [
    buildReadToolCall({ toolCallId: callId, path: "module.ts" }),
    buildToolResultMessage({ toolCallId: callId, content: TS_OBSERVED }),
    { role: "user", content: "refresh module.ts" },
  ];

  const result = await adapter.onContext({ messages, budgetChars: 8_000 }, ctx);
  assert.ok(result);

  const unit = adapter.engine.registry.list()[0];
  assert.equal(unit.scope, "file");
  assert.equal(unit.selector, null);
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "isolated-semantic-engine");
  assert.match(unit.content, /return 99/u);
  assert.doesNotMatch(messageText(result.messages), /return 1;/u);
});

test("same Pi file-scope TypeScript refresh stays whole-file when semanticEngineRunner is null", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0114-pi-ts-null-"));
  await writeFile(join(workspace, "module.ts"), TS_UPDATED);

  const adapter = createPiAdapter({ budgetChars: 8_000, semanticEngineRunner: null });
  const ctx = { cwd: workspace };
  const callId = "call-file-ts-null";

  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: callId,
      input: { path: "module.ts" },
      content: [{ type: "text", text: TS_OBSERVED }],
      isError: false,
    },
    ctx,
  );

  const messages = [
    buildReadToolCall({ toolCallId: callId, path: "module.ts" }),
    buildToolResultMessage({ toolCallId: callId, content: TS_OBSERVED }),
    { role: "user", content: "refresh module.ts" },
  ];

  const result = await adapter.onContext({ messages, budgetChars: 8_000 }, ctx);
  assert.ok(result);

  const unit = adapter.engine.registry.list()[0];
  assert.equal(unit.scope, "file");
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "whole-file");
  assert.match(unit.content, /return 99/u);
});

test("injected semanticEngine resolves Python region reads by selector and relocates the named unit", async () => {
  const parsed = await parseSource({ path: "sample.py", bytes: PY_ALPHA_OBSERVED });
  assert.equal(parsed.error, null);
  const alpha = parsed.units.find((unit) => unit.selector === "alpha");
  assert.ok(alpha);

  const engine = createAdapterEngine();
  engine.trackRead({
    path: "sample.py",
    content: PY_ALPHA_OBSERVED,
    scope: "region",
    selector: "alpha",
    startLine: alpha.startLine,
    endLine: alpha.endLine,
  });
  await engine.refresh({ "sample.py": PY_ALPHA_UPDATED });

  const unit = engine.registry.list()[0];
  assert.equal(unit.scope, "region");
  assert.equal(unit.selector, "alpha");
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "isolated-semantic-engine");
  assert.match(unit.content, /return 11/u);
  assert.doesNotMatch(unit.content, /return 1\n/u);
});

test("region semanticEngine follows selector when a different unit occupies the old line span", async () => {
  const initial = await parseSource({ path: "sample.py", bytes: PY_DUAL_INITIAL });
  const alpha = initial.units.find((unit) => unit.selector === "alpha");
  assert.ok(alpha);

  const engine = createAdapterEngine();
  engine.trackRead({
    path: "sample.py",
    content: PY_ALPHA_OBSERVED,
    scope: "region",
    selector: "alpha",
    startLine: alpha.startLine,
    endLine: alpha.endLine,
  });

  const relocated = await parseSource({ path: "sample.py", bytes: PY_RELOCATED });
  const betaAtOldSpan = relocated.units.find(
    (unit) => unit.selector === "beta" && unit.startLine === alpha.startLine,
  );
  const alphaMoved = relocated.units.find((unit) => unit.selector === "alpha");
  assert.ok(betaAtOldSpan);
  assert.ok(alphaMoved);
  assert.notEqual(alphaMoved.startLine, alpha.startLine);

  await engine.refresh({ "sample.py": PY_RELOCATED });
  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "isolated-semantic-engine");
  assert.equal(unit.startLine, alphaMoved.startLine);
  assert.equal(unit.endLine, alphaMoved.endLine);
  assert.match(unit.content, /return 11/u);
  assert.doesNotMatch(unit.content, /return 22/u);
});

test("file-scope TypeScript refresh fails closed when the injected semanticEngine is missing", async () => {
  const engine = createAdapterEngine({ semanticEngineRunner: missingIsolatedSemanticEngineRunner() });
  engine.trackRead({
    path: "module.ts",
    content: TS_OBSERVED,
    scope: "file",
    startLine: 1,
    endLine: 3,
  });
  await engine.refresh({ "module.ts": TS_UPDATED });
  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "isolated-semantic-engine-error");
});

test("file-scope Python refresh fails closed on parse-broken syntax", async () => {
  const engine = createAdapterEngine();
  engine.trackRead({
    path: "broken.py",
    content: "def alpha():\n    return 1\n",
    scope: "file",
  });
  await engine.refresh({ "broken.py": "def alpha(\n" });
  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "isolated-semantic-engine-unresolved");
});

test("region refresh fails closed on parse-broken and does not use stored-line-span", async () => {
  const broken = "def alpha(\n    return 1\n";
  const track = {
    path: "sample.py",
    content: "    return 1",
    scope: "region",
    selector: "alpha",
    startLine: 2,
    endLine: 2,
    observedFileLineCount: 2,
  };

  const withIsolatedSemanticEngine = createAdapterEngine();
  withIsolatedSemanticEngine.trackRead(track);
  await withIsolatedSemanticEngine.refresh({ "sample.py": broken });
  const blocked = withIsolatedSemanticEngine.registry.list()[0];
  assert.equal(blocked.state, "unresolved");
  assert.equal(blocked.resolutionMethod, "isolated-semantic-engine-unresolved");

  const withoutIsolatedSemanticEngine = createAdapterEngine({ semanticEngineRunner: null });
  withoutIsolatedSemanticEngine.trackRead(track);
  await withoutIsolatedSemanticEngine.refresh({ "sample.py": broken });
  const legacy = withoutIsolatedSemanticEngine.registry.list()[0];
  assert.equal(legacy.state, "resolved");
  assert.notEqual(legacy.resolutionMethod, "isolated-semantic-engine-unresolved");
});
