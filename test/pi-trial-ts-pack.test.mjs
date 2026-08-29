import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ARMS,
  CELLS,
  MARKER_V0,
  MARKER_V1,
  SIBLING_MARKER,
  TARGET_FILE,
  TARGET_SYMBOL,
  promptForCell,
} from "../docs/lab/pi-trial-ts/pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../docs/lab/pi-trial-ts/fixture/src/settlement.ts");

test("pi-trial-ts pack defines three arms and two turns", () => {
  assert.deepEqual(ARMS, ["without", "with-file", "with-symbol"]);
  assert.equal(CELLS.length, 2);
  assert.equal(CELLS[0].id, "t1-read");
  assert.equal(CELLS[1].id, "t2-settle");
  assert.equal(CELLS[1].mutate, "flip-settle");
});

test("pi-trial-ts turn-2 prompt is identical across arms", () => {
  const prompts = ARMS.map((arm) => promptForCell(CELLS[1], arm));
  assert.equal(prompts[0], prompts[1]);
  assert.equal(prompts[1], prompts[2]);
  assert.match(prompts[0], /MARKER_SETTLE/u);
  assert.match(prompts[0], /SETTLE=\.\.\./u);
});

test("pi-trial-ts fixture has lookalike exports and interior target marker", async () => {
  const source = await readFile(fixturePath, "utf8");
  assert.match(source, new RegExp(`export function ${TARGET_SYMBOL}`, "u"));
  assert.match(source, /export function settleWeeklyLedger/u);
  assert.match(source, /export function settleMonthlyLedger/u);
  assert.match(source, /export function settleDailyLedgerPreview/u);
  assert.match(source, new RegExp(`const MARKER_SETTLE = "${MARKER_V0}"`, "u"));
  assert.ok(source.includes(SIBLING_MARKER));
  assert.ok(!source.includes(MARKER_V1), "fixture ships v0 only; flip happens in live.mjs");
  assert.ok(source.split("\n").length >= 80, "fixture should be noisy enough for file-scope drown");
});

test("pi-trial-ts symbol arm uses distinct t1 prompt", () => {
  const filePrompt = promptForCell(CELLS[0], "without");
  const symbolPrompt = promptForCell(CELLS[0], "with-symbol");
  assert.notEqual(filePrompt, symbolPrompt);
  assert.match(symbolPrompt, /scope=symbol/u);
  assert.match(symbolPrompt, new RegExp(TARGET_SYMBOL, "u"));
});
