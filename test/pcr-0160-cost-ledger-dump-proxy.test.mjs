import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  COST_LEDGER_DUMP_PROXY,
  DEST_71379F00,
  DEST_71379F00_SHA,
  DEST_DUMPS_MISSING_SIBLING,
  HERMES_TRIAL_TS_DUMP_PROXY,
  PAPER_DOLLARS_REFUSED,
  PASS_AT_1_REFUSED,
  assertNotPaperResult,
  destDumpsMissingReason,
  ingestFourTurnScanDir,
  ingestMultiTurnSummary,
} from "../docs/lab/cost-ledger/ingest.mjs";
import { accumulateTurns } from "../docs/lab/cost-ledger/ledger.mjs";
import {
  createCostLedgerDumpProxy,
  dummyChatCompletion,
  dummyResponses,
} from "../docs/lab/cost-ledger/dump-proxy.mjs";
import {
  FOUR_TURN_NOT_PAPER_REASON,
  SESSION_KIND_FOUR_TURN,
  SESSION_KIND_SHORT,
  assertLongSessionCost,
  classifySessionKind,
} from "../docs/lab/cost-ledger/session-kind.mjs";
import { usageFromResponseText } from "../docs/lab/cost-ledger/usage.mjs";
import {
  HERMES_OPENAI_API_POST_PATH,
  RESPONSES_STREAM_CONTENT_TYPE,
  consumeCodexResponsesStream,
  isResponsesPath,
} from "../docs/lab/hermes-trial-ts/proxy.mjs";
import { MODEL } from "../docs/lab/multi-turn-trial/pack.mjs";
import { TARGET_FILE, TARGET_SYMBOL } from "../docs/lab/pi-trial-ts/pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../docs/lab/cost-ledger/fixture/71379f00-four-turn-not-paper.json");
const pcrPath = join(here, "../docs/lab/pcr/0160-cost-ledger-dump-proxy.md");
const indexPath = join(here, "../docs/lab/INDEX.md");
const paperPath = join(here, "../docs/lab/pcr/0142-hermes-eight-turn-live-cost.md");
const OFFICIAL_TAP = "549/0/0/549";
const DOOR_BLOB = "f8771c93894095348185ef3453a3c2498355b3c6";
const LOCK_BLOB = "4a953591e4b175e9fd69f13d6012831b01116dce";
const DEST_WORK_NOTHING = `${DEST_71379F00}/docs/lab/multi-turn-trial/.work/hermes/nothing/${TARGET_FILE}`;

const HERMES_RESPONSES_BODY = {
  model: MODEL,
  instructions: "You are a coding agent.",
  input: [{ role: "user", content: [{ type: "input_text", text: "read settleDailyLedger" }] }],
  tools: [
    {
      type: "function",
      name: "read_file",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  ],
  store: false,
  stream: true,
};

test("dest 71379f00 leftover is cost-ledger dump-proxy sibling after a real t1-t4 print", async () => {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  assert.equal(DEST_71379F00_SHA, "71379f009d22d2487fb3396fb5de4b6cc3ab3bc9");
  assert.equal(DEST_71379F00, "/workspace/freshctx-measure-71379f00-multiturn");
  assert.equal(fixture.destSha, DEST_71379F00_SHA);
  assert.equal(fixture.destRoot, DEST_71379F00);
  assert.equal(fixture.notAPaperResult, true);
  assert.equal(fixture.passAt1, null);
  assert.equal(fixture.model, MODEL);
  const nothing = fixture.arms.hermes.nothing;
  const ts = fixture.arms.hermes["freshctx-ts"];
  assert.equal(nothing[0].id, "t1-read");
  assert.equal(nothing[0].toolCount, 1);
  assert.equal(nothing[0].hostReadArgsMatched, true);
  assert.equal(nothing[0].reply, "SETTLE=ST0");
  assert.equal(nothing[0].tools[0].toolName, "read_file");
  assert.equal(nothing[0].tools[0].args.path, DEST_WORK_NOTHING);
  assert.equal(nothing[0].tools[0].args.scope, "symbol");
  assert.equal(nothing[0].tools[0].args.selector, TARGET_SYMBOL);
  assert.equal(nothing[0].resolution, "none");
  assert.deepEqual(nothing[0].promptTokens, [null]);
  for (const cell of nothing.slice(1)) {
    assert.equal(cell.toolCount, 4);
    assert.equal(cell.resolution, "none");
    assert.deepEqual(cell.promptTokens, [null]);
  }
  assert.equal(ts[0].toolCount, 1);
  assert.equal(ts[0].resolution, "none");
  for (const cell of ts.slice(1)) {
    assert.equal(cell.toolCount, 4);
    assert.equal(cell.resolution, "none");
  }
  assert.equal(ts[3].id, "t4-unchanged");
  assert.equal(ts[3].resolution, "none");
  assert.equal(OFFICIAL_TAP, "549/0/0/549");
  assert.equal(DOOR_BLOB, "f8771c93894095348185ef3453a3c2498355b3c6");
  assert.equal(LOCK_BLOB, "4a953591e4b175e9fd69f13d6012831b01116dce");
  assert.equal(HERMES_TRIAL_TS_DUMP_PROXY, "docs/lab/hermes-trial-ts/proxy.mjs");
  assert.equal(COST_LEDGER_DUMP_PROXY, "docs/lab/cost-ledger/dump-proxy.mjs");
});

test("cost-ledger dump-proxy serves Hermes openai-api /v1/responses and keeps dump-only tokens null", async () => {
  assert.equal(isResponsesPath(HERMES_OPENAI_API_POST_PATH), true);
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0160-dump-only-"));
  const proxy = createCostLedgerDumpProxy({ dumpDir, dumpOnly: true });
  try {
    const bound = await proxy.listen();
    const response = await fetch(`${bound.origin}${HERMES_OPENAI_API_POST_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(HERMES_RESPONSES_BODY),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/u);
    assert.equal(response.headers.get("content-type"), RESPONSES_STREAM_CONTENT_TYPE);
    const sse = await response.text();
    const consumed = consumeCodexResponsesStream(sse);
    assert.equal(consumed.sawTerminal, true);
    assert.equal(consumed.status, "completed");
    assert.equal(proxy.scans[0].promptTokens, null);
    assert.equal(proxy.scans[0].dumpOnly, true);
    assert.equal(dummyResponses().id, `resp_${dummyChatCompletion().id}`);
  } finally {
    await proxy.close();
    await rm(dumpDir, { recursive: true, force: true });
  }
});

test("cost-ledger dump-proxy translates live Responses and writes provider usage, not invented $", async () => {
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0160-dump-live-"));
  const upstream = createServer((req, res) => {
    if (req.method === "POST" && /\/chat\/completions$/u.test(req.url ?? "")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "chatcmpl-0160",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "SETTLE=ST0" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 111, completion_tokens: 3, total_tokens: 114 },
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const proxy = createCostLedgerDumpProxy({
    dumpDir,
    dumpOnly: false,
    apiKey: "sk-test-not-a-real-key",
    upstream: `http://127.0.0.1:${upstream.address().port}/v1`,
  });
  try {
    const bound = await proxy.listen();
    const response = await fetch(`${bound.origin}${HERMES_OPENAI_API_POST_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(HERMES_RESPONSES_BODY),
    });
    assert.equal(response.status, 200);
    assert.equal(proxy.scans[0].promptTokens, 111);
    assert.equal(proxy.scans[0].completionTokens, 3);
    assert.equal(proxy.scans[0].usageFrom, "provider-response");
    const usageFile = JSON.parse(await readFile(join(dumpDir, "001.response.usage.json"), "utf8"));
    assert.equal(usageFile.prompt_tokens, 111);
    assert.doesNotMatch(JSON.stringify(usageFile), /0\.0[0-9]+/u);
  } finally {
    await proxy.close();
    await new Promise((resolve) => upstream.close(resolve));
    await rm(dumpDir, { recursive: true, force: true });
  }
});

test("Responses usage maps input_tokens and four-turn ingest refuses paper $ and Pass@1", async () => {
  const fromResponses = usageFromResponseText(
    JSON.stringify({ usage: { input_tokens: 50, output_tokens: 2, total_tokens: 52 } }),
  );
  assert.equal(fromResponses.promptTokens, 50);
  assert.equal(fromResponses.completionTokens, 2);
  assert.equal(fromResponses.usageFrom, "provider-response");

  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const ingested = ingestMultiTurnSummary(fixture, { destMounted: false });
  assertNotPaperResult(ingested);
  assert.equal(ingested.sessionKind, SESSION_KIND_FOUR_TURN);
  assert.equal(ingested.paperDollars, false);
  assert.equal(ingested.passAt1, null);
  assert.equal(ingested.destSha, DEST_71379F00_SHA);
  assert.match(ingested.destSkip, new RegExp(DEST_71379F00.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(ingested.destSkip, /hermes-trial-ts\/proxy\.mjs/u);
  assert.match(ingested.destSkip, /cost-ledger\/dump-proxy\.mjs/u);
  const nothing = ingested.hosts.hermes.nothing;
  assert.equal(nothing.length, 4);
  assert.equal(nothing[0].promptTokens, null);
  assert.equal(nothing[3].resolution, "none");
  const ledger = accumulateTurns(nothing);
  assert.equal(ledger.costProxyUsd, null);
  assert.equal(ledger.promptTokens, null);
  assert.throws(() => assertLongSessionCost(nothing, { sessionKind: SESSION_KIND_FOUR_TURN }), /paper \$/u);
  assert.equal(classifySessionKind(nothing, { sessionKind: SESSION_KIND_FOUR_TURN }).kind, SESSION_KIND_FOUR_TURN);
  const unlabeled = [
    { arm: "nothing", turn: 1, cellId: "t1-read", requestBytes: 1, model: MODEL },
    { arm: "nothing", turn: 2, cellId: "t2-settle", requestBytes: 1, model: MODEL },
    { arm: "nothing", turn: 3, cellId: "t3-settle", requestBytes: 1, model: MODEL },
    { arm: "nothing", turn: 4, cellId: "t4-unchanged", requestBytes: 1, model: MODEL },
  ];
  assert.equal(classifySessionKind(unlabeled).kind, SESSION_KIND_SHORT);
  assert.throws(
    () => ingestMultiTurnSummary({ ...fixture, notAPaperResult: false }),
    /notAPaperResult/u,
  );
  assert.throws(
    () => ingestMultiTurnSummary({ ...fixture, passAt1: 0.5 }),
    new RegExp(PASS_AT_1_REFUSED.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
  );
  assert.throws(
    () => assertNotPaperResult({ ...ingested, paperDollars: true }),
    new RegExp(PAPER_DOLLARS_REFUSED.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
  );
  assert.match(FOUR_TURN_NOT_PAPER_REASON, /not a long-session paper \$/u);
});

test("dest 71379f00 dumps honest-skip the exact missing sibling when dest is not mounted", async () => {
  let destMounted = false;
  try {
    await access(DEST_71379F00);
    destMounted = true;
  } catch {
    destMounted = false;
  }
  const reason = destDumpsMissingReason();
  assert.equal(reason, `dest dumps missing: ${DEST_71379F00} (${DEST_DUMPS_MISSING_SIBLING})`);
  if (!destMounted) {
    assert.match(reason, /hermes-trial-ts\/proxy\.mjs dump-proxy scans vs docs\/lab\/cost-ledger\/dump-proxy\.mjs dump path/u);
  } else {
    const summary = JSON.parse(await readFile(join(DEST_71379F00, "docs/lab/multi-turn-trial/.work/capture/summary.json"), "utf8"));
    const ingested = ingestMultiTurnSummary(summary, { destMounted: true });
    assertNotPaperResult(ingested);
    assert.equal(ingested.destSkip, null);
  }
});

test("ingestFourTurnScanDir keeps hermes-trial-ts promptTokens null and does not invent $", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0160-scans-"));
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(dir, "001.scan.json"),
      `${JSON.stringify({ n: 1, utf8Bytes: 80, promptTokens: null, resolution: "none" }, null, 2)}\n`,
    );
    await writeFile(
      join(dir, "002.scan.json"),
      `${JSON.stringify({ n: 2, utf8Bytes: 90, promptTokens: null, resolution: "none" }, null, 2)}\n`,
    );
    await writeFile(
      join(dir, "003.scan.json"),
      `${JSON.stringify({ n: 3, utf8Bytes: 100, promptTokens: null, resolution: "none" }, null, 2)}\n`,
    );
    await writeFile(
      join(dir, "004.scan.json"),
      `${JSON.stringify({ n: 4, utf8Bytes: 110, promptTokens: null, resolution: "none" }, null, 2)}\n`,
    );
    const ingested = await ingestFourTurnScanDir(dir, { host: "hermes", arm: "nothing" });
    assert.equal(ingested.notAPaperResult, true);
    assert.equal(ingested.paperDollars, false);
    assert.equal(ingested.passAt1, null);
    assert.equal(ingested.turns[0].promptTokens, null);
    assert.equal(accumulateTurns(ingested.turns).costProxyUsd, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PCR 0160 records dest print, official 549, 0142 not replaced, door/lock hold", async () => {
  const pcr = await readFile(pcrPath, "utf8");
  const index = await readFile(indexPath, "utf8");
  const paper = await readFile(paperPath, "utf8");
  assert.match(pcr, /PCR 0160/u);
  assert.match(pcr, /71379f009d22d2487fb3396fb5de4b6cc3ab3bc9/u);
  assert.match(pcr, /freshctx-measure-71379f00-multiturn/u);
  assert.match(pcr, /hostReadArgsMatched=true/u);
  assert.match(pcr, /SETTLE=ST0/u);
  assert.match(pcr, /resolution=none/u);
  assert.match(pcr, /549\/0\/0\/549/u);
  assert.match(pcr, /does not replace PCR 0142/iu);
  assert.match(pcr, /f8771c93894095348185ef3453a3c2498355b3c6/u);
  assert.match(pcr, /4a953591e4b175e9fd69f13d6012831b01116dce/u);
  assert.match(pcr, /hermes-trial-ts/u);
  assert.match(pcr, /cost-ledger/u);
  assert.match(pcr, /notAPaperResult/u);
  assert.match(pcr, /promptTokens/u);
  assert.doesNotMatch(pcr, /Pass@1 0\./u);
  assert.doesNotMatch(pcr, /\$0\.\d{2,}.*paper/iu);
  assert.match(pcr, /Did not reopen PCR 0157/u);
  assert.match(pcr, /Did not reopen PCR 0158/u);
  assert.match(pcr, /Did not reopen PCR 0159/u);
  assert.match(index, /\[0160\]\(pcr\/0160-cost-ledger-dump-proxy\.md\)/u);
  const idx0159 = index.indexOf("[0159](pcr/0159-hermes-dest-cwd.md)");
  const idx0160 = index.indexOf("[0160](pcr/0160-cost-ledger-dump-proxy.md)");
  assert.ok(idx0159 >= 0 && idx0160 > idx0159);
  assert.match(paper, /d8cdd3d5/u);
});
