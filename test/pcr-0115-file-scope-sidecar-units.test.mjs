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

const SIBLING_MARKER = "BETA_SIDEcar_SIBLING";
const PADDING_MARKER = "PADDING_NOT_A_UNIT";

const TS_INITIAL =
  `export function alpha() {\n  return 1;\n}\n\n// ${PADDING_MARKER}\n\nexport function beta() {\n  return ${SIBLING_MARKER};\n}\n`;
const TS_UPDATED =
  `export function alpha() {\n  return 99;\n}\n\n// ${PADDING_MARKER}\n\nexport function beta() {\n  return ${SIBLING_MARKER};\n}\n`;

const PY_INITIAL =
  `def alpha():\n    return 1\n\n# ${PADDING_MARKER}\n\ndef beta():\n    return 2\n`;
const PY_UPDATED =
  `def alpha():\n    return 11\n\n# ${PADDING_MARKER}\n\ndef beta():\n    return 2\n`;

const JS_INITIAL =
  `export function alpha() {\n  return 1;\n}\n\n// ${PADDING_MARKER}\n\nexport function beta() {\n  return 2;\n}\n`;
const JS_UPDATED =
  `export function alpha() {\n  return 22;\n}\n\n// ${PADDING_MARKER}\n\nexport function beta() {\n  return 2;\n}\n`;

async function refreshFileScope({ ext, initial, updated }) {
  const workspace = await mkdtemp(join(tmpdir(), `freshctx-pcr-0115-${ext}-`));
  const filename = `module${ext}`;
  await writeFile(join(workspace, filename), initial);

  const adapter = createPiAdapter({ budgetChars: 16_000 });
  const ctx = { cwd: workspace };
  const callId = `call-file-${ext}`;

  await adapter.onToolResult(
    {
      toolName: "read",
      toolCallId: callId,
      input: { path: filename },
      content: [{ type: "text", text: initial }],
      isError: false,
    },
    ctx,
  );

  await writeFile(join(workspace, filename), updated);

  const messages = [
    buildReadToolCall({ toolCallId: callId, path: filename }),
    buildToolResultMessage({ toolCallId: callId, content: initial }),
    { role: "user", content: `refresh ${filename}` },
  ];

  const result = await adapter.onContext({ messages, budgetChars: 16_000 }, ctx);
  assert.ok(result);
  return { adapter, result, filename };
}

test("file-scope TypeScript sidecar refresh projects changed units and omits padding and unchanged siblings", async () => {
  const { adapter, result } = await refreshFileScope({
    ext: ".ts",
    initial: TS_INITIAL,
    updated: TS_UPDATED,
  });

  const unit = adapter.engine.registry.list()[0];
  assert.equal(unit.scope, "file");
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "sidecar");
  assert.match(unit.content, /return 99/u);
  assert.doesNotMatch(unit.content, new RegExp(PADDING_MARKER, "u"));
  assert.doesNotMatch(unit.content, new RegExp(SIBLING_MARKER, "u"));
  assert.doesNotMatch(messageText(result.messages), new RegExp(SIBLING_MARKER, "u"));
});

test("file-scope Python sidecar refresh projects changed units without sibling padding bytes", async () => {
  const { adapter } = await refreshFileScope({
    ext: ".py",
    initial: PY_INITIAL,
    updated: PY_UPDATED,
  });

  const unit = adapter.engine.registry.list()[0];
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "sidecar");
  assert.match(unit.content, /return 11/u);
  assert.doesNotMatch(unit.content, new RegExp(PADDING_MARKER, "u"));
  assert.doesNotMatch(unit.content, /def beta\(\):/u);
});

test("file-scope JavaScript sidecar refresh projects changed units without sibling padding bytes", async () => {
  const { adapter } = await refreshFileScope({
    ext: ".js",
    initial: JS_INITIAL,
    updated: JS_UPDATED,
  });

  const unit = adapter.engine.registry.list()[0];
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "sidecar");
  assert.match(unit.content, /return 22/u);
  assert.doesNotMatch(unit.content, new RegExp(PADDING_MARKER, "u"));
  assert.doesNotMatch(unit.content, /function beta\(\)/u);
});

test("file-scope sidecar still fails closed when runner is missing", async () => {
  const engine = createAdapterEngine({ sidecarRunner: missingSidecarRunner() });
  engine.trackRead({
    path: "module.ts",
    content: TS_INITIAL,
    scope: "file",
  });
  await engine.refresh({ "module.ts": TS_UPDATED });
  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "sidecar-error");
});

test("file-scope sidecar still fails closed on parse-broken syntax", async () => {
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
