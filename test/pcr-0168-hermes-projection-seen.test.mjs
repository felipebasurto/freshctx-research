import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertFreshCtxProjectionSeen,
  freshctxBridgeLogLines,
  freshctxProjectionMissingReason,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import { CELLS } from "../docs/lab/multi-turn-trial/pack.mjs";
import { listProviderDumps, overlayRequests } from "../docs/lab/multi-turn-trial/auto-rpc.mjs";

const T1 = CELLS[0];
const T2 = CELLS[1];

/** Hermes session-title request: no tools, no history (measured, 1310 bytes). */
const TITLE_DUMP = JSON.stringify({
  model: "deepseek-v4-flash",
  instructions: "You name chat sessions.",
  input: [{ role: "user", content: "Lee el símbolo settleDailyLedger en src/settlement.ts" }],
});

const FIRST_DUMP = JSON.stringify({
  model: "deepseek-v4-flash",
  input: [{ role: "user", content: "Lee el símbolo settleDailyLedger en src/settlement.ts con scope=symbol" }],
  tools: [{ type: "function", name: "read_file" }],
});

/**
 * Post-read request as Hermes sends it when the bridge fell open: the raw
 * read_file output stays in place and nothing FreshCtx follows it. Shape
 * measured on 999703f with a bridge forced to exit 1 (PCR 0168 probe).
 */
const POST_READ_RAW_DUMP = JSON.stringify({
  model: "deepseek-v4-flash",
  input: [
    { role: "user", content: "Lee el símbolo settleDailyLedger en src/settlement.ts con scope=symbol" },
    { type: "function_call", call_id: "call_1", name: "read_file", arguments: '{"path":"src/settlement.ts"}' },
    { type: "function_call_output", call_id: "call_1", output: '{"content": "1|export function settleDailyLedger() { const MARKER_SETTLE = \\"ST0\\"; }"}' },
  ],
});

const POST_READ_PROJECTED_DUMP = JSON.stringify({
  model: "deepseek-v4-flash",
  input: [
    { role: "user", content: "Lee el símbolo settleDailyLedger en src/settlement.ts con scope=symbol" },
    { type: "function_call", call_id: "call_1", name: "read_file", arguments: '{"path":"src/settlement.ts"}' },
    { type: "function_call_output", call_id: "call_1", output: "[freshctx:fc_1 path=/work/src/settlement.ts] Current content is supplied in the live projection." },
    {
      role: "user",
      content:
        '<freshctx turn="0" selected="1" unresolved="0" budget-omitted="0"><freshctx-unit id="fc_1" path="src/settlement.ts" resolution="isolated-semantic-engine">const MARKER_SETTLE = "ST0";</freshctx-unit></freshctx>',
    },
  ],
});

const ENVELOPE_NO_UNIT_DUMP = JSON.stringify({
  model: "deepseek-v4-flash",
  input: [
    { role: "user", content: '<freshctx turn="0" selected="0" unresolved="1" budget-omitted="0">The following code is the current workspace state.</freshctx>' },
  ],
});

const AGENT_LOG_BRIDGE_FELL_OPEN = [
  "2026-09-02 23:47:34,165 INFO hermes_cli.plugins: Plugin 'freshctx' registered context engine: freshctx",
  "2026-09-02 23:47:41,002 WARNING freshctx.hermes: FreshCtx bridge select fell open (exit 1): Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'web-tree-sitter'",
].join("\n");

async function dumpDirWith(bodies) {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0168-dumps-"));
  for (const [index, body] of bodies.entries()) {
    const id = String(index + 1).padStart(3, "0");
    await writeFile(join(dir, `${id}.json`), body);
    await writeFile(join(dir, `${id}.scan.json`), JSON.stringify({ n: index + 1 }));
  }
  await writeFile(join(dir, "unmatched-001.json"), JSON.stringify({ n: 1, method: "GET", url: "/api/v1/models", unmatched: true }));
  return dir;
}

async function requestsFor(bodies, cell = T1) {
  const dir = await dumpDirWith(bodies);
  return overlayRequests(dir, [], await listProviderDumps(dir), cell);
}

test("PCR 0168: freshctx-ts t1 whose provider dumps carry no FreshCtx projection fails closed", async () => {
  const requests = await requestsFor([TITLE_DUMP, FIRST_DUMP, POST_READ_RAW_DUMP]);
  assert.equal(requests.length, 3, "three numbered dumps, none unmatched");
  assert.ok(requests.every((item) => item.hasFreshCtxUnit === false && item.hasFreshCtxEnvelope === false));

  const reason = freshctxProjectionMissingReason(requests, AGENT_LOG_BRIDGE_FELL_OPEN);
  assert.match(reason, /no FreshCtx projection in any of 3 t1 provider dumps/u);
  assert.match(reason, /FreshCtx bridge select fell open \(exit 1\)/u);
  assert.match(reason, /ERR_MODULE_NOT_FOUND/u);
  assert.throws(
    () => assertFreshCtxProjectionSeen(requests, AGENT_LOG_BRIDGE_FELL_OPEN, { arm: "freshctx-ts", cell: T1 }),
    /no FreshCtx projection in any of 3 t1 provider dumps[\s\S]*arm=freshctx-ts/u,
  );
});

test("PCR 0168: a silent fall-open names the absence of bridge lines", async () => {
  const requests = await requestsFor([POST_READ_RAW_DUMP]);
  const registeredOnly = "2026-09-02 23:47:34,165 INFO hermes_cli.plugins: Plugin 'freshctx' registered context engine: freshctx";
  assert.deepEqual(freshctxBridgeLogLines(registeredOnly), []);
  assert.match(
    freshctxProjectionMissingReason(requests, registeredOnly),
    /no FreshCtx bridge lines in HERMES_HOME logs/u,
  );
});

test("PCR 0168: one projected dump in t1 is enough, whichever position it holds", async () => {
  const projectedLast = await requestsFor([TITLE_DUMP, FIRST_DUMP, POST_READ_PROJECTED_DUMP]);
  assert.equal(freshctxProjectionMissingReason(projectedLast, ""), null);
  const titleLast = await requestsFor([FIRST_DUMP, POST_READ_PROJECTED_DUMP, TITLE_DUMP]);
  assert.equal(freshctxProjectionMissingReason(titleLast, ""), null);
  assert.doesNotThrow(() => assertFreshCtxProjectionSeen(titleLast, "", { arm: "freshctx-ts", cell: T1 }));
});

test("PCR 0168: an envelope without a unit is a projection; resolution stays the row's job", async () => {
  const requests = await requestsFor([ENVELOPE_NO_UNIT_DUMP]);
  assert.equal(requests[0].hasFreshCtxEnvelope, true);
  assert.equal(requests[0].hasFreshCtxUnit, false);
  assert.equal(freshctxProjectionMissingReason(requests, ""), null);
});

test("PCR 0168: the nothing arm and turns after t1 are not gated", async () => {
  const requests = await requestsFor([POST_READ_RAW_DUMP]);
  assert.doesNotThrow(() => assertFreshCtxProjectionSeen(requests, "", { arm: "nothing", cell: T1 }));
  const later = await requestsFor([POST_READ_RAW_DUMP], T2);
  assert.doesNotThrow(() => assertFreshCtxProjectionSeen(later, "", { arm: "freshctx-ts", cell: T2 }));
});
