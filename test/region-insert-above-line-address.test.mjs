import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  captureProviderRequest,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import { FreshCtxEngine } from "../src/index.mjs";

const REGION_PATH = "ws/region_b.txt";
const OLD_INTERIOR = "BETA_OLD_INTERIOR keep this line unique";
const NEW_INTERIOR = "BETA_NEW_INTERIOR keep this line unique";
const INSERTED_LINE = "INSERT_ABOVE_MARKER new top line";

function threeLineFile(interiorLine) {
  return `line1 header\n${interiorLine}\nline3 footer\n`;
}

function fileAfterInsertAbove(interiorLine) {
  return `${INSERTED_LINE}\nline1 header\n${interiorLine}\nline3 footer\n`;
}

async function makeInsertAboveWorkspace(interiorLine) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-insert-above-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, "ws", "region_b.txt"), fileAfterInsertAbove(interiorLine), {
    encoding: "utf8",
  });
  return workspace;
}

test("Hermes region single-line insert-above serves relocated interior via exact match", async () => {
  const workspace = await makeInsertAboveWorkspace(OLD_INTERIOR);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-insert-above",
      path: REGION_PATH,
      scope: "region",
      startLine: 2,
      endLine: 2,
      selector: OLD_INTERIOR,
    }),
    buildToolResultMessage({ toolCallId: "call-insert-above", content: OLD_INTERIOR }),
    { role: "user", content: "quote the interior marker" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.match(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /INSERT_ABOVE_MARKER/u);
  assert.doesNotMatch(capture.payloadText, /line1 header/u);
  assert.match(capture.payloadText, /resolution="exact"/u);
  assert.match(capture.payloadText, /lines="3-3"/u);
  assert.equal(capture.adapterApplied, true);
});

test("core region insert-above serves relocated interior via exact match", async () => {
  const workspace = await makeInsertAboveWorkspace(OLD_INTERIOR);
  const engine = new FreshCtxEngine();

  engine.trackRead({
    path: REGION_PATH,
    content: OLD_INTERIOR,
    scope: "region",
    startLine: 2,
    endLine: 2,
    selector: OLD_INTERIOR,
  });

  const { readFile } = await import("node:fs/promises");
  await engine.refresh(async (filePath) =>
    readFile(join(workspace, filePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const projection = engine.project({ budgetChars: 8_000 });
  const unit = engine.registry.list()[0];

  assert.equal(unit.content, OLD_INTERIOR);
  assert.equal(unit.startLine, 3);
  assert.equal(unit.endLine, 3);
  assert.equal(unit.resolutionMethod, "exact");
  assert.match(projection.text, /BETA_OLD_INTERIOR/u);
  assert.match(projection.text, /resolution="exact"/u);
  assert.match(projection.text, /lines="3-3"/u);
});

test("core region insert-above with interior replace serves stored line-address bytes when door misses", async () => {
  const workspace = await makeInsertAboveWorkspace(NEW_INTERIOR);
  const engine = new FreshCtxEngine();

  engine.trackRead({
    path: REGION_PATH,
    content: OLD_INTERIOR,
    scope: "region",
    startLine: 2,
    endLine: 2,
    selector: OLD_INTERIOR,
  });

  const { readFile } = await import("node:fs/promises");
  await engine.refresh(async (filePath) =>
    readFile(join(workspace, filePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const projection = engine.project({ budgetChars: 8_000 });
  const unit = engine.registry.list()[0];

  assert.equal(unit.content, "line1 header");
  assert.equal(unit.startLine, 2);
  assert.equal(unit.endLine, 2);
  assert.equal(unit.resolutionMethod, "stored-line-span");
  assert.match(projection.text, /line1 header/u);
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /BETA_NEW_INTERIOR/u);
  assert.match(projection.text, /resolution="stored-line-span"/u);
  assert.match(projection.text, /lines="2-2"/u);
});

test("Hermes region insert-above with interior replace serves stored line-address bytes when door misses", async () => {
  const workspace = await makeInsertAboveWorkspace(NEW_INTERIOR);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-insert-above-replace",
      path: REGION_PATH,
      scope: "region",
      startLine: 2,
      endLine: 2,
      selector: OLD_INTERIOR,
    }),
    buildToolResultMessage({ toolCallId: "call-insert-above-replace", content: OLD_INTERIOR }),
    { role: "user", content: "quote the interior marker" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.match(capture.payloadText, /line1 header/u);
  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.match(capture.payloadText, /resolution="stored-line-span"/u);
  assert.match(capture.payloadText, /lines="2-2"/u);
  assert.equal(capture.adapterApplied, true);
});
