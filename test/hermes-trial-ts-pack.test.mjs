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
  fixtureRoot,
  freshCtxEnvForArm,
  freshCtxHermesAdapterDir,
  freshCtxPluginForArm,
  hermesContextEngineForArm,
  hostReadToolArgs,
  promptForCell,
  resolveRepoRoot,
} from "../docs/lab/hermes-trial-ts/pack.mjs";
import { exportFunctionBlock } from "../docs/lab/pi-trial-ts/live.mjs";
import { markerValueInTargetBlock, mutate, reset } from "../docs/lab/hermes-trial-ts/live.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../docs/lab/pi-trial-ts/fixture/src/settlement.ts");

test("hermes-trial-ts pack defines three arms and two turns", () => {
  assert.deepEqual(ARMS, ["nothing", "freshctx-no-ts", "freshctx-ts"]);
  assert.equal(CELLS.length, 2);
  assert.equal(CELLS[0].id, "t1-read");
  assert.equal(CELLS[1].id, "t2-settle");
  assert.equal(CELLS[1].mutate, "flip-settle");
});

test("hermes-trial-ts prompts match the Pi trial symbol-scope contract", () => {
  assert.equal(promptForCell(CELLS[0]), PROMPT_T1);
  assert.equal(promptForCell(CELLS[1]), PROMPT_T2);
  assert.match(PROMPT_T1, /scope=symbol/u);
  assert.match(PROMPT_T1, new RegExp(TARGET_SYMBOL, "u"));
  assert.match(PROMPT_T2, /MARKER_SETTLE/u);
  assert.doesNotMatch(PROMPT_T2, /scope=symbol/u);
});

test("hermes-trial-ts hostReadToolArgs pass symbol scope through harness", () => {
  assert.deepEqual(hostReadToolArgs(), {
    path: TARGET_FILE,
    scope: "symbol",
    selector: TARGET_SYMBOL,
  });
});

test("hermes-trial-ts freshCtxEnvForArm toggles Isolated Semantic Engine in harness only", () => {
  assert.deepEqual(freshCtxEnvForArm("nothing"), {});
  assert.deepEqual(freshCtxEnvForArm("freshctx-ts"), {});
  assert.deepEqual(freshCtxEnvForArm("freshctx-no-ts"), { FRESHCTX_ISOLATED_SEMANTIC_ENGINE: "off" });
  assert.equal(freshCtxPluginForArm("nothing"), null);
  assert.equal(hermesContextEngineForArm("nothing"), null);
  assert.equal(hermesContextEngineForArm("freshctx-ts"), "freshctx");
  assert.match(freshCtxPluginForArm("freshctx-ts"), /adapters\/hermes$/u);
});

test("hermes-trial-ts resolveRepoRoot finds adapters/hermes/bridge.mjs", () => {
  const root = resolveRepoRoot();
  assert.equal(freshCtxHermesAdapterDir(root), join(root, "adapters/hermes"));
  assert.equal(fixtureRoot(), join(root, "docs/lab/pi-trial-ts/fixture"));
});

test("hermes-trial-ts flip-settle changes only settleDailyLedger interior marker", async () => {
  await reset("nothing");
  const root = join(here, "../docs/lab/hermes-trial-ts/.work/nothing");
  const path = join(root, TARGET_FILE);
  const before = await readFile(path, "utf8");
  assert.equal(
    markerValueInTargetBlock(before, { v0: MARKER_V0, v1: MARKER_V1, symbol: TARGET_SYMBOL }),
    MARKER_V0,
  );
  await mutate("nothing", "flip-settle");
  const after = await readFile(path, "utf8");
  assert.equal(
    markerValueInTargetBlock(after, { v0: MARKER_V0, v1: MARKER_V1, symbol: TARGET_SYMBOL }),
    MARKER_V1,
  );
  assert.match(
    exportFunctionBlock(after, LOOKALIKE_SYMBOL),
    new RegExp(`"${LOOKALIKE_MARKER}"`, "u"),
  );
  const source = await readFile(fixturePath, "utf8");
  assert.ok(source.includes(SIBLING_MARKER));
});
