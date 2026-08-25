import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  normalizeHermesReadScope,
  readScopeFromHermesArgs,
} from "../adapters/hermes/bridge.mjs";
import {
  buildReadToolCall,
  buildToolResultMessage,
  captureProviderRequest,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";

const REGION_PATH = "ws/region_b.txt";
const OLD_INTERIOR = "BETA_OLD_INTERIOR keep this line unique";
const NEW_INTERIOR = "BETA_NEW_INTERIOR keep this line unique";
const FILE_LINE_COUNT = 4;
const EXACT_EOF_LIMIT = 4;

function threeLineFile(interiorLine) {
  return `line1 header\n${interiorLine}\nline3 footer\n`;
}

async function writeWorkspace(interiorLine) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0069-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, REGION_PATH), threeLineFile(interiorLine), {
    encoding: "utf8",
  });
  return workspace;
}

test("normalizeHermesReadScope promotes exact-EOF region (endLine === fileLineCount)", () => {
  assert.deepEqual(
    normalizeHermesReadScope({ scope: "region", startLine: 1, endLine: 4 }, FILE_LINE_COUNT),
    { scope: "file" },
  );
  assert.deepEqual(
    normalizeHermesReadScope({ scope: "region", startLine: 2, endLine: 4 }, FILE_LINE_COUNT),
    { scope: "file" },
  );
});

test("normalizeHermesReadScope keeps partial EOF region (endLine < fileLineCount)", () => {
  assert.deepEqual(
    normalizeHermesReadScope({ scope: "region", startLine: 1, endLine: 3 }, FILE_LINE_COUNT),
    { scope: "region", startLine: 1, endLine: 3 },
  );
  assert.deepEqual(
    normalizeHermesReadScope({ scope: "region", startLine: 2, endLine: 2 }, FILE_LINE_COUNT),
    { scope: "region", startLine: 2, endLine: 2 },
  );
});

test("normalizeHermesReadScope keeps 0064 past-EOF promotion (endLine > fileLineCount)", () => {
  assert.deepEqual(
    normalizeHermesReadScope({ scope: "region", startLine: 1, endLine: 2000 }, FILE_LINE_COUNT),
    { scope: "file" },
  );
});

test("readScopeFromHermesArgs exact-EOF offset=1 limit=4 promotes to file-scope", () => {
  assert.deepEqual(readScopeFromHermesArgs({ offset: 1, limit: EXACT_EOF_LIMIT }, FILE_LINE_COUNT), {
    scope: "file",
  });
});

test("readScopeFromHermesArgs partial page offset=1 limit=3 stays region 1-3", () => {
  assert.deepEqual(readScopeFromHermesArgs({ offset: 1, limit: 3 }, FILE_LINE_COUNT), {
    scope: "region",
    startLine: 1,
    endLine: 3,
    selector: undefined,
  });
});

test("Hermes exact-EOF offset=1 limit=4 serves NEW via whole-file after interior replace", async () => {
  const workspace = await writeWorkspace(NEW_INTERIOR);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-exact-eof",
      path: REGION_PATH,
      offset: 1,
      limit: EXACT_EOF_LIMIT,
    }),
    buildToolResultMessage({
      toolCallId: "call-exact-eof",
      content: threeLineFile(OLD_INTERIOR),
    }),
    { role: "user", content: "quote the interior marker" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.match(capture.payloadText, /resolution="whole-file"/u);
});

test("control offset=2 limit=1 stays region 2-2 stored-line-span NEW", async () => {
  const workspace = await writeWorkspace(NEW_INTERIOR);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-control",
      path: REGION_PATH,
      offset: 2,
      limit: 1,
    }),
    buildToolResultMessage({ toolCallId: "call-control", content: OLD_INTERIOR }),
    { role: "user", content: "quote the interior marker" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.match(capture.payloadText, /resolution="stored-line-span"/u);
  assert.match(capture.payloadText, /lines="2-2"/u);
});

test("control path-only stays file-scope whole-file NEW", async () => {
  const workspace = await writeWorkspace(NEW_INTERIOR);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-file",
      path: REGION_PATH,
    }),
    buildToolResultMessage({
      toolCallId: "call-file",
      content: threeLineFile(OLD_INTERIOR),
    }),
    { role: "user", content: "quote the interior marker" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.match(capture.payloadText, /resolution="whole-file"/u);
});

test("0064 hold: default offset=1 limit=2000 stays file-scope NEW", async () => {
  const workspace = await writeWorkspace(NEW_INTERIOR);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-default-page",
      path: REGION_PATH,
      offset: 1,
      limit: 2000,
    }),
    buildToolResultMessage({
      toolCallId: "call-default-page",
      content: threeLineFile(OLD_INTERIOR),
    }),
    { role: "user", content: "quote the interior marker" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /resolution="stored-line-span"/u);
});
