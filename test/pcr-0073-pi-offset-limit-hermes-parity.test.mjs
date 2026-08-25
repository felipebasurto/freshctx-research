import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  captureProviderRequest,
  messageText,
  normalizePiReadScope,
  readScopeFromInput,
  toProviderPayload,
} from "../adapters/pi/replay.mjs";

const REGION_PATH = "ws/region_b.txt";
const HEADER_LINE = "line1 header";
const FOOTER_LINE = "line3 footer";
const OLD_INTERIOR = "BETA_OLD_INTERIOR keep this line unique";
const NEW_INTERIOR = "BETA_NEW_INTERIOR keep this line unique";
const OBSERVED_FILE_LINE_COUNT = 4;
const HERMES_DEFAULT_LIMIT = 2000;
const EXACT_EOF_LIMIT = 4;

function threeLineFile(interiorLine) {
  return `${HEADER_LINE}\n${interiorLine}\n${FOOTER_LINE}\n`;
}

async function writeMutatedWorkspace(interiorLine) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0073-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, REGION_PATH), threeLineFile(interiorLine), {
    encoding: "utf8",
  });
  return workspace;
}

async function capturePiFresh({ workspace, offset, limit, scopeOnly = false, singleLine = false }) {
  const args = scopeOnly
    ? { toolCallId: "call-pi", path: REGION_PATH }
    : {
        toolCallId: "call-pi",
        path: REGION_PATH,
        offset,
        limit,
      };
  const observedContent = scopeOnly || !singleLine ? threeLineFile(OLD_INTERIOR) : OLD_INTERIOR;
  const persisted = [
    buildReadToolCall(args),
    buildToolResultMessage({
      toolCallId: "call-pi",
      content: observedContent,
    }),
    { role: "user", content: "quote the interior marker" },
  ];

  return captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    budgetChars: 8_000,
  });
}

test("readScopeFromInput maps offset=1 limit=2000 to file-scope (0064 hold)", () => {
  assert.deepEqual(readScopeFromInput({ offset: 1, limit: HERMES_DEFAULT_LIMIT }, OBSERVED_FILE_LINE_COUNT), {
    scope: "file",
  });
});

test("readScopeFromInput maps offset=1 limit=4 to file-scope (0069 Rule A)", () => {
  assert.deepEqual(readScopeFromInput({ offset: 1, limit: EXACT_EOF_LIMIT }, OBSERVED_FILE_LINE_COUNT), {
    scope: "file",
  });
});

test("readScopeFromInput maps offset=1 limit=3 to in-bounds region 1-3 (0070 guard)", () => {
  assert.deepEqual(readScopeFromInput({ offset: 1, limit: 3 }, OBSERVED_FILE_LINE_COUNT), {
    scope: "region",
    startLine: 1,
    endLine: 3,
    selector: undefined,
  });
});

test("readScopeFromInput maps offset=2 limit=2 to in-bounds region 2-3 (0070 guard)", () => {
  assert.deepEqual(readScopeFromInput({ offset: 2, limit: 2 }, OBSERVED_FILE_LINE_COUNT), {
    scope: "region",
    startLine: 2,
    endLine: 3,
    selector: undefined,
  });
});

test("readScopeFromInput maps offset=2 limit=1 to region 2-2", () => {
  assert.deepEqual(readScopeFromInput({ offset: 2, limit: 1 }, OBSERVED_FILE_LINE_COUNT), {
    scope: "region",
    startLine: 2,
    endLine: 2,
    selector: undefined,
  });
});

test("readScopeFromInput keeps path-only reads at file scope", () => {
  assert.deepEqual(readScopeFromInput({ path: REGION_PATH }, OBSERVED_FILE_LINE_COUNT), {
    scope: "file",
  });
});

test("normalizePiReadScope applies explicit scope region EOF clamp", () => {
  assert.deepEqual(
    normalizePiReadScope({ scope: "region", startLine: 1, endLine: 4 }, OBSERVED_FILE_LINE_COUNT),
    { scope: "file" },
  );
});

test("Pi offset=1 limit=2000 serves NEW via whole-file after interior replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const capture = await capturePiFresh({ workspace, offset: 1, limit: HERMES_DEFAULT_LIMIT });

  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.match(capture.payloadText, /resolution="whole-file"/u);
});

test("Pi offset=1 limit=4 serves NEW via whole-file after interior replace (0069 analog)", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const capture = await capturePiFresh({ workspace, offset: 1, limit: EXACT_EOF_LIMIT });

  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.match(capture.payloadText, /resolution="whole-file"/u);
});

test("Pi offset=1 limit=3 projects empty after interior line-2 replace (0070 analog)", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const capture = await capturePiFresh({ workspace, offset: 1, limit: 3 });

  assert.match(capture.projectionText, /selected="0"/u);
  assert.match(capture.projectionText, /unresolved="1"/u);
  assert.doesNotMatch(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /line1 header/u);
  assert.doesNotMatch(capture.payloadText, /line3 footer/u);
});

test("Pi offset=2 limit=2 projects empty after interior line-2 replace (0070 analog)", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const capture = await capturePiFresh({ workspace, offset: 2, limit: 2 });

  assert.match(capture.projectionText, /selected="0"/u);
  assert.match(capture.projectionText, /unresolved="1"/u);
  assert.doesNotMatch(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /line3 footer/u);
});

test("Pi offset=2 limit=1 serves NEW via stored-line-span after interior replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const capture = await capturePiFresh({ workspace, offset: 2, limit: 1, singleLine: true });

  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.match(capture.payloadText, /resolution="stored-line-span"/u);
  assert.match(capture.payloadText, /lines="2-2"/u);
});

test("Pi path-only read stays file-scope NEW after interior replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const capture = await capturePiFresh({ workspace, scopeOnly: true });

  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.match(capture.payloadText, /resolution="whole-file"/u);
});

test("Pi native control keeps OLD in persisted tool result after interior replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const persisted = [
    buildReadToolCall({
      toolCallId: "call-native",
      path: REGION_PATH,
      offset: 1,
      limit: EXACT_EOF_LIMIT,
    }),
    buildToolResultMessage({
      toolCallId: "call-native",
      content: threeLineFile(OLD_INTERIOR),
    }),
    { role: "user", content: "quote the interior marker" },
  ];

  const payloadText = messageText(
    toProviderPayload([
      ...structuredClone(persisted),
    ]).messages,
  );

  assert.match(JSON.stringify(persisted), /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(JSON.stringify(persisted), /BETA_NEW_INTERIOR/u);
  assert.match(payloadText, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(payloadText, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(payloadText, /resolution="/u);
});
