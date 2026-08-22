import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BUDGET_CHARS,
  BUDGET_PRESSURE_LAB_CELLS,
  BUDGET_PRESSURE_LAB_PACK_ID,
  buildBudgetPressureTrace,
  isBudgetPressureTrace,
  listBudgetPressureTraces,
} from "../bench/budget-pressure-lab.mjs";
import { finalHermesNativeCapture, runHermesNativeTrace } from "../bench/hermes-native-trace-runner.mjs";
import { runTrace } from "../bench/trace-runner.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HERMES_CONTEXT_MODULE = join(ROOT, "bench", "hosts", "hermes", "agent", "context_engine.py");
const hermesHostReady = existsSync(HERMES_CONTEXT_MODULE);

test("budget-pressure traces embed holdout gold with reduced budget and filler reads", async () => {
  const baseTrace = JSON.parse(
    await readFile(join(ROOT, "bench/traces/holdout/go-tools-append.json"), "utf8"),
  );
  const cell = BUDGET_PRESSURE_LAB_CELLS.find((item) => item.id === "go-append");
  const trace = buildBudgetPressureTrace(baseTrace, cell);

  assert.equal(isBudgetPressureTrace(trace), true);
  assert.match(trace.name, /budget-pressure/u);
  assert.doesNotMatch(trace.name, /holdout/u);

  const reads = trace.events.filter((event) => event.type === "read");
  assert.ok(reads.length >= 5, "expected filler reads plus gold read");
  assert.ok(reads.some((event) => event.path.startsWith("lab/filler/")));

  for (const event of trace.events.filter((item) => item.type === "capture-request")) {
    assert.equal(event.budgetChars, BUDGET_CHARS);
  }

  const goldCapture = trace.events.filter((event) => event.type === "capture-request").at(-1);
  const holdoutGold = baseTrace.events.filter((event) => event.type === "capture-request").at(-1);
  assert.deepEqual(goldCapture.requiredUnits, holdoutGold.requiredUnits);
});

test("budget-pressure trace pack is present with six cells", async () => {
  const traces = await listBudgetPressureTraces(ROOT);
  assert.equal(traces.length, BUDGET_PRESSURE_LAB_CELLS.length);
  for (const trace of traces) {
    assert.equal(isBudgetPressureTrace(trace), true);
    await assert.doesNotReject(() => runTrace(trace, "freshctx-region"));
  }
});

test(
  "hermes-native compresses budget-pressure traces when host checkout is present",
  { skip: hermesHostReady ? false : "bench/hosts/hermes not fetched" },
  async () => {
    const prior = process.env.FRESHCTX_CAPTURE_OK;
    process.env.FRESHCTX_CAPTURE_OK = "1";
    try {
      const traces = await listBudgetPressureTraces(ROOT);
      const modes = [];
      for (const trace of traces) {
        const result = await runHermesNativeTrace(trace, { budgetPressure: true });
        const capture = finalHermesNativeCapture(result);
        assert.ok(capture, `${trace.name}: missing hermes capture`);
        modes.push(capture.nativeMode);
        assert.notEqual(capture.nativeMode, "native-no-op", `${trace.name}: expected compression path`);
      }
      assert.ok(modes.every((mode) => mode === "compress"), `hermes modes: ${modes.join(",")}`);
    } finally {
      if (prior === undefined) delete process.env.FRESHCTX_CAPTURE_OK;
      else process.env.FRESHCTX_CAPTURE_OK = prior;
    }
  },
);

test(
  "native budget-pressure runner emits four baselines per trace when hermes host checkout is present",
  { skip: hermesHostReady ? false : "bench/hosts/hermes not fetched" },
  async () => {
    const { runNativeBudgetPressurePack } = await import("../bench/native-budget-pressure.mjs");
    const summary = await runNativeBudgetPressurePack({ skipReportWrite: true });
    assert.equal(summary.packId, BUDGET_PRESSURE_LAB_PACK_ID);
    assert.equal(summary.traces, 6);
    assert.equal(summary.records, 24);
    assert.equal(summary.allHermesNoOp, false);
    assert.deepEqual(summary.hermesModes, ["compress"]);
    const baselines = new Set(summary.rows.map((row) => row.baseline));
    assert.deepEqual(
      [...baselines].sort(),
      ["freshctx-file", "freshctx-region", "hermes-native", "pi-native"].sort(),
    );
  },
);
