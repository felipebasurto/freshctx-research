import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
import { FreshCtxEngine } from "../src/index.mjs";

const REGION_PATH = "ws/region_b.txt";
const HEADER_LINE = "line1 header";
const FOOTER_LINE = "line3 footer";
const OLD_INTERIOR = "BETA_OLD_INTERIOR keep this line unique";
const NEW_INTERIOR = "BETA_NEW_INTERIOR keep this line unique";

// PCR 0069 shipped Rule A: endLine >= fileLineCount → file-scope (not startLine===1 &&).
// This file locks extra boards on that rule after rebase onto main @ 0069.

function threeLineFileWithTrailingNl(interiorLine) {
  return `${HEADER_LINE}\n${interiorLine}\n${FOOTER_LINE}\n`;
}

function threeLineFileWithoutTrailingNl(interiorLine) {
  return `${HEADER_LINE}\n${interiorLine}\n${FOOTER_LINE}`;
}

async function writeMutatedWorkspace(contentFactory, interiorLine) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0071-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  await writeFile(join(workspace, REGION_PATH), contentFactory(interiorLine), {
    encoding: "utf8",
  });
  return workspace;
}

async function assertWholeFileNewAfterInteriorReplace({ offset, limit, contentFactory }) {
  const workspace = await writeMutatedWorkspace(contentFactory, NEW_INTERIOR);
  const stateFile = await createHermesStateFile();

  const persisted = [
    buildReadToolCall({
      toolCallId: "call-board",
      path: REGION_PATH,
      offset,
      limit,
    }),
    buildToolResultMessage({
      toolCallId: "call-board",
      content: contentFactory(OLD_INTERIOR),
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
}

test("Board A: offset=1 limit=4 on 4-line file with trailing NL promotes to file-scope (0069 Rule A)", () => {
  assert.deepEqual(readScopeFromHermesArgs({ offset: 1, limit: 4 }, 4), { scope: "file" });
});

test("Board A: Hermes offset=1 limit=4 serves NEW via whole-file after interior replace", async () => {
  await assertWholeFileNewAfterInteriorReplace({
    offset: 1,
    limit: 4,
    contentFactory: threeLineFileWithTrailingNl,
  });
});

test("Board B: offset=1 limit=3 on 3-line file without trailing NL promotes to file-scope (0069 Rule A)", () => {
  assert.deepEqual(readScopeFromHermesArgs({ offset: 1, limit: 3 }, 3), { scope: "file" });
});

test("Board B: Hermes offset=1 limit=3 without trailing NL serves NEW via whole-file after interior replace", async () => {
  await assertWholeFileNewAfterInteriorReplace({
    offset: 1,
    limit: 3,
    contentFactory: threeLineFileWithoutTrailingNl,
  });
});

test("Board C: offset=2 limit=3 on 4-line file promotes to file-scope (0069 Rule A discriminator)", () => {
  assert.deepEqual(readScopeFromHermesArgs({ offset: 2, limit: 3 }, 4), { scope: "file" });
});

test("Board C: Hermes offset=2 limit=3 serves NEW via whole-file after interior replace", async () => {
  await assertWholeFileNewAfterInteriorReplace({
    offset: 2,
    limit: 3,
    contentFactory: threeLineFileWithTrailingNl,
  });
});

test("Board C: core explicit region 2-4 fail-closes after interior line-2 replace (door leftover)", async () => {
  const workspace = await writeMutatedWorkspace(threeLineFileWithTrailingNl, NEW_INTERIOR);
  const observedContent = threeLineFileWithTrailingNl(OLD_INTERIOR);
  const engine = new FreshCtxEngine();

  engine.trackRead({
    path: REGION_PATH,
    content: observedContent,
    scope: "region",
    startLine: 2,
    endLine: 4,
    observedFileLineCount: 4,
  });

  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const unit = engine.registry.list()[0];
  const projection = engine.project({ budgetChars: 8_000 });

  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "displaced-shrunk-boundary-anchors");
  assert.equal(unit.startLine, 2);
  assert.equal(unit.endLine, 4);
  assert.equal(unit.observedFileLineCount, 4);
  assert.match(projection.text, /selected="0"/u);
  assert.match(projection.text, /unresolved="1"/u);
  assert.doesNotMatch(projection.text, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /line1 header/u);
  assert.doesNotMatch(projection.text, /line3 footer/u);
  assert.doesNotMatch(projection.text, /resolution="/u);
  assert.doesNotMatch(projection.text, /<freshctx-unit/u);
});
