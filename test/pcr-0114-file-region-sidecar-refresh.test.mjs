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
import { missingSidecarRunner } from "../sidecar/treesitter/client.mjs";
import { parseSource } from "../sidecar/treesitter/parse.mjs";

const TS_OBSERVED = "export function alpha() {\n  return 1;\n}\n";
const TS_UPDATED = "export function alpha() {\n  return 99;\n}\n";

const PY_OBSERVED = "def alpha():\n    return 1\n";
const PY_UPDATED = "def alpha():\n    return 11\n";

test("Pi replay file-scope TypeScript refresh uses injected sidecar without symbol args", async () => {
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
  assert.equal(unit.resolutionMethod, "sidecar");
  assert.match(unit.content, /return 99/u);
  assert.doesNotMatch(messageText(result.messages), /return 1;/u);
});

test("same Pi file-scope TypeScript refresh stays whole-file when sidecarRunner is null", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0114-pi-ts-null-"));
  await writeFile(join(workspace, "module.ts"), TS_UPDATED);

  const adapter = createPiAdapter({ budgetChars: 8_000, sidecarRunner: null });
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

test("injected sidecar resolves Python region reads that match a tree-sitter unit span", async () => {
  const parsed = await parseSource({ path: "sample.py", bytes: PY_OBSERVED });
  assert.equal(parsed.error, null);
  const alpha = parsed.units.find((unit) => unit.selector === "alpha");
  assert.ok(alpha);

  const engine = createAdapterEngine();
  engine.trackRead({
    path: "sample.py",
    content: PY_OBSERVED,
    scope: "region",
    startLine: alpha.startLine,
    endLine: alpha.endLine,
  });
  await engine.refresh({ "sample.py": PY_UPDATED });

  const unit = engine.registry.list()[0];
  assert.equal(unit.scope, "region");
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "sidecar");
  assert.match(unit.content, /return 11/u);
  assert.doesNotMatch(unit.content, /return 1\n/u);
});

test("file-scope TypeScript refresh fails closed when the injected sidecar is missing", async () => {
  const engine = createAdapterEngine({ sidecarRunner: missingSidecarRunner() });
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
  assert.equal(unit.resolutionMethod, "sidecar-error");
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
  assert.equal(unit.resolutionMethod, "sidecar-unresolved");
});
