import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readScopeFromHermesArgs } from "../adapters/hermes/bridge.mjs";
import {
  buildReadToolCall,
  buildToolResultMessage,
  captureProviderRequest,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";

const REGION_PATH = "ws/region_b.txt";
const OLD_INTERIOR = "BETA_OLD_INTERIOR keep this line unique";
const NEW_INTERIOR = "BETA_NEW_INTERIOR keep this line unique";
const HERMES_DEFAULT_LIMIT = 2000;

function threeLineFile(interiorLine) {
  return `line1 header\n${interiorLine}\nline3 footer\n`;
}

async function writeWorkspace(relativePath, content) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0063-"));
  const dir = join(workspace, relativePath.split("/").slice(0, -1).join("/"));
  if (dir !== workspace) await mkdir(dir, { recursive: true });
  await writeFile(join(workspace, relativePath), content, { encoding: "utf8" });
  return workspace;
}

test("readScopeFromHermesArgs maps Hermes default page offset=1 limit=2000 to region 1-2000", () => {
  const scope = readScopeFromHermesArgs({ offset: 1, limit: HERMES_DEFAULT_LIMIT });
  assert.equal(scope.scope, "region");
  assert.equal(scope.startLine, 1);
  assert.equal(scope.endLine, 2000);
});

test("readScopeFromHermesArgs maps offset=2 limit=2000 to past-EOF region 2-2001", () => {
  const scope = readScopeFromHermesArgs({ offset: 2, limit: HERMES_DEFAULT_LIMIT });
  assert.equal(scope.scope, "region");
  assert.equal(scope.startLine, 2);
  assert.equal(scope.endLine, 2001);
});

test("readScopeFromHermesArgs maps offset=2 limit=1 to single-line region 2-2 (0059 hold)", () => {
  const scope = readScopeFromHermesArgs({ offset: 2, limit: 1 });
  assert.equal(scope.scope, "region");
  assert.equal(scope.startLine, 2);
  assert.equal(scope.endLine, 2);
});

test("readScopeFromHermesArgs keeps path-only reads at file scope", () => {
  const scope = readScopeFromHermesArgs({ path: REGION_PATH });
  assert.equal(scope.scope, "file");
  assert.equal(scope.startLine, undefined);
  assert.equal(scope.endLine, undefined);
});

test("Hermes default page offset=1 limit=2000 discovered as region 1-2000", async () => {
  const { discoveredCalls } = await import("../adapters/hermes/bridge.mjs");
  const messages = [
    buildReadToolCall({
      toolCallId: "call-default-page",
      path: REGION_PATH,
      offset: 1,
      limit: HERMES_DEFAULT_LIMIT,
    }),
    buildToolResultMessage({
      toolCallId: "call-default-page",
      content: threeLineFile(OLD_INTERIOR),
    }),
  ];
  const calls = discoveredCalls(messages);
  assert.equal(calls["call-default-page"].scope, "region");
  assert.equal(calls["call-default-page"].startLine, 1);
  assert.equal(calls["call-default-page"].endLine, 2000);
});

test("blown default-page region 1-2000 stays unresolved after interior line-2 replace", async () => {
  const workspace = await writeWorkspace(REGION_PATH, threeLineFile(NEW_INTERIOR));
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-default-page",
      path: REGION_PATH,
      offset: 1,
      limit: HERMES_DEFAULT_LIMIT,
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

  assert.match(capture.projectionText, /selected="0"/u);
  assert.match(capture.projectionText, /unresolved="1"/u);
  assert.doesNotMatch(capture.projectionText, /<freshctx-unit/u);
  assert.doesNotMatch(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /line1 header/u);
  assert.doesNotMatch(capture.payloadText, /line3 footer/u);
  assert.doesNotMatch(capture.payloadText, /stored-line-span/u);
});

test("control offset=2 limit=1 serves NEW via stored-line-span after interior replace", async () => {
  const workspace = await writeWorkspace(REGION_PATH, threeLineFile(NEW_INTERIOR));
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
