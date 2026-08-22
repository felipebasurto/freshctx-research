import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BUDGET_PRESSURE_LAB_PACK_ID } from "../bench/budget-pressure-lab.mjs";
import {
  assessLiveHermesEnv,
  isFailClosedHermesMode,
  isStubBaseUrl,
  isStubPayload,
  STUB_PAYLOAD_MARKER,
} from "../bench/live-hermes-env.mjs";
import { finalHermesNativeCapture, runHermesNativeTrace } from "../bench/hermes-native-trace-runner.mjs";
import { listBudgetPressureTraces } from "../bench/budget-pressure-lab.mjs";
import {
  BUDGET_PRESSURE_LIVE_LABEL,
  runNativeBudgetPressureLivePack,
} from "../bench/native-budget-pressure-live.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HERMES_CONTEXT_MODULE = join(ROOT, "bench", "hosts", "hermes", "agent", "context_engine.py");
const hermesHostReady = existsSync(HERMES_CONTEXT_MODULE);
const liveKeyPresent = Boolean(process.env.OPENAI_API_KEY || process.env.HERMES_API_KEY);
const liveBaseConfigured = Boolean(process.env.OPENAI_BASE_URL || process.env.HERMES_BASE_URL)
  && !isStubBaseUrl(process.env.OPENAI_BASE_URL ?? process.env.HERMES_BASE_URL);

test("live Hermes env rejects capture stub and missing API key", () => {
  const priorCapture = process.env.FRESHCTX_CAPTURE_OK;
  const priorOpenAi = process.env.OPENAI_API_KEY;
  const priorHermes = process.env.HERMES_API_KEY;
  const priorBase = process.env.OPENAI_BASE_URL;

  delete process.env.FRESHCTX_CAPTURE_OK;
  delete process.env.OPENAI_API_KEY;
  delete process.env.HERMES_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.HERMES_BASE_URL;

  const env = assessLiveHermesEnv();
  assert.equal(env.blocked, true);
  assert.ok(env.blockedReasons.some((reason) => reason.includes("API_KEY")));
  assert.ok(env.blockedReasons.some((reason) => reason.includes("127.0.0.1:8787")));

  process.env.FRESHCTX_CAPTURE_OK = "1";
  const stubEnv = assessLiveHermesEnv();
  assert.ok(stubEnv.blockedReasons.some((reason) => reason.includes("FRESHCTX_CAPTURE_OK")));

  if (priorCapture === undefined) delete process.env.FRESHCTX_CAPTURE_OK;
  else process.env.FRESHCTX_CAPTURE_OK = priorCapture;
  if (priorOpenAi === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = priorOpenAi;
  if (priorHermes === undefined) delete process.env.HERMES_API_KEY;
  else process.env.HERMES_API_KEY = priorHermes;
  if (priorBase === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = priorBase;
});

test("stub payload marker detection", () => {
  assert.equal(isStubPayload(STUB_PAYLOAD_MARKER), true);
  assert.equal(isStubPayload("summarized context for task"), false);
  assert.equal(isFailClosedHermesMode("precompress-no-api-key"), true);
  assert.equal(isFailClosedHermesMode("compress"), false);
});

test("live budget-pressure runner reports blocked without inventing Hermes bytes", async () => {
  const priorCapture = process.env.FRESHCTX_CAPTURE_OK;
  delete process.env.FRESHCTX_CAPTURE_OK;

  const summary = await runNativeBudgetPressureLivePack({ skipReportWrite: true });
  assert.equal(summary.label, BUDGET_PRESSURE_LIVE_LABEL);
  assert.equal(summary.packId, BUDGET_PRESSURE_LAB_PACK_ID);

  if (!liveKeyPresent || !liveBaseConfigured || process.env.FRESHCTX_CAPTURE_OK === "1") {
    assert.equal(summary.blocked, true);
    assert.equal(summary.records, 0);
    assert.equal(summary.rows.length, 0);
    assert.ok(summary.blockedReasons.length > 0);
  }

  if (priorCapture === undefined) delete process.env.FRESHCTX_CAPTURE_OK;
  else process.env.FRESHCTX_CAPTURE_OK = priorCapture;
});

test(
  "live Hermes cells reach compress with non-stub payload when key, base URL, and host checkout are present",
  { skip: hermesHostReady && liveKeyPresent && liveBaseConfigured ? false : "live Hermes prerequisites missing" },
  async () => {
    const priorCapture = process.env.FRESHCTX_CAPTURE_OK;
    delete process.env.FRESHCTX_CAPTURE_OK;

    const traces = await listBudgetPressureTraces(ROOT);
    for (const trace of traces) {
      const result = await runHermesNativeTrace(trace, { budgetPressure: true });
      const capture = finalHermesNativeCapture(result);
      assert.ok(capture, `${trace.name}: missing hermes capture`);
      assert.equal(capture.nativeMode, "compress", `${trace.name}: expected live compress`);
      assert.equal(isStubPayload(capture.payloadText ?? ""), false, `${trace.name}: stub payload detected`);
    }

    const summary = await runNativeBudgetPressureLivePack({ skipReportWrite: true });
    assert.equal(summary.allLiveCompress, true);
    assert.equal(summary.stubCellCount, 0);

    if (priorCapture === undefined) delete process.env.FRESHCTX_CAPTURE_OK;
    else process.env.FRESHCTX_CAPTURE_OK = priorCapture;
  },
);

test(
  "live budget-pressure runner emits four baselines per trace when live Hermes prerequisites are present",
  { skip: hermesHostReady && liveKeyPresent && liveBaseConfigured ? false : "live Hermes prerequisites missing" },
  async () => {
    const priorCapture = process.env.FRESHCTX_CAPTURE_OK;
    delete process.env.FRESHCTX_CAPTURE_OK;

    const summary = await runNativeBudgetPressureLivePack({ skipReportWrite: true });
    assert.equal(summary.traces, 6);
    assert.equal(summary.records, 24);
    assert.equal(summary.allHermesNoOp, false);
    assert.equal(summary.allLiveCompress, true);
    const baselines = new Set(summary.rows.map((row) => row.baseline));
    assert.deepEqual(
      [...baselines].sort(),
      ["freshctx-file", "freshctx-region", "hermes-native", "pi-native"].sort(),
    );

    if (priorCapture === undefined) delete process.env.FRESHCTX_CAPTURE_OK;
    else process.env.FRESHCTX_CAPTURE_OK = priorCapture;
  },
);
