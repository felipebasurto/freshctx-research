import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ARMS,
  CELLS,
  LOOKALIKE_MARKER,
  LOOKALIKE_SYMBOL,
  MARKER_V0,
  MARKER_V1,
  PROMPT_T1,
  PROMPT_T2,
  SIBLING_MARKER,
  TARGET_FILE,
  TARGET_SYMBOL,
  freshCtxExtensionPath,
  freshCtxExtensionForArm,
  freshCtxEnvForArm,
  promptForCell,
  resolveRepoRoot,
} from "../docs/lab/pi-trial-ts/pack.mjs";
import {
  markerValueInTargetBlock,
  mutate,
  reset,
} from "../docs/lab/pi-trial-ts/live.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../docs/lab/pi-trial-ts/fixture/src/settlement.ts");

test("pi-trial-ts pack defines three arms and two turns", () => {
  assert.deepEqual(ARMS, ["nothing", "freshctx-no-ts", "freshctx-ts"]);
  assert.equal(CELLS.length, 2);
  assert.equal(CELLS[0].id, "t1-read");
  assert.equal(CELLS[1].id, "t2-settle");
  assert.equal(CELLS[1].mutate, "flip-settle");
});

test("pi-trial-ts prompts are identical across arms", () => {
  assert.equal(promptForCell(CELLS[0]), PROMPT_T1);
  assert.equal(promptForCell(CELLS[1]), PROMPT_T2);
  assert.match(PROMPT_T2, /MARKER_SETTLE/u);
  assert.match(PROMPT_T2, /SETTLE=\.\.\./u);
  assert.doesNotMatch(PROMPT_T1, /scope=symbol/u);
  assert.doesNotMatch(PROMPT_T2, /scope=symbol/u);
});

test("pi-trial-ts freshCtxEnvForArm toggles sidecar in harness code only", () => {
  assert.deepEqual(freshCtxEnvForArm("nothing"), {});
  assert.deepEqual(freshCtxEnvForArm("freshctx-ts"), {});
  assert.deepEqual(freshCtxEnvForArm("freshctx-no-ts"), { FRESHCTX_SIDECAR: "off" });
  assert.equal(freshCtxExtensionForArm("nothing"), null);
  assert.match(freshCtxExtensionForArm("freshctx-ts"), /adapters\/pi\/extension\.ts$/u);
});

test("pi-trial-ts resolveRepoRoot finds adapters/pi/extension.ts", () => {
  const root = resolveRepoRoot();
  assert.equal(freshCtxExtensionPath(root), join(root, "adapters/pi/extension.ts"));
});

test("pi-trial-ts fixture has lookalike exports and interior target marker", async () => {
  const source = await readFile(fixturePath, "utf8");
  assert.match(source, new RegExp(`export function ${TARGET_SYMBOL}`, "u"));
  assert.match(source, /export function settleWeeklyLedger/u);
  assert.match(source, /export function settleMonthlyLedger/u);
  assert.match(source, /export function settleDailyLedgerPreview/u);
  assert.match(source, new RegExp(`export function ${LOOKALIKE_SYMBOL}`, "u"));
  assert.match(source, new RegExp(`const MARKER_TOTAL = "${LOOKALIKE_MARKER}"`, "u"));
  assert.match(source, new RegExp(`const MARKER_SETTLE = "${MARKER_V0}"`, "u"));
  assert.ok(source.includes(SIBLING_MARKER));
  assert.equal(
    source.match(new RegExp(MARKER_V0, "gu"))?.length ?? 0,
    1,
    "fixture should contain exactly one ST0 literal in settleDailyLedger",
  );
  assert.ok(!source.includes(MARKER_V1), "fixture ships v0 only; flip happens in live.mjs");
  assert.ok(source.split("\n").length >= 80, "fixture should be noisy enough for file-scope drown");
});

test("pi-trial-ts flip-settle changes only settleDailyLedger interior marker", async () => {
  const fixtureRoot = join(here, "../docs/lab/pi-trial-ts/fixture");
  await reset("nothing", fixtureRoot);
  const root = join(here, "../docs/lab/pi-trial-ts/.work/nothing");
  const path = join(root, TARGET_FILE);
  const before = await readFile(path, "utf8");
  assert.equal(
    before.match(new RegExp(MARKER_V0, "gu"))?.length ?? 0,
    1,
    "pre-flip file has one ST0 literal",
  );
  assert.equal(
    markerValueInTargetBlock(before, { v0: MARKER_V0, v1: MARKER_V1, symbol: TARGET_SYMBOL }),
    MARKER_V0,
  );
  assert.match(
    exportFunctionBlockFromSource(before, LOOKALIKE_SYMBOL),
    new RegExp(`"${LOOKALIKE_MARKER}"`, "u"),
  );

  await mutate("nothing", "flip-settle");
  const after = await readFile(path, "utf8");

  assert.equal(
    markerValueInTargetBlock(after, { v0: MARKER_V0, v1: MARKER_V1, symbol: TARGET_SYMBOL }),
    MARKER_V1,
  );
  assert.equal(after.match(new RegExp(MARKER_V0, "gu"))?.length ?? 0, 0, "no ST0 left after flip");
  assert.equal(after.match(new RegExp(MARKER_V1, "gu"))?.length ?? 0, 1, "one ST1 after flip");
  assert.match(
    exportFunctionBlockFromSource(after, LOOKALIKE_SYMBOL),
    new RegExp(`"${LOOKALIKE_MARKER}"`, "u"),
    "lookalike marker unchanged",
  );
  assert.doesNotMatch(
    exportFunctionBlockFromSource(after, LOOKALIKE_SYMBOL),
    new RegExp(MARKER_V0, "u"),
    "lookalike keeps distinct marker; ST0 not flipped",
  );
});

function exportFunctionBlockFromSource(source, symbol) {
  const startNeedle = `export function ${symbol}`;
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `missing ${symbol}`);
  const nextExport = source.indexOf("\nexport function ", start + startNeedle.length);
  const end = nextExport < 0 ? source.length : nextExport;
  return source.slice(start, end);
}
