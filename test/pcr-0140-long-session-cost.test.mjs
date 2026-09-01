import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { costProxyUsd } from "../docs/lab/cost-ledger/cost-proxy.mjs";
import { createCostLedgerDumpProxy } from "../docs/lab/cost-ledger/dump-proxy.mjs";
import {
  TWO_TURN_0135_BYTES,
  longSessionCiFixture,
  twoTurnIngestFixture,
} from "../docs/lab/cost-ledger/fixture-data.mjs";
import {
  ingestHostArmDumps,
  ingestLongSession,
  ingestScans,
  loadFixtureHostArm,
  redactHeaders,
  turnFromScan,
} from "../docs/lab/cost-ledger/ingest.mjs";
import { accumulateTurns, compareArmTotals } from "../docs/lab/cost-ledger/ledger.mjs";
import { materializeFixtureDumps } from "../docs/lab/cost-ledger/materialize.mjs";
import {
  COST_COMPARE_ARMS,
  HOSTS,
  MIN_LONG_SESSION_TURNS,
  MODEL,
  SESSION_TURNS,
  validateHost,
  validateModel,
} from "../docs/lab/cost-ledger/pack.mjs";
import {
  formatHostArmTotalsTsv,
  formatHostLedgerTsv,
  hostLedgerTsvHeader,
  ledgersFromFixture,
} from "../docs/lab/cost-ledger/print-ledger.mjs";
import {
  SESSION_KIND_LONG,
  SESSION_KIND_SHORT,
  SESSION_KIND_TWO_TURN,
  assertLongSessionCost,
  classifySessionKind,
} from "../docs/lab/cost-ledger/session-kind.mjs";
import { usageFromResponseText, usageFromScan } from "../docs/lab/cost-ledger/usage.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packDir = join(here, "../docs/lab/cost-ledger");
const printLedgerPath = join(packDir, "print-ledger.mjs");
const pcrPath = join(here, "../docs/lab/pcr/0140-long-session-real-cost.md");
const fixtureJsonPath = join(packDir, "fixture/long-session-ci.json");
const twoTurnJsonPath = join(packDir, "fixture/two-turn-ingest.json");
const dumpsRoot = join(packDir, "fixture/dumps");

const SECRET_LEAK = /(?:sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._\-]{8,}|DEEPSEEK_API_KEY\s*=\s*\S+)/u;

test("PCR 0140 pins DeepSeek v4 flash only and Pi/Hermes compare arms", () => {
  assert.equal(MODEL, "deepseek-v4-flash");
  assert.doesNotThrow(() => validateModel(MODEL));
  assert.throws(() => validateModel("deepseek-v4-pro"), /deepseek-v4-flash/u);
  assert.deepEqual(HOSTS, ["pi", "hermes"]);
  assert.deepEqual(COST_COMPARE_ARMS, ["nothing", "freshctx-ts"]);
  assert.doesNotThrow(() => validateHost("pi"));
  assert.doesNotThrow(() => validateHost("hermes"));
  assert.throws(() => validateHost("cursor"), /pi\|hermes/u);
  assert.equal(MIN_LONG_SESSION_TURNS, SESSION_TURNS);
  assert.ok(SESSION_TURNS >= 8);
});

test("PCR 0140 two-turn ingest is INVALID for long-session cost", () => {
  const twoTurn = [
    { arm: "nothing", turn: 1, cellId: "t1-read", requestBytes: TWO_TURN_0135_BYTES.nothing[0], model: MODEL },
    { arm: "nothing", turn: 2, cellId: "t2-settle", requestBytes: TWO_TURN_0135_BYTES.nothing[1], model: MODEL },
  ];
  const classified = classifySessionKind(twoTurn);
  assert.equal(classified.kind, SESSION_KIND_TWO_TURN);
  assert.equal(classified.validForLongSessionCost, false);
  assert.match(classified.reason, /two-turn ingest is INVALID/u);
  assert.throws(() => assertLongSessionCost(twoTurn), /two-turn ingest is INVALID/u);
  assert.throws(
    () => ingestLongSession(twoTurn, { arm: "nothing", host: "hermes", source: "two-turn" }),
    /two-turn ingest is INVALID/u,
  );
  const fourTurn = [
    { arm: "nothing", turn: 1, cellId: "t1-read", requestBytes: 1, model: MODEL },
    { arm: "nothing", turn: 2, cellId: "t2-settle", requestBytes: 1, model: MODEL },
    { arm: "nothing", turn: 3, cellId: "t3-settle", requestBytes: 1, model: MODEL },
    { arm: "nothing", turn: 4, cellId: "t4-unchanged", requestBytes: 1, model: MODEL },
  ];
  assert.equal(classifySessionKind(fourTurn).kind, SESSION_KIND_SHORT);
  assert.throws(() => assertLongSessionCost(fourTurn), /requires >= 8 turns/u);
});

test("PCR 0140 eight-turn fixture session is long-session and not two-turn ingest", () => {
  const fixture = longSessionCiFixture();
  assert.equal(fixture.label, "fixture");
  assert.equal(fixture.liveHost, false);
  assert.equal(fixture.sessionKind, SESSION_KIND_LONG);
  const piNothing = fixture.hosts.pi.arms.nothing.turns;
  assert.equal(piNothing.length, 8);
  assert.equal(classifySessionKind(piNothing).kind, SESSION_KIND_LONG);
  assert.doesNotThrow(() => assertLongSessionCost(piNothing));
  const ingested = ingestLongSession(piNothing, { arm: "nothing", host: "pi" });
  assert.equal(ingested.length, 8);
  assert.equal(ingested[0].cellId, "t1-read");
  assert.equal(ingested.at(-1).cellId, "t8-ask-again");
});

test("PCR 0140 committed two-turn fixture is rejected as a long-session cost table", async () => {
  const twoTurn = JSON.parse(await readFile(twoTurnJsonPath, "utf8"));
  assert.equal(twoTurn.sessionKind, SESSION_KIND_TWO_TURN);
  assert.equal(twoTurn.liveHost, false);
  assert.equal(twoTurn.hosts.hermes.arms.nothing.turns.length, 2);
  assert.equal(twoTurn.hosts.hermes.arms.nothing.turns[0].requestBytes, 83603);
  assert.equal(twoTurn.hosts.hermes.arms.nothing.turns[1].requestBytes, 32999);
  assert.equal(twoTurn.hosts.hermes.arms.nothing.turns[0].promptTokens, null);
  assert.throws(() => loadFixtureHostArm(twoTurn, "hermes", "nothing"), /two-turn ingest is INVALID/u);
  assert.throws(() => ledgersFromFixture(twoTurn), /two-turn ingest is INVALID/u);
});

test("PCR 0140 usage comes from the provider response, not a dump-only dummy", () => {
  const fromResponse = usageFromResponseText(
    JSON.stringify({ usage: { prompt_tokens: 8000, completion_tokens: 40, total_tokens: 8040 } }),
  );
  assert.equal(fromResponse.promptTokens, 8000);
  assert.equal(fromResponse.completionTokens, 40);
  assert.equal(fromResponse.usageFrom, "provider-response");
  const requestOnly = usageFromResponseText(JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "hi" }] }));
  assert.equal(requestOnly.promptTokens, null);
  assert.equal(requestOnly.usageFrom, "none");
  const dummy = usageFromScan({
    dumpOnly: true,
    usageFrom: "dummy",
    promptTokens: 0,
    completionTokens: 0,
    utf8Bytes: 1000,
  });
  assert.equal(dummy.promptTokens, null);
  const ignoredRequest = usageFromScan({ usageFrom: "request-body", promptTokens: 99, utf8Bytes: 1000 });
  assert.equal(ignoredRequest.promptTokens, null);
  const turn = turnFromScan(
    { utf8Bytes: 1000, dumpOnly: true, promptTokens: 0, completionTokens: 0, usageFrom: "dummy" },
    { arm: "nothing", turn: 1, cellId: "t1-read" },
  );
  assert.equal(turn.promptTokens, null);
  assert.equal(turn.completionTokens, null);
});

test("PCR 0140 CI fixture dumps accumulate real usage fields and cited flash $", async () => {
  const fixture = JSON.parse(await readFile(fixtureJsonPath, "utf8"));
  assert.equal(fixture.label, "fixture");
  assert.equal(fixture.liveHost, false);
  const loaded = ledgersFromFixture(fixture);
  assert.equal(loaded.liveHost, false);
  for (const host of HOSTS) {
    const nothing = loaded.hostLedgers[host].nothing;
    const ts = loaded.hostLedgers[host]["freshctx-ts"];
    assert.equal(nothing.turns, 8);
    assert.equal(nothing.promptTokens, 80600);
    assert.equal(nothing.completionTokens, 320);
    assert.equal(nothing.tokenSource, "provider");
    assert.equal(nothing.requestBytes, 301000);
    assert.equal(ts.promptTokens, 54900);
    assert.equal(ts.requestBytes, 218500);
    assert.equal(
      nothing.costProxyUsd,
      costProxyUsd({ promptTokens: 80600, completionTokens: 320 }),
    );
    const compared = compareArmTotals({ nothing, "freshctx-ts": ts }, "nothing");
    const tsRow = compared.rows.find((row) => row.arm === "freshctx-ts");
    assert.ok(tsRow.promptTokensDelta < 0);
    assert.ok(tsRow.costProxyUsdDelta < 0);
  }
  const tsv = formatHostLedgerTsv(loaded.hostLedgers);
  assert.match(hostLedgerTsvHeader(), /^host\tarm\tturn\t/u);
  assert.match(tsv, /pi\tnothing\t1\t32000\t8000\t/u);
  assert.match(tsv, /hermes\tfreshctx-ts\t8\t27000\t6800\t/u);
  const totals = formatHostArmTotalsTsv(loaded.hostLedgers);
  assert.match(totals, /pi\tnothing\t8\t301000\t80600\t/u);
});

test("PCR 0140 CI ingest walks committed fixture dumps", async () => {
  const turns = await ingestHostArmDumps({ root: dumpsRoot, host: "pi", arm: "freshctx-ts" });
  assert.equal(turns.length, 8);
  assert.equal(turns[0].promptTokens, 7000);
  assert.equal(turns[0].usageFrom, "provider-response");
  const ledger = accumulateTurns(turns);
  assert.equal(ledger.promptTokens, 54900);
  const tmp = await mkdtemp(join(tmpdir(), "freshctx-pcr-0140-"));
  try {
    await materializeFixtureDumps(longSessionCiFixture(), tmp);
    const rematerialized = await ingestHostArmDumps({ root: tmp, host: "hermes", arm: "nothing" });
    assert.equal(rematerialized.length, 8);
    assert.equal(accumulateTurns(rematerialized).promptTokens, 80600);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("PCR 0140 print-ledger --fixture reprints CI dumps and fail-closes two-turn", () => {
  const fixtureRun = spawnSync(process.execPath, [printLedgerPath, "--fixture"], {
    encoding: "utf8",
    env: { ...process.env, DEEPSEEK_API_KEY: "sk-SHOULD-NOT-PRINT" },
  });
  assert.equal(fixtureRun.status, 0);
  assert.match(fixtureRun.stdout, /label=fixture/u);
  assert.match(fixtureRun.stdout, /liveHost=false/u);
  assert.match(fixtureRun.stdout, /pi\tnothing\t8\t301000\t80600\t/u);
  assert.doesNotMatch(fixtureRun.stdout + fixtureRun.stderr, SECRET_LEAK);
  const twoTurnRun = spawnSync(process.execPath, [printLedgerPath, "--fixture", twoTurnJsonPath], {
    encoding: "utf8",
    env: { ...process.env },
  });
  assert.equal(twoTurnRun.status, 1);
  assert.match(twoTurnRun.stderr, /two-turn ingest is INVALID/u);
});

test("PCR 0140 dump proxy keeps dump-only tokens missing and captures response usage", async () => {
  const dumpOnlyDir = await mkdtemp(join(tmpdir(), "freshctx-pcr-0140-dump-only-"));
  const liveDir = await mkdtemp(join(tmpdir(), "freshctx-pcr-0140-dump-live-"));
  const upstream = createServer((req, res) => {
    if (req.method === "POST" && /\/chat\/completions$/u.test(req.url ?? "")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ usage: { prompt_tokens: 1234, completion_tokens: 5, total_tokens: 1239 } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const dumpOnly = createCostLedgerDumpProxy({ dumpDir: dumpOnlyDir, dumpOnly: true });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = upstream.address().port;
  const live = createCostLedgerDumpProxy({
    dumpDir: liveDir,
    dumpOnly: false,
    apiKey: "sk-test-not-a-real-key",
    upstream: `http://127.0.0.1:${upstreamPort}/v1`,
  });
  try {
    const dumpOnlyBound = await dumpOnly.listen();
    const liveBound = await live.listen();
    const dummy = await fetch(`${dumpOnlyBound.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer sk-SHOULD-NOT-PRINT" },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "SETTLE=?" }] }),
    });
    assert.equal(dummy.status, 200);
    assert.equal(dumpOnly.scans[0].promptTokens, null);
    assert.equal(dumpOnly.scans[0].dumpOnly, true);
    const forwarded = await fetch(`${liveBound.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "SETTLE=?" }] }),
    });
    assert.equal(forwarded.status, 200);
    assert.equal(live.scans[0].promptTokens, 1234);
    assert.equal(live.scans[0].completionTokens, 5);
    assert.equal(live.scans[0].usageFrom, "provider-response");
    const usageFile = JSON.parse(await readFile(join(liveDir, "001.response.usage.json"), "utf8"));
    assert.equal(usageFile.prompt_tokens, 1234);
    const redacted = redactHeaders({ Authorization: "Bearer sk-SHOULD-NOT-PRINT" });
    assert.equal(redacted.Authorization, "[redacted]");
  } finally {
    await dumpOnly.close();
    await live.close();
    await new Promise((resolve) => upstream.close(resolve));
    await rm(dumpOnlyDir, { recursive: true, force: true });
    await rm(liveDir, { recursive: true, force: true });
  }
});

test("PCR 0140 ingestScans still maps a single scan for the 0137 helper", () => {
  const ingested = ingestScans([{ n: 1, utf8Bytes: 1234, promptTokens: 90, completionTokens: 7 }], {
    arm: "freshctx-ts",
    turn: 2,
    cellId: "t2-settle",
  });
  assert.equal(ingested[0].requestBytes, 1234);
  assert.equal(ingested[0].promptTokens, 90);
});

test("PCR 0140 prose says Tree-sitter and Isolated Semantic Engine, never a nickname", async () => {
  const files = [
    join(packDir, "PLAN.md"),
    join(packDir, "BATTERY.md"),
    join(packDir, "REPORT.md"),
    join(packDir, "README.md"),
    pcrPath,
  ];
  for (const path of files) {
    const text = await readFile(path, "utf8");
    assert.match(text, /Tree-sitter/u);
    assert.match(text, /Isolated Semantic Engine/u);
    assert.doesNotMatch(text, /tsitter|tree sitter|TreeSitter|TS engine/u);
    assert.doesNotMatch(text, SECRET_LEAK);
  }
});

test("PCR 0140 does not invent official TAP or live host dollars", async () => {
  const report = await readFile(join(packDir, "REPORT.md"), "utf8");
  const pcr = await readFile(pcrPath, "utf8");
  for (const text of [report, pcr]) {
    assert.match(text, /harness-only/u);
    assert.match(text, /549\/0\/0\/549/u);
    assert.match(text, /two-turn ingest is INVALID/iu);
    assert.match(text, /No live long-session table/u);
    assert.doesNotMatch(text, /AUTORESEARCH_SCORE/u);
    assert.doesNotMatch(text, SECRET_LEAK);
  }
});
