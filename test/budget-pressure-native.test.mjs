import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BUDGET_CHARS,
  BUDGET_PRESSURE_LAB_CELLS,
  buildBudgetPressureTrace,
  isBudgetPressureTrace,
  listBudgetPressureTraces,
} from "../bench/budget-pressure-lab.mjs";
import { runTrace } from "../bench/trace-runner.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

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
