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

function threeLineFile(interiorLine) {
  return `line1 header\n${interiorLine}\nline3 footer\n`;
}

async function writeWorkspace(relativePath, content) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0064-"));
  const dir = join(workspace, relativePath.split("/").slice(0, -1).join("/"));
  if (dir !== workspace) await mkdir(dir, { recursive: true });
  await writeFile(join(workspace, relativePath), content, { encoding: "utf8" });
  return workspace;
}

test("readScopeFromHermesArgs promotes blown default pagination to file-scope", () => {
  const fileLineCount = 4;
  assert.deepEqual(readScopeFromHermesArgs({ offset: 1, limit: 2000 }, fileLineCount), {
    scope: "file",
  });
  assert.deepEqual(readScopeFromHermesArgs({ offset: 2, limit: 2000 }, fileLineCount), {
    scope: "file",
  });
  assert.deepEqual(readScopeFromHermesArgs({ offset: 2, limit: 1 }, fileLineCount), {
    scope: "region",
    startLine: 2,
    endLine: 2,
    selector: undefined,
  });
  assert.deepEqual(readScopeFromHermesArgs({ path: REGION_PATH }, fileLineCount), {
    scope: "file",
  });
});

test("normalizeHermesReadScope leaves in-bounds explicit regions unchanged", () => {
  assert.deepEqual(
    normalizeHermesReadScope({ scope: "region", startLine: 2, endLine: 2 }, 4),
    { scope: "region", startLine: 2, endLine: 2 },
  );
  assert.deepEqual(
    normalizeHermesReadScope({ scope: "region", startLine: 1, endLine: 3 }, 4),
    { scope: "region", startLine: 1, endLine: 3 },
  );
  assert.deepEqual(readScopeFromHermesArgs({ offset: 1, limit: 3 }, 4), {
    scope: "region",
    startLine: 1,
    endLine: 3,
    selector: undefined,
  });
  assert.deepEqual(normalizeHermesReadScope({ scope: "file" }, 4), { scope: "file" });
});

test("Hermes default offset=1 limit=2000 serves NEW after interior replace", async () => {
  const workspace = await writeWorkspace(REGION_PATH, threeLineFile(NEW_INTERIOR));
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

test("Hermes offset=2 limit=2000 serves NEW without stored-line-span neighbor injection", async () => {
  const workspace = await writeWorkspace(REGION_PATH, threeLineFile(NEW_INTERIOR));
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-tail-page",
      path: REGION_PATH,
      offset: 2,
      limit: 2000,
    }),
    buildToolResultMessage({
      toolCallId: "call-tail-page",
      content: `${OLD_INTERIOR}\nline3 footer\n`,
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

test("Hermes control offset=2 limit=1 still maps to region 2-2 stored-line-span NEW", async () => {
  const workspace = await writeWorkspace(REGION_PATH, threeLineFile(NEW_INTERIOR));
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-offset",
      path: REGION_PATH,
      offset: 2,
      limit: 1,
    }),
    buildToolResultMessage({ toolCallId: "call-offset", content: OLD_INTERIOR }),
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

test("Hermes path-only read stays file-scope after interior replace", async () => {
  const workspace = await writeWorkspace(REGION_PATH, threeLineFile(NEW_INTERIOR));
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
