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
import { revisionFor } from "../src/hash.mjs";

const REGION_PATH = "ws/region_ml.txt";
const OLD_START = "GAMMA_OLD_START keep unique";
const OLD_MIDDLE = "GAMMA_OLD_MIDDLE keep unique";
const OLD_END = "GAMMA_OLD_END keep unique";
const NEW_MIDDLE = "GAMMA_NEW_MIDDLE keep unique";

const OLD_REGION = `${OLD_START}\n${OLD_MIDDLE}\n${OLD_END}`;

function fiveLineFile(middleLine) {
  return `line1 header\n${OLD_START}\n${middleLine}\n${OLD_END}\nline5 footer\n`;
}

async function makeMultiLineWorkspace(middleLine) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-ml-interior-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, "ws", "region_ml.txt"), fiveLineFile(middleLine), {
    encoding: "utf8",
  });
  return workspace;
}

test("Hermes multi-line region middle-only edit relocates via boundary-anchors", async () => {
  const workspace = await makeMultiLineWorkspace(NEW_MIDDLE);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-ml-middle",
      path: REGION_PATH,
      scope: "region",
      startLine: 2,
      endLine: 4,
      selector: OLD_REGION,
    }),
    buildToolResultMessage({ toolCallId: "call-ml-middle", content: OLD_REGION }),
    { role: "user", content: "quote the interior marker" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.doesNotMatch(capture.payloadText, /GAMMA_OLD_MIDDLE/u);
  assert.match(capture.payloadText, /GAMMA_NEW_MIDDLE/u);
  assert.match(capture.payloadText, /GAMMA_OLD_START keep unique/u);
  assert.match(capture.payloadText, /GAMMA_OLD_END keep unique/u);
  assert.match(capture.payloadText, /resolution="boundary-anchors"/u);
  assert.doesNotMatch(capture.payloadText, /resolution="stored-line-span"/u);
  assert.equal(capture.adapterApplied, true);
});

test("core multi-line region middle-only edit relocates via boundary-anchors", async () => {
  const workspace = await makeMultiLineWorkspace(NEW_MIDDLE);
  const engine = new FreshCtxEngine();

  engine.trackRead({
    path: REGION_PATH,
    content: OLD_REGION,
    scope: "region",
    startLine: 2,
    endLine: 4,
    selector: OLD_REGION,
  });

  const { readFile } = await import("node:fs/promises");
  await engine.refresh(async (filePath) =>
    readFile(join(workspace, filePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const projection = engine.project({ budgetChars: 8_000 });
  const unit = engine.registry.list()[0];

  assert.doesNotMatch(projection.text, /GAMMA_OLD_MIDDLE/u);
  assert.match(projection.text, /GAMMA_NEW_MIDDLE/u);
  assert.match(projection.text, /resolution="boundary-anchors"/u);
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "boundary-anchors");
  assert.equal(unit.startLine, 2);
  assert.equal(unit.endLine, 4);
  assert.equal(
    unit.revision,
    revisionFor(`${OLD_START}\n${NEW_MIDDLE}\n${OLD_END}`),
  );
});

test("Hermes multi-line region first-and-last replace stays unresolved", async () => {
  const workspace = await makeMultiLineWorkspace(OLD_MIDDLE);
  const stateFile = await createHermesStateFile();
  const mutatedDisk = "line1 header\nNEW_START\nGAMMA_OLD_MIDDLE keep unique\nNEW_END\nline5 footer\n";

  const { writeFile: writeFileDirect } = await import("node:fs/promises");
  await writeFileDirect(join(workspace, "ws", "region_ml.txt"), mutatedDisk, { encoding: "utf8" });

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-ml-boundary",
      path: REGION_PATH,
      scope: "region",
      startLine: 2,
      endLine: 4,
      selector: OLD_REGION,
    }),
    buildToolResultMessage({ toolCallId: "call-ml-boundary", content: OLD_REGION }),
    { role: "user", content: "quote the interior marker" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.doesNotMatch(capture.payloadText, /GAMMA_OLD_START/u);
  assert.doesNotMatch(capture.payloadText, /GAMMA_OLD_MIDDLE/u);
  assert.doesNotMatch(capture.payloadText, /GAMMA_OLD_END/u);
  assert.doesNotMatch(capture.payloadText, /GAMMA_NEW_MIDDLE/u);
  assert.doesNotMatch(capture.payloadText, /resolution="/u);
});

test("core multi-line region first-and-last replace stays unresolved", async () => {
  const workspace = await makeMultiLineWorkspace(OLD_MIDDLE);
  const engine = new FreshCtxEngine();
  const mutatedDisk = "line1 header\nNEW_START\nGAMMA_OLD_MIDDLE keep unique\nNEW_END\nline5 footer\n";

  const { writeFile: writeFileDirect } = await import("node:fs/promises");
  await writeFileDirect(join(workspace, "ws", "region_ml.txt"), mutatedDisk, { encoding: "utf8" });

  engine.trackRead({
    path: REGION_PATH,
    content: OLD_REGION,
    scope: "region",
    startLine: 2,
    endLine: 4,
    selector: OLD_REGION,
  });

  const { readFile } = await import("node:fs/promises");
  await engine.refresh(async (filePath) =>
    readFile(join(workspace, filePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const projection = engine.project({ budgetChars: 8_000 });
  const unit = engine.registry.list()[0];

  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "anchors-not-found");
  assert.doesNotMatch(projection.text, /GAMMA_OLD_START/u);
  assert.doesNotMatch(projection.text, /GAMMA_OLD_MIDDLE/u);
  assert.doesNotMatch(projection.text, /GAMMA_OLD_END/u);
});
