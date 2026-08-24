import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FreshCtxEngine } from "../src/index.mjs";

const REGION_PATH = "ws/region_b.txt";
const OLD_INTERIOR = "BETA_OLD_INTERIOR keep this line unique";
const NEW_INTERIOR = "BETA_NEW_INTERIOR keep this line unique";
const OBSERVED_FILE_LINE_COUNT = 4;

function threeLineFile(interiorLine) {
  return `line1 header\n${interiorLine}\nline3 footer\n`;
}

function fourLineFileAfterInsertAbove(interiorLine) {
  return `inserted above\nline1 header\n${interiorLine}\nline3 footer\n`;
}

async function observeThenMutateWorkspace(postMutateContent) {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-pcr-0062-"));
  await mkdir(join(workspace, "ws"), { recursive: true });
  const filePath = join(workspace, "ws", "region_b.txt");
  await writeFile(filePath, threeLineFile(OLD_INTERIOR), { encoding: "utf8" });

  const engine = new FreshCtxEngine();
  engine.trackRead({
    path: REGION_PATH,
    content: OLD_INTERIOR,
    scope: "region",
    startLine: 2,
    endLine: 2,
    selector: OLD_INTERIOR,
    observedFileLineCount: OBSERVED_FILE_LINE_COUNT,
  });

  await writeFile(filePath, postMutateContent, { encoding: "utf8" });
  await engine.refresh(async (relativePath) =>
    readFile(join(workspace, relativePath), "utf8").then((value) => value.replaceAll("\r\n", "\n")),
  );

  return { engine, workspace };
}

test("Board 1 insert-above: door exact relocates interior to lines 3-3 (observe-then-mutate)", async () => {
  const { engine } = await observeThenMutateWorkspace(fourLineFileAfterInsertAbove(OLD_INTERIOR));
  const unit = engine.registry.list()[0];
  const projection = engine.project({ budgetChars: 8_000 });

  assert.equal(unit.state, "resolved");
  assert.equal(unit.resolutionMethod, "exact");
  assert.equal(unit.startLine, 3);
  assert.equal(unit.endLine, 3);
  assert.equal(unit.content, OLD_INTERIOR);
  assert.equal(Buffer.byteLength(unit.content, "utf8"), 39);
  assert.match(projection.text, /lines="3-3"/u);
  assert.match(projection.text, /resolution="exact"/u);
  assert.match(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /line1 header/u);
  assert.doesNotMatch(projection.text, /line3 footer/u);
  assert.doesNotMatch(projection.text, /inserted above/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
});

test("Board 2 insert-above + interior replace: fail-closed empty projection (observe-then-mutate)", async () => {
  const { engine } = await observeThenMutateWorkspace(fourLineFileAfterInsertAbove(NEW_INTERIOR));
  const unit = engine.registry.list()[0];
  const projection = engine.project({ budgetChars: 8_000 });

  assert.equal(unit.state, "unresolved");
  assert.equal(unit.resolutionMethod, "anchors-not-found");
  assert.equal(unit.content, OLD_INTERIOR);
  assert.match(projection.text, /selected="0"/u);
  assert.match(projection.text, /unresolved="1"/u);
  assert.doesNotMatch(projection.text, /BETA_OLD_INTERIOR/u);
  assert.doesNotMatch(projection.text, /BETA_NEW_INTERIOR/u);
  assert.doesNotMatch(projection.text, /line1 header/u);
  assert.doesNotMatch(projection.text, /line3 footer/u);
  assert.doesNotMatch(projection.text, /inserted above/u);
  assert.doesNotMatch(projection.text, /stored-line-span/u);
  assert.doesNotMatch(projection.text, /<freshctx-unit/u);
});
