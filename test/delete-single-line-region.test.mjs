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
const LINE1 = "line1 header";
const LINE3 = "line3 footer";

function threeLineFile(interiorLine) {
  return `${LINE1}\n${interiorLine}\n${LINE3}\n`;
}

async function makeWorkspace(fileContent) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-delete-line-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, "ws", "region_b.txt"), fileContent, {
    encoding: "utf8",
  });
  return workspace;
}

async function refreshEngine(engine, workspace) {
  const { readFile } = await import("node:fs/promises");
  await engine.refresh(async (filePath) =>
    readFile(join(workspace, filePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );
}

function trackSingleLineRegion(engine) {
  engine.trackRead({
    path: REGION_PATH,
    content: OLD_INTERIOR,
    scope: "region",
    startLine: 2,
    endLine: 2,
    selector: OLD_INTERIOR,
  });
}

test("PCR 0058 board A: delete tracked line serves neighbor bytes at stored line address", async () => {
  const afterDelete = `${LINE1}\n${LINE3}\n`;
  const workspace = await makeWorkspace(afterDelete);
  const engine = new FreshCtxEngine();
  trackSingleLineRegion(engine);
  await refreshEngine(engine, workspace);

  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "stored-line-span");
  assert.equal(unit.content, LINE3);

  const projection = engine.project({ budgetChars: 8_000 });
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.match(projection.text, /line3 footer/u);
  assert.match(projection.text, /resolution="stored-line-span"/u);
  assert.match(projection.text, /unresolved="0"/u);
});

test("PCR 0058 board B-delete-last: tracked line unchanged after footer delete", async () => {
  const afterDeleteLast = `${LINE1}\n${OLD_INTERIOR}\n`;
  const workspace = await makeWorkspace(afterDeleteLast);
  const engine = new FreshCtxEngine();
  trackSingleLineRegion(engine);
  await refreshEngine(engine, workspace);

  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "exact");
  assert.equal(unit.content, OLD_INTERIOR);

  const projection = engine.project({ budgetChars: 8_000 });
  assert.match(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /line3 footer/u);
  assert.match(projection.text, /unresolved="0"/u);
});

test("PCR 0058 board B-past-eof: shrink below stored line fails closed", async () => {
  const afterShrink = LINE1;
  const workspace = await makeWorkspace(afterShrink);
  const engine = new FreshCtxEngine();
  trackSingleLineRegion(engine);
  await refreshEngine(engine, workspace);

  const unit = engine.registry.list()[0];
  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "anchors-not-found");

  const projection = engine.project({ budgetChars: 8_000 });
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /line3 footer/u);
  assert.match(projection.text, /unresolved="1"/u);
});

test("Hermes PCR 0058 board A: delete tracked line serves neighbor bytes at stored line address", async () => {
  const afterDelete = `${LINE1}\n${LINE3}\n`;
  const workspace = await makeWorkspace(afterDelete);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-a",
      path: REGION_PATH,
      scope: "region",
      startLine: 2,
      endLine: 2,
      selector: OLD_INTERIOR,
    }),
    buildToolResultMessage({ toolCallId: "call-a", content: OLD_INTERIOR }),
    { role: "user", content: "quote the interior marker" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.equal(capture.adapterApplied, true);
  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /line3 footer/u);
  assert.match(capture.payloadText, /resolution="stored-line-span"/u);
});

test("Hermes PCR 0058 board B-past-eof: shrink below stored line fails closed", async () => {
  const workspace = await makeWorkspace(LINE1);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-b",
      path: REGION_PATH,
      scope: "region",
      startLine: 2,
      endLine: 2,
      selector: OLD_INTERIOR,
    }),
    buildToolResultMessage({ toolCallId: "call-b", content: OLD_INTERIOR }),
    { role: "user", content: "quote the interior marker" },
  ];

  const capture = await captureProviderRequest({
    cwd: workspace,
    persistedMessages: persisted,
    stateFile,
    budgetChars: 8_000,
  });

  assert.equal(capture.adapterApplied, true);
  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /unresolved="1"/u);
});
