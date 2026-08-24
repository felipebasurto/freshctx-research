import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FreshCtxEngine } from "../src/index.mjs";

const REGION_PATH = "ws/region_b.txt";
const OLD_INTERIOR = "BETA_OLD_INTERIOR keep this line unique";
const FOOTER_LINE = "line3 footer";
const HEADER_LINE = "line1 header";
const OBSERVED_FILE_LINE_COUNT_BEFORE = 4;
const OBSERVED_FILE_LINE_COUNT_AFTER_HEADER_DELETE = 3;

function threeLineFile(interiorLine) {
  return `${HEADER_LINE}\n${interiorLine}\n${FOOTER_LINE}\n`;
}

function fileAfterHeaderDelete() {
  return `${OLD_INTERIOR}\n${FOOTER_LINE}\n`;
}

function splitLines(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n");
}

function lineCount(content) {
  return splitLines(content).length;
}

async function observeHeaderRegionOneOne() {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0068-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  const filePath = join(workspace, "ws", "region_b.txt");
  await writeFile(filePath, threeLineFile(OLD_INTERIOR), { encoding: "utf8" });

  const engine = new FreshCtxEngine();
  const headerUnit = engine.trackRead({
    path: REGION_PATH,
    content: HEADER_LINE,
    scope: "region",
    startLine: 1,
    endLine: 1,
    observedFileLineCount: OBSERVED_FILE_LINE_COUNT_BEFORE,
  });

  return { engine, workspace, headerUnit };
}

test("header 1-1 observe then delete line 1: 0059 fail-close; no neighbor footer leak", async () => {
  const { engine, workspace, headerUnit } = await observeHeaderRegionOneOne();
  const postDeleteFile = fileAfterHeaderDelete();

  await writeFile(join(workspace, "ws", "region_b.txt"), postDeleteFile, { encoding: "utf8" });
  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const unit = engine.registry.get(headerUnit.id);
  const projection = engine.project({ budgetChars: 8_000 });
  const fileLines = splitLines(postDeleteFile);

  assert.equal(unit.id, headerUnit.id);
  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "anchors-not-found");
  assert.equal(unit.startLine, 1);
  assert.equal(unit.endLine, 1);
  assert.equal(unit.content, HEADER_LINE);
  assert.equal(Buffer.byteLength(unit.content, "utf8"), 12);
  assert.equal(unit.observedFileLineCount, OBSERVED_FILE_LINE_COUNT_BEFORE);
  assert.equal(lineCount(postDeleteFile), OBSERVED_FILE_LINE_COUNT_AFTER_HEADER_DELETE);
  assert.equal(fileLines[0], OLD_INTERIOR);
  assert.equal(fileLines[1], FOOTER_LINE);
  assert.equal(fileLines.at(-1), "");
  assert.match(projection.text, /selected="0"/u);
  assert.match(projection.text, /unresolved="1"/u);
  assert.doesNotMatch(projection.text, /line3 footer/u);
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
  assert.doesNotMatch(projection.text, /<freshctx-unit/u);
});

test("header 1-1 observe then delete then region 1-1 re-observe: re-pin same id; door exact at new line 1", async () => {
  const { engine, workspace, headerUnit } = await observeHeaderRegionOneOne();
  const postDeleteFile = fileAfterHeaderDelete();

  await writeFile(join(workspace, "ws", "region_b.txt"), postDeleteFile, { encoding: "utf8" });
  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const afterDelete = engine.registry.get(headerUnit.id);
  assert.equal(afterDelete.state, "unresolved");
  assert.equal(afterDelete.resolutionMethod, "anchors-not-found");

  const repinned = engine.trackRead({
    path: REGION_PATH,
    content: OLD_INTERIOR,
    scope: "region",
    startLine: 1,
    endLine: 1,
    observedFileLineCount: OBSERVED_FILE_LINE_COUNT_AFTER_HEADER_DELETE,
  });

  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const unit = engine.registry.get(headerUnit.id);
  const projection = engine.project({ budgetChars: 8_000 });
  const fileLines = splitLines(postDeleteFile);

  assert.equal(repinned.id, headerUnit.id);
  assert.equal(engine.registry.list().length, 1);
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "exact");
  assert.equal(unit.startLine, 1);
  assert.equal(unit.endLine, 1);
  assert.equal(unit.content, OLD_INTERIOR);
  assert.equal(Buffer.byteLength(unit.content, "utf8"), 39);
  assert.equal(unit.observedFileLineCount, OBSERVED_FILE_LINE_COUNT_AFTER_HEADER_DELETE);
  assert.equal(fileLines[0], OLD_INTERIOR);
  assert.equal(fileLines[1], FOOTER_LINE);
  assert.equal(splitLines(unit.content)[0], OLD_INTERIOR);
  assert.equal(splitLines(unit.content).at(-1), OLD_INTERIOR);
  assert.match(projection.text, /selected="1"/u);
  assert.match(projection.text, /unresolved="0"/u);
  assert.match(projection.text, new RegExp(`id="${headerUnit.id}"`, "u"));
  assert.match(projection.text, /lines="1-1"/u);
  assert.match(projection.text, /resolution="exact"/u);
  assert.match(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /line1 header/u);
  assert.doesNotMatch(projection.text, /line3 footer/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
});
