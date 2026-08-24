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

function threeLineFile(interiorLine) {
  return `line1 header\n${interiorLine}\nline3 footer\n`;
}

async function makeBInteriorWorkspace(interiorLine) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-b-interior-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, "ws", "region_b.txt"), threeLineFile(interiorLine), {
    encoding: "utf8",
  });
  return workspace;
}

test("Hermes region-scoped single-line interior edit serves current bytes after mutation", async () => {
  const workspace = await makeBInteriorWorkspace(NEW_INTERIOR);
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

  assert.doesNotMatch(capture.payloadText, /BETA_OLD_INTERIOR/u);
  assert.match(capture.payloadText, /BETA_NEW_INTERIOR/u);
  assert.match(capture.payloadText, /resolution="stored-line-span"/u);
  assert.equal(capture.adapterApplied, true);
});

test("core region refresh serves current bytes for single-line interior edit", async () => {
  const workspace = await makeBInteriorWorkspace(NEW_INTERIOR);
  const engine = new FreshCtxEngine();

  engine.trackRead({
    path: REGION_PATH,
    content: OLD_INTERIOR,
    scope: "region",
    startLine: 2,
    endLine: 2,
    selector: OLD_INTERIOR,
    observedFileLineCount: 4,
  });

  const { readFile } = await import("node:fs/promises");
  await engine.refresh(async (filePath) =>
    readFile(join(workspace, filePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const projection = engine.project({ budgetChars: 8_000 });
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.match(projection.text, /BETA_NEW_INTERIOR/u);
  assert.match(projection.text, /resolution="stored-line-span"/u);
  assert.equal(engine.registry.list()[0].resolutionMethod, "stored-line-span");
});

test("Hermes file-scope interior edit still serves current bytes after mutation", async () => {
  const workspace = await makeBInteriorWorkspace(NEW_INTERIOR);
  const stateFile = await createHermesStateFile();
  const staleWholeFile = threeLineFile(OLD_INTERIOR);

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-b2",
      path: REGION_PATH,
      scope: "file",
    }),
    buildToolResultMessage({ toolCallId: "call-b2", content: staleWholeFile }),
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
});
