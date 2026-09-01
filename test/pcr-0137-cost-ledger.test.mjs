import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  COST_PROXY_CITED_AT,
  COST_PROXY_SOURCE_URL,
  COST_PROXY_VERSION,
  FLASH_RATES_USD_PER_MTOK,
  assertFlashOnly,
  costProxyUsd,
  estimatePromptTokensFromBytes,
  ratesForSchedule,
} from "../docs/lab/cost-ledger/cost-proxy.mjs";
import {
  ingestScans,
  redactHeaders,
  redactRecord,
  turnFromScan,
} from "../docs/lab/cost-ledger/ingest.mjs";
import {
  accumulateTurns,
  compareArmTotals,
  emptyLedger,
  formatMissing,
  recordTurn,
} from "../docs/lab/cost-ledger/ledger.mjs";
import {
  ARMS,
  CELLS,
  MODEL,
  armUsesFreshCtx,
  armUsesTreeSitter,
  freshCtxEnvForArm,
  validateArm,
  validateModel,
} from "../docs/lab/cost-ledger/pack.mjs";
import {
  formatArmTotalsTsv,
  formatLedgerTsv,
  ledgerTsvHeader,
} from "../docs/lab/cost-ledger/print-ledger.mjs";
import { PROMPT_REREAD, SESSION_TURNS, promptForCell } from "../docs/lab/cost-ledger/session.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packDir = join(here, "../docs/lab/cost-ledger");
const printLedgerPath = join(packDir, "print-ledger.mjs");
const fixturePath = join(packDir, "fixture/synthetic-session.json");

function syntheticTurns(arm, requestBytes) {
  return requestBytes.map((bytes, index) => ({
    arm,
    turn: index + 1,
    cellId: `t${index + 1}`,
    requestBytes: bytes,
    promptTokens: null,
    completionTokens: null,
    model: MODEL,
    source: "synthetic",
  }));
}

function providerTurns(arm, pairs) {
  return pairs.map(([requestBytes, promptTokens, completionTokens], index) => ({
    arm,
    turn: index + 1,
    cellId: `t${index + 1}`,
    requestBytes,
    promptTokens,
    completionTokens,
    model: MODEL,
    source: "provider",
  }));
}

test("PCR 0137 pins DeepSeek v4 flash only and rejects pro", () => {
  assert.equal(MODEL, "deepseek-v4-flash");
  assert.doesNotThrow(() => validateModel(MODEL));
  assert.doesNotThrow(() => assertFlashOnly(MODEL));
  assert.throws(() => validateModel("deepseek-v4-pro"), /deepseek-v4-flash/u);
  assert.throws(() => assertFlashOnly("deepseek-v4-pro"), /deepseek-v4-flash/u);
  assert.throws(() => validateModel("deepseek-chat"), /deepseek-v4-flash/u);
});

test("PCR 0137 arms are FreshCtx off / on without Tree-sitter / on with Tree-sitter", () => {
  assert.deepEqual(ARMS, ["nothing", "freshctx-no-ts", "freshctx-ts"]);
  assert.equal(armUsesFreshCtx("nothing"), false);
  assert.equal(armUsesFreshCtx("freshctx-no-ts"), true);
  assert.equal(armUsesFreshCtx("freshctx-ts"), true);
  assert.equal(armUsesTreeSitter("nothing"), false);
  assert.equal(armUsesTreeSitter("freshctx-no-ts"), false);
  assert.equal(armUsesTreeSitter("freshctx-ts"), true);
  assert.deepEqual(freshCtxEnvForArm("freshctx-no-ts"), {
    FRESHCTX_ISOLATED_SEMANTIC_ENGINE: "off",
  });
  assert.deepEqual(freshCtxEnvForArm("freshctx-ts"), {});
  assert.deepEqual(freshCtxEnvForArm("nothing"), {});
  assert.throws(() => validateArm("with-symbol"), /nothing\|freshctx-no-ts\|freshctx-ts/u);
});

test("PCR 0137 long-session cells accumulate across many turns", () => {
  assert.ok(SESSION_TURNS >= 8, "long session must be many turns, not the two-turn measure packs");
  assert.equal(CELLS.length, SESSION_TURNS);
  assert.equal(CELLS[0].id, "t1-read");
  assert.equal(CELLS.at(-1).turn, SESSION_TURNS);
  const turns = new Set(CELLS.map((cell) => cell.turn));
  assert.equal(turns.size, SESSION_TURNS);
  assert.match(promptForCell(CELLS[0]), /settleDailyLedger/u);
  assert.match(PROMPT_REREAD, /scope=symbol/u);
});

test("PCR 0137 cited flash cost-proxy table is versioned and cache-unaware by default", () => {
  assert.equal(COST_PROXY_VERSION, 1);
  assert.equal(COST_PROXY_SOURCE_URL, "https://api-docs.deepseek.com/quick_start/pricing/");
  assert.equal(COST_PROXY_CITED_AT, "2026-09-01");
  assert.deepEqual(FLASH_RATES_USD_PER_MTOK["off-peak"], {
    cacheHitInput: 0.007,
    cacheMissInput: 0.22,
    output: 0.66,
  });
  assert.deepEqual(FLASH_RATES_USD_PER_MTOK.peak, {
    cacheHitInput: 0.014,
    cacheMissInput: 0.44,
    output: 1.32,
  });
  const offPeakMiss = ratesForSchedule({ schedule: "off-peak", cache: "miss" });
  assert.equal(offPeakMiss.inputUsdPerMtok, 0.22);
  assert.equal(offPeakMiss.outputUsdPerMtok, 0.66);
  const peakHit = ratesForSchedule({ schedule: "peak", cache: "hit" });
  assert.equal(peakHit.inputUsdPerMtok, 0.014);
  const usd = costProxyUsd({
    promptTokens: 1_000_000,
    completionTokens: 1_000_000,
    schedule: "off-peak",
    cache: "miss",
  });
  assert.equal(usd, 0.22 + 0.66);
});

test("PCR 0137 missing provider tokens stay missing and are not invented as live host scores", () => {
  const ledger = accumulateTurns(syntheticTurns("nothing", [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]));
  assert.equal(ledger.arm, "nothing");
  assert.equal(ledger.turns, 8);
  assert.equal(ledger.requestBytes, 36000);
  assert.equal(ledger.promptTokens, null);
  assert.equal(ledger.completionTokens, null);
  assert.equal(ledger.costProxyUsd, null);
  assert.equal(ledger.tokenSource, "bytes-estimate");
  assert.equal(ledger.estimatedPromptTokens, estimatePromptTokensFromBytes(36000));
  assert.equal(typeof ledger.costProxyUsdEstimated, "number");
  assert.equal(formatMissing(ledger.promptTokens), "—");
  assert.equal(formatMissing(null), "—");
  assert.equal(ledger.rows.every((row) => row.source === "synthetic"), true);
  assert.equal(ledger.rows.every((row) => row.promptTokens === null), true);
});

test("PCR 0137 accumulates provider tokens and cost proxy across arms", () => {
  const nothing = accumulateTurns(
    providerTurns("nothing", [
      [32000, 8000, 40],
      [33000, 8200, 40],
      [35000, 9000, 40],
      [36000, 9400, 40],
      [38000, 10000, 40],
      [40000, 11000, 40],
      [42000, 12000, 40],
      [45000, 13000, 40],
    ]),
  );
  const ts = accumulateTurns(
    providerTurns("freshctx-ts", [
      [28000, 7000, 40],
      [27000, 6800, 40],
      [27500, 6900, 40],
      [27400, 6880, 40],
      [27300, 6860, 40],
      [27200, 6840, 40],
      [27100, 6820, 40],
      [27000, 6800, 40],
    ]),
  );
  assert.equal(nothing.requestBytes, 301000);
  assert.equal(nothing.promptTokens, 80600);
  assert.equal(nothing.completionTokens, 320);
  assert.equal(nothing.tokenSource, "provider");
  assert.equal(ts.requestBytes, 218500);
  const compared = compareArmTotals({ nothing, "freshctx-ts": ts }, "nothing");
  assert.equal(compared.baseline, "nothing");
  const tsRow = compared.rows.find((row) => row.arm === "freshctx-ts");
  assert.equal(tsRow.requestBytesDelta, 218500 - 301000);
  assert.ok(tsRow.costProxyUsdDelta < 0);
  assert.equal(nothing.costProxyVersion, COST_PROXY_VERSION);
});

test("PCR 0137 recordTurn keeps selection of arms independent of print order", () => {
  let ledger = emptyLedger("freshctx-no-ts");
  ledger = recordTurn(ledger, {
    arm: "freshctx-no-ts",
    turn: 2,
    cellId: "t2-settle",
    requestBytes: 200,
    promptTokens: 50,
    completionTokens: 5,
    model: MODEL,
    source: "provider",
  });
  ledger = recordTurn(ledger, {
    arm: "freshctx-no-ts",
    turn: 1,
    cellId: "t1-read",
    requestBytes: 100,
    promptTokens: 20,
    completionTokens: 5,
    model: MODEL,
    source: "provider",
  });
  assert.deepEqual(
    ledger.rows.map((row) => row.turn),
    [1, 2],
  );
  assert.equal(ledger.requestBytes, 300);
  assert.equal(ledger.rows[1].cumulativeRequestBytes, 300);
});

test("PCR 0137 ingest maps scan.json bytes and redacts secrets", () => {
  const scan = {
    n: 1,
    utf8Bytes: 1234,
    promptTokens: 90,
    completionTokens: 7,
    resolution: "isolated-semantic-engine",
  };
  const turn = turnFromScan(scan, { arm: "freshctx-ts", turn: 2, cellId: "t2-settle" });
  assert.equal(turn.requestBytes, 1234);
  assert.equal(turn.promptTokens, 90);
  assert.equal(turn.completionTokens, 7);
  assert.equal(turn.model, MODEL);
  assert.equal(turn.source, "scan");
  const redacted = redactHeaders({ Authorization: "Bearer SECRETKEY", accept: "application/json" });
  assert.equal(redacted.Authorization, "[redacted]");
  const record = redactRecord({
    headers: { "x-api-key": "sk-live-secret" },
    body: { apiKey: "sk-live-secret", model: MODEL },
  });
  assert.equal(record.headers["x-api-key"], "[redacted]");
  assert.equal(record.body.apiKey, "[redacted]");
  const ingested = ingestScans([scan], { arm: "freshctx-ts", turn: 2, cellId: "t2-settle" });
  assert.equal(ingested[0].requestBytes, 1234);
});

test("PCR 0137 print-ledger TSV includes cumulative bytes tokens and cost proxy", () => {
  const header = ledgerTsvHeader();
  for (const column of [
    "arm",
    "turn",
    "request_bytes",
    "prompt_tokens",
    "completion_tokens",
    "token_source",
    "cost_proxy_usd",
    "cumulative_request_bytes",
    "cumulative_prompt_tokens",
    "cumulative_cost_proxy_usd",
  ]) {
    assert.match(header, new RegExp(`(^|\\t)${column}(\\t|$)`, "u"));
  }
  const ledger = accumulateTurns(
    providerTurns("nothing", [
      [1000, 100, 10],
      [2000, 200, 10],
    ]),
  );
  const tsv = formatLedgerTsv({ nothing: ledger });
  assert.match(tsv, /^arm\tturn\t/u);
  assert.match(tsv, /nothing\t1\t1000\t100\t/u);
  assert.match(tsv, /nothing\t2\t2000\t200\t/u);
  const totals = formatArmTotalsTsv({ nothing: ledger });
  assert.match(totals, /nothing\t2\t3000\t300\t/u);
});

test("PCR 0137 print-ledger CLI fail-closes when no capture exists", () => {
  const result = spawnSync(process.execPath, [printLedgerPath], {
    encoding: "utf8",
    env: { ...process.env, COST_LEDGER_CAPTURE: join(tmpdir(), "freshctx-cost-ledger-missing-capture") },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No capture yet/u);
  assert.doesNotMatch(result.stdout + result.stderr, /sk-|SECRETKEY|api[_-]?key/iu);
});

test("PCR 0137 synthetic fixture is labeled synthetic and never a live host score", async () => {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  assert.equal(fixture.label, "synthetic");
  assert.equal(fixture.liveHost, false);
  assert.equal(fixture.model, MODEL);
  assert.ok(fixture.arms.nothing.turns.length >= 8);
  assert.ok(fixture.arms["freshctx-no-ts"].turns.length >= 8);
  assert.ok(fixture.arms["freshctx-ts"].turns.length >= 8);
  const ledgers = Object.fromEntries(
    ARMS.map((arm) => [arm, accumulateTurns(fixture.arms[arm].turns)]),
  );
  assert.equal(ledgers.nothing.tokenSource === "provider" || ledgers.nothing.tokenSource === "bytes-estimate", true);
  assert.ok(ledgers.nothing.requestBytes > ledgers["freshctx-ts"].requestBytes);
  const compared = compareArmTotals(ledgers, "nothing");
  const ts = compared.rows.find((row) => row.arm === "freshctx-ts");
  assert.ok(ts.requestBytesDelta < 0);
});

test("PCR 0137 pack prose says Tree-sitter and Isolated Semantic Engine, never a nickname", async () => {
  const files = [
    join(packDir, "PLAN.md"),
    join(packDir, "BATTERY.md"),
    join(packDir, "REPORT.md"),
    join(packDir, "README.md"),
    join(here, "../docs/lab/pcr/0137-long-session-cost-ledger.md"),
  ];
  for (const path of files) {
    const text = await readFile(path, "utf8");
    assert.match(text, /Tree-sitter/u);
    assert.match(text, /Isolated Semantic Engine/u);
    assert.doesNotMatch(text, /tsitter|tree sitter|TreeSitter|TS engine/u);
    assert.doesNotMatch(text, /sk-[A-Za-z0-9]{8,}|DEEPSEEK_API_KEY=.+/u);
  }
});

test("PCR 0137 does not invent official TAP or live host scores in REPORT", async () => {
  const report = await readFile(join(packDir, "REPORT.md"), "utf8");
  assert.match(report, /harness-only/u);
  assert.match(report, /549\/0\/0\/549/u);
  assert.doesNotMatch(report, /AUTORESEARCH_SCORE/u);
  assert.match(report, /No live long-session table/u);
});
