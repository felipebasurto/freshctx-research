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
const REPLACEMENT_LINE = "GAMMA_NEW_NEIGHBOR distinct replacement bytes";
const OBSERVED_FILE_LINE_COUNT_BEFORE = 4;
const OBSERVED_FILE_LINE_COUNT_AFTER_HEADER_DELETE = 3;

function threeLineFile(interiorLine) {
  return `${HEADER_LINE}\n${interiorLine}\n${FOOTER_LINE}\n`;
}

function fileAfterHeaderDelete() {
  return `${OLD_INTERIOR}\n${FOOTER_LINE}\n`;
}

function fileAfterDeleteAndReplaceLine2() {
  return `${HEADER_LINE}\n${REPLACEMENT_LINE}\n`;
}

function splitLines(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n");
}

function lineCount(content) {
  return splitLines(content).length;
}

async function observeInteriorRegionTwoTwo() {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0067-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  const filePath = join(workspace, "ws", "region_b.txt");
  await writeFile(filePath, threeLineFile(OLD_INTERIOR), { encoding: "utf8" });

  const engine = new FreshCtxEngine();
  const regionUnit = engine.trackRead({
    path: REGION_PATH,
    content: OLD_INTERIOR,
    scope: "region",
    startLine: 2,
    endLine: 2,
    observedFileLineCount: OBSERVED_FILE_LINE_COUNT_BEFORE,
  });

  return { engine, workspace, regionUnit };
}

test("Board A delete header then region 1-1 re-observe: no re-pin; door exact migrates old 2-2 to 1-1; duplicate units", async () => {
  const { engine, workspace, regionUnit } = await observeInteriorRegionTwoTwo();
  const postDeleteFile = fileAfterHeaderDelete();

  await writeFile(join(workspace, "ws", "region_b.txt"), postDeleteFile, { encoding: "utf8" });
  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const afterDelete = engine.registry.get(regionUnit.id);
  assert.equal(afterDelete.state, "resolved");
  assert.equal(afterDelete.resolutionMethod, "exact");
  assert.equal(afterDelete.startLine, 1);
  assert.equal(afterDelete.endLine, 1);
  assert.equal(afterDelete.content, OLD_INTERIOR);
  assert.equal(Buffer.byteLength(afterDelete.content, "utf8"), 39);
  assert.equal(afterDelete.observedFileLineCount, OBSERVED_FILE_LINE_COUNT_BEFORE);
  assert.equal(lineCount(postDeleteFile), OBSERVED_FILE_LINE_COUNT_AFTER_HEADER_DELETE);

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

  const units = engine.registry.list();
  const migrated = units.find((entry) => entry.id === regionUnit.id);
  const fresh = units.find((entry) => entry.id === repinned.id);
  const projection = engine.project({ budgetChars: 8_000 });

  assert.notEqual(repinned.id, regionUnit.id);
  assert.equal(units.length, 2);
  assert.equal(migrated.state, "resolved");
  assert.equal(migrated.resolutionMethod, "exact");
  assert.equal(migrated.startLine, 1);
  assert.equal(migrated.endLine, 1);
  assert.equal(migrated.observedFileLineCount, OBSERVED_FILE_LINE_COUNT_BEFORE);
  assert.equal(fresh.state, "resolved");
  assert.equal(fresh.resolutionMethod, "exact");
  assert.equal(fresh.startLine, 1);
  assert.equal(fresh.endLine, 1);
  assert.equal(fresh.content, OLD_INTERIOR);
  assert.equal(Buffer.byteLength(fresh.content, "utf8"), 39);
  assert.equal(fresh.observedFileLineCount, OBSERVED_FILE_LINE_COUNT_AFTER_HEADER_DELETE);
  assert.equal(splitLines(migrated.content)[0], OLD_INTERIOR);
  assert.equal(splitLines(fresh.content)[0], OLD_INTERIOR);
  assert.match(projection.text, /selected="2"/u);
  assert.match(projection.text, /unresolved="0"/u);
  assert.match(projection.text, /lines="1-1"/u);
  assert.match(projection.text, /resolution="exact"/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
});

test("Board B delete interior replace line 2 then region 2-2 re-observe: re-pin same id; door exact on distinct bytes", async () => {
  const { engine, workspace, regionUnit } = await observeInteriorRegionTwoTwo();

  await writeFile(
    join(workspace, "ws", "region_b.txt"),
    `${HEADER_LINE}\n${FOOTER_LINE}\n`,
    { encoding: "utf8" },
  );
  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const afterDelete = engine.registry.get(regionUnit.id);
  assert.equal(afterDelete.state, "unresolved");
  assert.equal(afterDelete.resolutionMethod, "anchors-not-found");
  assert.equal(afterDelete.startLine, 2);
  assert.equal(afterDelete.endLine, 2);
  assert.equal(afterDelete.observedFileLineCount, OBSERVED_FILE_LINE_COUNT_BEFORE);

  const postReplaceFile = fileAfterDeleteAndReplaceLine2();
  await writeFile(join(workspace, "ws", "region_b.txt"), postReplaceFile, { encoding: "utf8" });
  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const afterReplace = engine.registry.get(regionUnit.id);
  assert.equal(afterReplace.state, "unresolved");
  assert.equal(afterReplace.resolutionMethod, "anchors-not-found");
  assert.equal(lineCount(postReplaceFile), OBSERVED_FILE_LINE_COUNT_AFTER_HEADER_DELETE);

  const repinned = engine.trackRead({
    path: REGION_PATH,
    content: REPLACEMENT_LINE,
    scope: "region",
    startLine: 2,
    endLine: 2,
    observedFileLineCount: OBSERVED_FILE_LINE_COUNT_AFTER_HEADER_DELETE,
  });

  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const unit = engine.registry.get(regionUnit.id);
  const projection = engine.project({ budgetChars: 8_000 });
  const fileLines = splitLines(postReplaceFile);

  assert.equal(repinned.id, regionUnit.id);
  assert.equal(engine.registry.list().length, 1);
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "exact");
  assert.equal(unit.startLine, 2);
  assert.equal(unit.endLine, 2);
  assert.equal(unit.content, REPLACEMENT_LINE);
  assert.equal(Buffer.byteLength(unit.content, "utf8"), 45);
  assert.equal(unit.observedFileLineCount, OBSERVED_FILE_LINE_COUNT_AFTER_HEADER_DELETE);
  assert.equal(fileLines[0], HEADER_LINE);
  assert.equal(fileLines[1], REPLACEMENT_LINE);
  assert.equal(fileLines.at(-1), "");
  assert.match(projection.text, /selected="1"/u);
  assert.match(projection.text, /unresolved="0"/u);
  assert.match(projection.text, new RegExp(`id="${regionUnit.id}"`, "u"));
  assert.match(projection.text, /lines="2-2"/u);
  assert.match(projection.text, /resolution="exact"/u);
  assert.match(projection.text, /GAMMA_NEW_NEIGHBOR/u);
  assert.doesNotMatch(projection.text, /line3 footer/u);
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
});
