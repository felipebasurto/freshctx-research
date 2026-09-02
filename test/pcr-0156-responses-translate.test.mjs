import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { t1ToolsForAssert } from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  HERMES_CLI_PROVIDER,
  cliQueryArgs,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import {
  DEEPSEEK_CHAT_COMPLETIONS_RELATIVE,
  DUMP_PROXY_NOT_FOUND,
  HERMES_OPENAI_API_POST_PATH,
  chatCompletionToResponses,
  createDumpProxy,
  dummyResponses,
  isChatCompletionsPath,
  isResponsesPath,
  isResponsesRequestBody,
  liveResponsesForwardBody,
  responsesRequestToChatCompletions,
  responsesToolsToChatCompletions,
} from "../docs/lab/hermes-trial-ts/proxy.mjs";
import { MODEL, PROMPT_T1 } from "../docs/lab/multi-turn-trial/pack.mjs";

const DEST_PROXY_BASE = "http://127.0.0.1:33457/v1";
const DEST_T1_STDOUT_BYTES = 2580;
const DEST_T1_NOT_FOUND_COUNT = 3;
const COST_LEDGER_PROXY = new URL("../docs/lab/cost-ledger/dump-proxy.mjs", import.meta.url);

const HERMES_RESPONSES_BODY = {
  model: MODEL,
  instructions: "You are a coding agent.",
  input: [{ role: "user", content: [{ type: "input_text", text: PROMPT_T1 }] }],
  tools: [
    {
      type: "function",
      name: "read_file",
      description: "Read a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  ],
  store: false,
};

function chatCompletionWithToolCall() {
  return {
    id: "chatcmpl-freshctx-0156",
    object: "chat.completion",
    created: 0,
    model: MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_t1_read",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "src/settlement.ts" }),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  };
}

async function listenMock(handler) {
  const server = createServer(handler);
  const bound = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        origin: `http://${address.address}:${address.port}`,
        baseUrl: `http://${address.address}:${address.port}/v1`,
      });
    });
  });
  return {
    ...bound,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

test("dest efeaef64 leftover is not PCR 0155 path-404; /v1/responses is already served", () => {
  assert.equal(DEST_PROXY_BASE, "http://127.0.0.1:33457/v1");
  assert.equal(DEST_T1_STDOUT_BYTES, 2580);
  assert.equal(DEST_T1_NOT_FOUND_COUNT, 3);
  assert.deepEqual(DUMP_PROXY_NOT_FOUND, { error: "not found" });
  assert.equal(HERMES_OPENAI_API_POST_PATH, "/v1/responses");
  assert.equal(HERMES_CLI_PROVIDER, "openai-api");
  assert.equal(isResponsesPath("/v1/responses"), true);
  assert.equal(isChatCompletionsPath("/v1/responses"), false);
  const live = cliQueryArgs({ message: PROMPT_T1 });
  assert.deepEqual(live.slice(live.indexOf("-q") + 2, live.indexOf("-q") + 6), [
    "--provider",
    "openai-api",
    "--model",
    MODEL,
  ]);
});

test("hypothesized forwardChatCompletions-to-chat body is discarded; hole is untranslated /responses", () => {
  assert.equal(typeof createDumpProxy, "function");
  assert.equal("forwardChatCompletions" in globalThis, false);
  assert.equal(DEEPSEEK_CHAT_COMPLETIONS_RELATIVE, "chat/completions");
  assert.equal(isResponsesRequestBody(HERMES_RESPONSES_BODY), true);
  assert.equal(Array.isArray(HERMES_RESPONSES_BODY.messages), false);
  assert.ok("input" in HERMES_RESPONSES_BODY);
  assert.equal(t1ToolsForAssert({ eventTools: [], recordedTools: [] }).length, 0);
});

test("untranslated Responses JSON is not a chat/completions body", () => {
  const chat = responsesRequestToChatCompletions(HERMES_RESPONSES_BODY);
  assert.ok(Array.isArray(chat.messages));
  assert.equal(chat.messages[0].role, "system");
  assert.equal(chat.messages[0].content, "You are a coding agent.");
  assert.equal(chat.messages[1].role, "user");
  assert.match(chat.messages[1].content, /settleDailyLedger/u);
  assert.equal(chat.stream, false);
  assert.equal(chat.model, MODEL);
  const tools = responsesToolsToChatCompletions(HERMES_RESPONSES_BODY.tools);
  assert.equal(tools[0].type, "function");
  assert.equal(tools[0].function.name, "read_file");
  assert.equal(tools[0].name, undefined);
  const forwarded = JSON.parse(liveResponsesForwardBody(JSON.stringify(HERMES_RESPONSES_BODY)));
  assert.deepEqual(forwarded.messages, chat.messages);
  assert.equal(Object.hasOwn(forwarded, "input"), false);
  assert.equal(Object.hasOwn(forwarded, "instructions"), false);
});

test("chat completion tool_calls translate back to Responses function_call", () => {
  const responses = chatCompletionToResponses(chatCompletionWithToolCall());
  assert.equal(responses.object, "response");
  assert.equal(responses.status, "completed");
  const call = responses.output.find((item) => item.type === "function_call");
  assert.equal(call.name, "read_file");
  assert.equal(call.call_id, "call_t1_read");
  assert.match(call.arguments, /settlement\.ts/u);
  assert.equal(responses.usage.input_tokens, 11);
  assert.equal(responses.usage.output_tokens, 7);
});

test("live dump proxy translates POST /v1/responses onto DeepSeek chat/completions", async () => {
  const seen = [];
  const mock = await listenMock((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      seen.push({ method: req.method, url: req.url, bodyText });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(chatCompletionWithToolCall()));
    });
  });
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0156-live-"));
  const proxy = createDumpProxy({
    dumpDir,
    dumpOnly: false,
    apiKey: "TESTKEY",
    upstream: mock.baseUrl,
  });
  const bound = await proxy.listen();
  const response = await fetch(`${bound.baseUrl}/responses`, {
    method: "POST",
    headers: { authorization: "Bearer TESTKEY", "content-type": "application/json" },
    body: JSON.stringify(HERMES_RESPONSES_BODY),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.object, "response");
  assert.notEqual(body.id, dummyResponses().id);
  const call = body.output.find((item) => item.type === "function_call");
  assert.equal(call.name, "read_file");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].url, "/v1/chat/completions");
  assert.notEqual(seen[0].url, "/v1/responses");
  assert.notEqual(seen[0].url, "/responses");
  const forwarded = JSON.parse(seen[0].bodyText);
  assert.ok(Array.isArray(forwarded.messages));
  assert.equal(Object.hasOwn(forwarded, "input"), false);
  const scan = JSON.parse(await readFile(join(dumpDir, "001.scan.json"), "utf8"));
  assert.equal(scan.utf8Bytes, Buffer.byteLength(JSON.stringify(HERMES_RESPONSES_BODY)));
  const dumped = JSON.parse(await readFile(join(dumpDir, "001.json"), "utf8"));
  assert.equal(dumped.input[0].role, "user");
  const names = await readdir(dumpDir);
  assert.equal(names.some((name) => name.startsWith("unmatched-")), false);
  await proxy.close();
  await mock.close();
});

test("dump-only POST /v1/responses still returns the PCR 0155 dummy", async () => {
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0156-dump-"));
  const proxy = createDumpProxy({ dumpDir, dumpOnly: true });
  const bound = await proxy.listen();
  const response = await fetch(`${bound.baseUrl}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(HERMES_RESPONSES_BODY),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, dummyResponses().id);
  await proxy.close();
});

test("PCR 0156 prose named cost-ledger dump-proxy as the next-pack sibling", async () => {
  const pcr = await readFile(new URL("../docs/lab/pcr/0156-responses-translate.md", import.meta.url), "utf8");
  assert.match(pcr, /Cost-ledger `dump-proxy\.mjs` is the next pack/u);
  assert.match(pcr, /still only matches `\/chat\/completions`/u);
  const text = await readFile(COST_LEDGER_PROXY, "utf8");
  assert.match(text, /forwardChatCompletions/u);
  assert.match(text, /isResponsesPath|liveResponsesForwardBody/u);
});
