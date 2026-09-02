import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { isProviderDumpName } from "../docs/lab/hermes-trial-ts/proxy.mjs";
import { CELLS } from "../docs/lab/multi-turn-trial/pack.mjs";
import { listProviderDumps, overlayRequests } from "../docs/lab/multi-turn-trial/auto-rpc.mjs";
import { normalizeResolution } from "../docs/lab/multi-turn-trial/scan.mjs";

/**
 * Hermes `openai-api` GETs `/api/v1/models` many times per turn. The dump proxy
 * answers 404 and persists `unmatched-NNN.json` metadata beside the provider
 * payloads. Measured on locked host 999703f, dest layout, freshctx-ts arm:
 * 6 provider dumps and 103 unmatched records in one run.
 */
const UNMATCHED_RECORD = JSON.stringify(
  { n: 1, method: "GET", url: "/api/v1/models", unmatched: true, at: "2026-09-02T22:37:46.583Z" },
  null,
  2,
);

const AGENT_DUMP_WITH_UNIT = JSON.stringify({
  model: "deepseek-v4-flash",
  input: [
    {
      role: "user",
      content:
        '<freshctx turn="0" selected="1" unresolved="0" budget-omitted="0"><freshctx-unit id="fc_1" path="src/settlement.ts" resolution="isolated-semantic-engine">const MARKER_SETTLE = "ST0";</freshctx-unit></freshctx>',
    },
  ],
  usage: { prompt_tokens: 4242 },
});

async function dumpDirWithUnmatchedTail() {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0167-dumps-"));
  await writeFile(join(dir, "001.json"), AGENT_DUMP_WITH_UNIT);
  await writeFile(join(dir, "001.scan.json"), JSON.stringify({ n: 1 }));
  await writeFile(join(dir, "unmatched-001.json"), UNMATCHED_RECORD);
  await writeFile(join(dir, "unmatched-002.json"), UNMATCHED_RECORD);
  await writeFile(join(dir, "force-host-read.tools.jsonl"), "");
  return dir;
}

test("PCR 0167: only numbered dumps are provider payloads", () => {
  assert.equal(isProviderDumpName("001.json"), true);
  assert.equal(isProviderDumpName("104.json"), true);
  assert.equal(isProviderDumpName("001.scan.json"), false);
  assert.equal(isProviderDumpName("unmatched-001.json"), false);
  assert.equal(isProviderDumpName("force-host-read.tools.jsonl"), false);
  assert.equal(isProviderDumpName(undefined), false);
});

test("PCR 0167: the turn's request list drops the proxy's unmatched records", async () => {
  const dir = await dumpDirWithUnmatchedTail();
  const onDisk = (await readdir(dir)).filter((name) => name.endsWith(".json") && !name.endsWith(".scan.json"));
  assert.ok(onDisk.includes("unmatched-001.json"), "the fixture keeps the proxy's 404 records on disk");

  const dumps = await listProviderDumps(dir);
  assert.deepEqual(dumps, ["001.json"]);

  const requests = await overlayRequests(dir, [], dumps, CELLS[0]);
  assert.equal(requests.length, 1);
  assert.equal(requests.at(-1).hasFreshCtxUnit, true);
  assert.equal(requests.at(-1).hasFreshCtxEnvelope, true);
  assert.equal(requests.at(-1).promptTokens, 4242);
  assert.equal(
    normalizeResolution(requests.at(-1).resolution, "freshctx-ts"),
    "isolated-semantic-engine",
    "an unmatched GET record must not become the turn's reported resolution",
  );
});

test("PCR 0167: an unmatched record scanned as a payload reports none", async () => {
  const requests = await overlayRequests(
    await dumpDirWithUnmatchedTail(),
    [],
    ["001.json", "unmatched-001.json", "unmatched-002.json"],
    CELLS[0],
  );
  assert.equal(requests.at(-1).hasFreshCtxEnvelope, false);
  assert.equal(requests.at(-1).hasFreshCtxUnit, false);
  assert.equal(normalizeResolution(requests.at(-1).resolution, "freshctx-ts"), "none");
});
