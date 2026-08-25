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
const OBSERVED_FILE_LINE_COUNT_BEFORE_DELETE = 4;
const OBSERVED_FILE_LINE_COUNT_AFTER_DELETE = 3;

function threeLineFile(interiorLine) {
  return `${HEADER_LINE}\n${interiorLine}\n${FOOTER_LINE}\n`;
}

function twoLineFileAfterDelete() {
  return `${HEADER_LINE}\n${FOOTER_LINE}\n`;
}

function splitLines(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n");
}

function lineCount(content) {
  return splitLines(content).length;
}

async function observeRegionThenDeleteWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0065-"));
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
    observedFileLineCount: OBSERVED_FILE_LINE_COUNT_BEFORE_DELETE,
  });

  await writeFile(filePath, twoLineFileAfterDelete(), { encoding: "utf8" });
  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  return { engine, workspace, regionUnit };
}

test("Board 1 delete line 2 with no re-observe: 0059 fail-close holds (observe-then-mutate)", async () => {
  const { engine, workspace, regionUnit } = await observeRegionThenDeleteWorkspace();
  const unit = engine.registry.list()[0];
  const projection = engine.project({ budgetChars: 8_000 });
  const currentFile = await readFile(join(workspace, "ws", "region_b.txt"), "utf8");

  assert.equal(unit.id, regionUnit.id);
  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "anchors-not-found");
  assert.equal(unit.startLine, 2);
  assert.equal(unit.endLine, 2);
  assert.equal(unit.observedFileLineCount, OBSERVED_FILE_LINE_COUNT_BEFORE_DELETE);
  assert.equal(lineCount(currentFile), OBSERVED_FILE_LINE_COUNT_AFTER_DELETE);
  assert.equal(unit.content, OLD_INTERIOR);
  assert.equal(Buffer.byteLength(unit.content, "utf8"), 39);
  assert.match(projection.text, /selected="0"/u);
  assert.match(projection.text, /unresolved="1"/u);
  assert.doesNotMatch(projection.text, /line3 footer/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
  assert.doesNotMatch(projection.text, /<freshctx-unit/u);
});

test("Board 2 delete then path-only re-observe: new whole-file unit; old region stays unresolved", async () => {
  const { engine, workspace } = await observeRegionThenDeleteWorkspace();
  const regionUnit = engine.registry.list()[0];
  const postDeleteFile = twoLineFileAfterDelete();

  const fileUnit = engine.trackRead({
    path: REGION_PATH,
    content: postDeleteFile,
    scope: "file",
    observedFileLineCount: OBSERVED_FILE_LINE_COUNT_AFTER_DELETE,
  });

  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const units = engine.registry.list();
  const refreshedRegion = units.find((entry) => entry.id === regionUnit.id);
  const refreshedFile = units.find((entry) => entry.id === fileUnit.id);
  const projection = engine.project({ budgetChars: 8_000 });
  const fileLines = splitLines(refreshedFile.content);

  assert.notEqual(fileUnit.id, regionUnit.id);
  assert.equal(units.length, 2);
  assert.equal(refreshedRegion.state, "unresolved");
  assert.equal(refreshedRegion.resolutionMethod, "anchors-not-found");
  assert.equal(refreshedFile.state, "resolved");
  assert.equal(refreshedFile.resolutionMethod, "whole-file");
  assert.equal(refreshedFile.scope, "file");
  assert.equal(refreshedFile.startLine, 1);
  assert.equal(refreshedFile.endLine, 3);
  assert.equal(refreshedFile.observedFileLineCount, OBSERVED_FILE_LINE_COUNT_AFTER_DELETE);
  assert.equal(fileLines[0], HEADER_LINE);
  assert.equal(fileLines[1], FOOTER_LINE);
  assert.equal(fileLines.at(-1), "");
  assert.match(projection.text, /selected="1"/u);
  assert.match(projection.text, /unresolved="1"/u);
  assert.match(projection.text, new RegExp(`id="${fileUnit.id}"`, "u"));
  assert.match(projection.text, /lines="1-3"/u);
  assert.match(projection.text, /resolution="whole-file"/u);
  assert.match(projection.text, /line1 header/u);
  assert.match(projection.text, /line3 footer/u);
  assert.match(
    projection.text,
    new RegExp(
      `<freshctx-omitted id="${regionUnit.id}" path="${REGION_PATH}" reason="unresolved"/>`,
      "u",
    ),
  );
  assert.doesNotMatch(
    projection.text,
    new RegExp(`<freshctx-unit id="${regionUnit.id}"`, "u"),
  );
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
});

test("Board 3 delete then Hermes region 2-2 re-observe: re-pin same unit id; footer at exact 2-2", async () => {
  const { engine, workspace, regionUnit } = await observeRegionThenDeleteWorkspace();

  const repinned = engine.trackRead({
    path: REGION_PATH,
    content: FOOTER_LINE,
    scope: "region",
    startLine: 2,
    endLine: 2,
    observedFileLineCount: OBSERVED_FILE_LINE_COUNT_AFTER_DELETE,
  });

  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  const units = engine.registry.list();
  const unit = units[0];
  const projection = engine.project({ budgetChars: 8_000 });

  assert.equal(repinned.id, regionUnit.id);
  assert.equal(units.length, 1);
  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "exact");
  assert.equal(unit.startLine, 2);
  assert.equal(unit.endLine, 2);
  assert.equal(unit.content, FOOTER_LINE);
  assert.equal(Buffer.byteLength(unit.content, "utf8"), 12);
  assert.equal(unit.observedFileLineCount, OBSERVED_FILE_LINE_COUNT_AFTER_DELETE);
  assert.match(projection.text, /selected="1"/u);
  assert.match(projection.text, /unresolved="0"/u);
  assert.match(projection.text, new RegExp(`id="${regionUnit.id}"`, "u"));
  assert.match(projection.text, /lines="2-2"/u);
  assert.match(projection.text, /resolution="exact"/u);
  assert.match(projection.text, /line3 footer/u);
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
});
