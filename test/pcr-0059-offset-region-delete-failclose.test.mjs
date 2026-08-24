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

function twoLineFileAfterDelete() {
  return "line1 header\nline3 footer\n";
}

function fourLineFileAfterInsertAbove(interiorLine) {
  return `inserted above\nline1 header\n${interiorLine}\nline3 footer\n`;
}

async function writeWorkspace(relativePath, content) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0059-"));
  const dir = join(workspace, relativePath.split("/").slice(0, -1).join("/"));
  if (dir !== workspace) await mkdir(dir, { recursive: true });
  await writeFile(join(workspace, relativePath), content, { encoding: "utf8" });
  return workspace;
}

test("Hermes offset/limit read maps to region and serves interior replace via stored-line-span", async () => {
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

test("core stored-line-span fail-closes when tracked line is deleted (3 to 2 lines)", async () => {
  const workspace = await writeWorkspace(REGION_PATH, twoLineFileAfterDelete());
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
  assert.equal(engine.registry.list()[0].state, "unresolved");
  assert.doesNotMatch(projection.text, /line3 footer/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
});

test("Hermes stored-line-span fail-closes when tracked line is deleted (3 to 2 lines)", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0059-hermes-delete-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  const filePath = join(workspace, "ws", "region_b.txt");
  await writeFile(filePath, threeLineFile(OLD_INTERIOR), { encoding: "utf8" });

  const stateFile = await createHermesStateFile();
  const persisted = [
    buildReadToolCall({
      toolCallId: "call-delete",
      path: REGION_PATH,
      offset: 2,
      limit: 1,
    }),
    buildToolResultMessage({ toolCallId: "call-delete", content: OLD_INTERIOR }),
    { role: "user", content: "quote the interior marker" },
  ];

  const { createHermesAdapter } = await import("../adapters/hermes/replay.mjs");
  const adapter = createHermesAdapter({ stateFile, budgetChars: 8_000 });
  const ctx = { cwd: workspace };
  await adapter.onTurnComplete(structuredClone(persisted), ctx);

  await writeFile(filePath, twoLineFileAfterDelete(), { encoding: "utf8" });

  const selectResult = await adapter.onSelectContext(structuredClone(persisted), ctx, {
    budgetChars: 8_000,
  });
  const payloadText = selectResult?.projectionText ?? "";

  assert.doesNotMatch(payloadText, /line3 footer/u);
  assert.doesNotMatch(payloadText, /stored-line-span/u);
});

test("core stored-line-span stays unresolved past EOF", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0059-past-eof-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  const filePath = join(workspace, "ws", "region_b.txt");
  const twoLinesNoTrailingNewline = "line1 header\nline3 footer";
  await writeFile(filePath, twoLinesNoTrailingNewline, { encoding: "utf8" });

  const engine = new FreshCtxEngine();
  engine.trackRead({
    path: REGION_PATH,
    content: "",
    scope: "region",
    startLine: 3,
    endLine: 3,
    observedFileLineCount: 2,
  });

  const { readFile } = await import("node:fs/promises");
  await engine.refresh(async (filePath) =>
    readFile(join(workspace, filePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  assert.equal(engine.registry.list()[0].state, "unresolved");
});

test("core stored-line-span fail-closes on insert-above line count shift (3 to 4 lines)", async () => {
  const workspace = await writeWorkspace(REGION_PATH, fourLineFileAfterInsertAbove(NEW_INTERIOR));
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
  assert.equal(engine.registry.list()[0].state, "unresolved");
  assert.doesNotMatch(projection.text, /line1 header/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
});

test("Hermes offset/limit maps to region scope in discovered calls", async () => {
  const { discoveredCalls } = await import("../adapters/hermes/bridge.mjs");
  const messages = [
    buildReadToolCall({
      toolCallId: "call-offset",
      path: REGION_PATH,
      offset: 2,
      limit: 1,
    }),
    buildToolResultMessage({ toolCallId: "call-offset", content: OLD_INTERIOR }),
  ];
  const calls = discoveredCalls(messages);
  assert.equal(calls["call-offset"].scope, "region");
  assert.equal(calls["call-offset"].startLine, 2);
  assert.equal(calls["call-offset"].endLine, 2);
});
