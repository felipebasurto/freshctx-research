import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  discoveredCalls,
  normalizeHermesReadScope,
  readScopeFromHermesArgs,
} from "../adapters/hermes/bridge.mjs";
import {
  buildReadToolCall,
  buildToolResultMessage,
  captureProviderRequest,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import { FreshCtxEngine } from "../src/index.mjs";

const REGION_PATH = "ws/region_b.txt";
const HEADER_LINE = "line1 header";
const FOOTER_LINE = "line3 footer";
const OLD_INTERIOR = "BETA_OLD_INTERIOR keep this line unique";
const NEW_INTERIOR = "BETA_NEW_INTERIOR keep this line unique";
const OBSERVED_FILE_LINE_COUNT = 4;
const HERMES_DEFAULT_LIMIT = 2000;
const STORED_OBSERVE_BYTES = 66;
const STORED_INTERIOR_BYTES = 39;

function threeLineFile(interiorLine) {
  return `${HEADER_LINE}\n${interiorLine}\n${FOOTER_LINE}\n`;
}

function splitLines(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n");
}

async function writeMutatedWorkspace(interiorLine) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0070-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, REGION_PATH), threeLineFile(interiorLine), {
    encoding: "utf8",
  });
  return workspace;
}

test("readScopeFromHermesArgs maps offset=1 limit=3 to in-bounds region 1-3 (no file promotion)", () => {
  const scope = readScopeFromHermesArgs({ offset: 1, limit: 3 }, OBSERVED_FILE_LINE_COUNT);
  assert.equal(scope.scope, "region");
  assert.equal(scope.startLine, 1);
  assert.equal(scope.endLine, 3);
});

test("readScopeFromHermesArgs maps offset=2 limit=2 to in-bounds region 2-3 (no file promotion)", () => {
  const scope = readScopeFromHermesArgs({ offset: 2, limit: 2 }, OBSERVED_FILE_LINE_COUNT);
  assert.equal(scope.scope, "region");
  assert.equal(scope.startLine, 2);
  assert.equal(scope.endLine, 3);
});

test("normalizeHermesReadScope does not promote in-bounds non-whole-file pages", () => {
  assert.deepEqual(
    normalizeHermesReadScope({ scope: "region", startLine: 1, endLine: 3 }, OBSERVED_FILE_LINE_COUNT),
    { scope: "region", startLine: 1, endLine: 3 },
  );
  assert.deepEqual(
    normalizeHermesReadScope({ scope: "region", startLine: 2, endLine: 3 }, OBSERVED_FILE_LINE_COUNT),
    { scope: "region", startLine: 2, endLine: 3 },
  );
});

test("readScopeFromHermesArgs keeps 0064 hold: default offset=1 limit=2000 promotes to file-scope", () => {
  const scope = readScopeFromHermesArgs(
    { offset: 1, limit: HERMES_DEFAULT_LIMIT },
    OBSERVED_FILE_LINE_COUNT,
  );
  assert.equal(scope.scope, "file");
});

test("readScopeFromHermesArgs keeps control offset=2 limit=1 at region 2-2", () => {
  const scope = readScopeFromHermesArgs({ offset: 2, limit: 1 }, OBSERVED_FILE_LINE_COUNT);
  assert.equal(scope.scope, "region");
  assert.equal(scope.startLine, 2);
  assert.equal(scope.endLine, 2);
});

test("readScopeFromHermesArgs keeps path-only reads at file scope", () => {
  const scope = readScopeFromHermesArgs({ path: REGION_PATH }, OBSERVED_FILE_LINE_COUNT);
  assert.equal(scope.scope, "file");
});

test("Hermes offset=1 limit=3 discovered as region 1-3 (not promoted)", async () => {
  const calls = discoveredCalls([
    buildReadToolCall({
      toolCallId: "call-region-1-3",
      path: REGION_PATH,
      offset: 1,
      limit: 3,
    }),
    buildToolResultMessage({
      toolCallId: "call-region-1-3",
      content: threeLineFile(OLD_INTERIOR),
    }),
  ]);
  assert.equal(calls["call-region-1-3"].scope, "region");
  assert.equal(calls["call-region-1-3"].startLine, 1);
  assert.equal(calls["call-region-1-3"].endLine, 3);
});

test("Hermes offset=2 limit=2 discovered as region 2-3 (not promoted)", async () => {
  const calls = discoveredCalls([
    buildReadToolCall({
      toolCallId: "call-region-2-3",
      path: REGION_PATH,
      offset: 2,
      limit: 2,
    }),
    buildToolResultMessage({
      toolCallId: "call-region-2-3",
      content: threeLineFile(OLD_INTERIOR),
    }),
  ]);
  assert.equal(calls["call-region-2-3"].scope, "region");
  assert.equal(calls["call-region-2-3"].startLine, 2);
  assert.equal(calls["call-region-2-3"].endLine, 3);
});

test("core in-bounds region 1-3 fail-closes after interior line-2 replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const observedContent = threeLineFile(OLD_INTERIOR);
  const engine = new FreshCtxEngine();

  engine.trackRead({
    path: REGION_PATH,
    content: observedContent,
    scope: "region",
    startLine: 1,
    endLine: 3,
    observedFileLineCount: OBSERVED_FILE_LINE_COUNT,
  });

  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const unit = engine.registry.list()[0];
  const projection = engine.project({ budgetChars: 8_000 });
  const lines = splitLines(observedContent);

  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "displaced-shrunk-boundary-anchors");
  assert.equal(unit.startLine, 1);
  assert.equal(unit.endLine, 3);
  assert.equal(unit.observedFileLineCount, OBSERVED_FILE_LINE_COUNT);
  assert.equal(lines[0], HEADER_LINE);
  assert.equal(lines[1], OLD_INTERIOR);
  assert.equal(lines[2], FOOTER_LINE);
  assert.equal(Buffer.byteLength(unit.content, "utf8"), STORED_OBSERVE_BYTES);
  assert.equal(Buffer.byteLength(lines[1], "utf8"), STORED_INTERIOR_BYTES);
  assert.match(projection.text, /selected="0"/u);
  assert.match(projection.text, /unresolved="1"/u);
  assert.doesNotMatch(projection.text, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /resolution="/u);
});

test("core in-bounds region 2-3 fail-closes after interior line-2 replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const observedContent = threeLineFile(OLD_INTERIOR);
  const engine = new FreshCtxEngine();

  engine.trackRead({
    path: REGION_PATH,
    content: observedContent,
    scope: "region",
    startLine: 2,
    endLine: 3,
    observedFileLineCount: OBSERVED_FILE_LINE_COUNT,
  });

  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const unit = engine.registry.list()[0];
  const projection = engine.project({ budgetChars: 8_000 });
  const lines = splitLines(observedContent);

  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "displaced-shrunk-boundary-anchors");
  assert.equal(unit.startLine, 2);
  assert.equal(unit.endLine, 3);
  assert.equal(unit.observedFileLineCount, OBSERVED_FILE_LINE_COUNT);
  assert.equal(lines[1], OLD_INTERIOR);
  assert.equal(lines[2], FOOTER_LINE);
  assert.equal(Buffer.byteLength(unit.content, "utf8"), STORED_OBSERVE_BYTES);
  assert.equal(Buffer.byteLength(lines[1], "utf8"), STORED_INTERIOR_BYTES);
  assert.match(projection.text, /selected="0"/u);
  assert.match(projection.text, /unresolved="1"/u);
  assert.doesNotMatch(projection.text, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /resolution="/u);
});

test("Hermes offset=1 limit=3 projects empty after interior line-2 replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-region-1-3",
      path: REGION_PATH,
      offset: 1,
      limit: 3,
    }),
    buildToolResultMessage({
      toolCallId: "call-region-1-3",
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
  assert.doesNotMatch(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /line1 header/u);
  assert.doesNotMatch(capture.payloadText, /line3 footer/u);
  assert.doesNotMatch(capture.payloadText, /resolution="/u);
});

test("Hermes offset=2 limit=2 projects empty after interior line-2 replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-region-2-3",
      path: REGION_PATH,
      offset: 2,
      limit: 2,
    }),
    buildToolResultMessage({
      toolCallId: "call-region-2-3",
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
  assert.doesNotMatch(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /line3 footer/u);
  assert.doesNotMatch(capture.payloadText, /resolution="/u);
});

test("control offset=2 limit=1 serves NEW via stored-line-span after interior replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
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

test("control path-only read stays file-scope after interior replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
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

test("0064 hold: default offset=1 limit=2000 serves NEW via file-scope after interior replace", async () => {
  const workspace = await writeMutatedWorkspace(NEW_INTERIOR);
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

  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(capture.payloadText, /resolution="stored-line-span"/u);
});
