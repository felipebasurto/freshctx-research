import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { t1ToolsForAssert } from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  HERMES_CLI_PROVIDER,
  HERMES_CLI_REJECTED_PROVIDER,
  HERMES_CLI_UNKNOWN_PROVIDER,
  cliQueryArgs,
  cliQueryChannelReason,
  hermesCliQueryFailedReason,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import {
  DUMP_PROXY_NOT_FOUND,
  HERMES_OPENAI_API_POST_PATH,
  createDumpProxy,
  dummyChatCompletion,
  dummyResponses,
  isChatCompletionsPath,
  isResponsesPath,
  requestPathname,
} from "../docs/lab/hermes-trial-ts/proxy.mjs";
import { MODEL, PROMPT_T1 } from "../docs/lab/multi-turn-trial/pack.mjs";

/**
 * Dest efeaef64 t1 spawn argv (do not invent). PCR 0154 leftover is done:
 * `--provider openai-api` was accepted.
 */
const DEST_T1_QUERY_ARGV = [
  "chat",
  "-q",
  PROMPT_T1,
  "--provider",
  "openai-api",
  "--model",
  MODEL,
];

const DEST_PROXY_BASE = "http://127.0.0.1:33457/v1";
const DEST_T1_STDOUT_BYTES = 2580;
const DEST_T1_NOT_FOUND_COUNT = 3;

test("dest efeaef64 t1 spawn is openai-api; leftover is not PCR 0154 unknown provider", () => {
  const q = DEST_T1_QUERY_ARGV.indexOf("-q");
  assert.ok(q >= 0);
  assert.equal(DEST_T1_QUERY_ARGV[q + 1], PROMPT_T1);
  assert.deepEqual(DEST_T1_QUERY_ARGV.slice(q + 2, q + 6), ["--provider", "openai-api", "--model", MODEL]);
  assert.equal(HERMES_CLI_PROVIDER, "openai-api");
  assert.equal(HERMES_CLI_REJECTED_PROVIDER, "openai");
  const live = cliQueryArgs({ message: PROMPT_T1 });
  assert.deepEqual(live.slice(live.indexOf("-q") + 2, live.indexOf("-q") + 6), [
    "--provider",
    "openai-api",
    "--model",
    MODEL,
  ]);
  assert.equal(hermesCliQueryFailedReason({ code: 0, stderr: "", stdout: "" }), null);
  assert.notEqual(hermesCliQueryFailedReason({ code: 0, stderr: "", stdout: "" }), HERMES_CLI_UNKNOWN_PROVIDER);
});

test("dest efeaef64 host tools 0 because dump-proxy 404ed unmatched POST /v1/responses", () => {
  assert.equal(DEST_PROXY_BASE, "http://127.0.0.1:33457/v1");
  assert.equal(DEST_T1_STDOUT_BYTES, 2580);
  assert.equal(DEST_T1_NOT_FOUND_COUNT, 3);
  assert.deepEqual(DUMP_PROXY_NOT_FOUND, { error: "not found" });
  assert.equal(HERMES_OPENAI_API_POST_PATH, "/v1/responses");
  assert.equal(requestPathname("/v1/responses"), "/v1/responses");
  assert.equal(isChatCompletionsPath("/v1/chat/completions"), true);
  assert.equal(isChatCompletionsPath("/v1/responses"), false);
  assert.equal(isResponsesPath("/v1/responses"), true);
  assert.equal(isResponsesPath("/responses"), true);
  assert.equal(isResponsesPath("/v1/chat/completions"), false);
  assert.equal(
    t1ToolsForAssert({ eventTools: [], recordedTools: [] }).length,
    0,
    "empty recording is still empty; dest never reached DeepSeek",
  );
});

test("dest empty requests/ is not a new recording-only throw", () => {
  assert.equal(cliQueryChannelReason({ stderr: "", stdout: "x".repeat(DEST_T1_STDOUT_BYTES) }), null);
  assert.equal(
    hermesCliQueryFailedReason({
      code: 0,
      stderr: "",
      stdout: `HTTP 404 ${JSON.stringify(DUMP_PROXY_NOT_FOUND)}`,
    }),
    null,
    "do not add another recording-only throw for dest 404 leftovers",
  );
  assert.doesNotMatch(JSON.stringify(DUMP_PROXY_NOT_FOUND), /recorded no host tools/u);
});

test("dump proxy persist unmatched method+url on 404", async () => {
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0155-unmatched-"));
  const proxy = createDumpProxy({ dumpDir, dumpOnly: true });
  const bound = await proxy.listen();
  const response = await fetch(`${bound.origin}/v1/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL }),
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), DUMP_PROXY_NOT_FOUND);
  const names = (await readdir(dumpDir)).sort();
  assert.ok(names.some((name) => name.startsWith("unmatched-") && name.endsWith(".json")));
  const record = JSON.parse(await readFile(join(dumpDir, names.find((name) => name.startsWith("unmatched-"))), "utf8"));
  assert.equal(record.method, "POST");
  assert.equal(record.url, "/v1/widgets");
  assert.equal(record.unmatched, true);
  assert.equal(names.some((name) => name.endsWith(".scan.json")), false);
  await proxy.close();
});

test("dump proxy serves POST /v1/responses so openai-api can reach dump-only DeepSeek path", async () => {
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0155-responses-"));
  const proxy = createDumpProxy({ dumpDir, dumpOnly: true });
  const bound = await proxy.listen();
  const payload = { model: MODEL, input: [{ role: "user", content: "title" }] };
  const response = await fetch(`${bound.baseUrl}/responses`, {
    method: "POST",
    headers: { authorization: "Bearer SECRETKEY", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const dummy = dummyResponses();
  assert.equal(body.id, dummy.id);
  assert.equal(body.object, "response");
  assert.equal(body.status, "completed");
  const scan = JSON.parse(await readFile(join(dumpDir, "001.scan.json"), "utf8"));
  assert.equal(scan.utf8Bytes, Buffer.byteLength(JSON.stringify(payload)));
  const names = await readdir(dumpDir);
  assert.equal(names.some((name) => name.startsWith("unmatched-")), false);
  await proxy.close();
});

test("dump proxy still dumps POST /v1/chat/completions", async () => {
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0155-chat-"));
  const proxy = createDumpProxy({ dumpDir, dumpOnly: true });
  const bound = await proxy.listen();
  const payload = { model: MODEL, messages: [{ role: "user", content: "hi" }] };
  const response = await fetch(`${bound.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, dummyChatCompletion().id);
  const scan = JSON.parse(await readFile(join(dumpDir, "001.scan.json"), "utf8"));
  assert.equal(scan.utf8Bytes, Buffer.byteLength(JSON.stringify(payload)));
  await proxy.close();
});
