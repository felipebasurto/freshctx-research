import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
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
  HERMES_CODEX_NO_TERMINAL,
  HERMES_CODEX_TERMINAL_EVENT_TYPES,
  HERMES_OPENAI_API_POST_PATH,
  RESPONSES_STREAM_CONTENT_TYPE,
  chatCompletionToResponses,
  consumeCodexResponsesStream,
  createDumpProxy,
  dummyResponses,
  encodeResponsesSse,
  isChatCompletionsPath,
  isResponsesPath,
  parseResponsesSse,
  responsesToStreamEvents,
  wantsResponsesStream,
} from "../docs/lab/hermes-trial-ts/proxy.mjs";
import { MODEL, PROMPT_T1 } from "../docs/lab/multi-turn-trial/pack.mjs";

const DEST_SHA = "371457c74bbfd2b90717c8ac083b8ea6370924f4";
const DEST_ROOT = "/workspace/freshctx-measure-371457c7-multiturn";
const DEST_PROXY_BASE = "http://127.0.0.1:36637/v1";
const DEST_T1_STDOUT_BYTES = 2687;
const DEST_T1_STDERR_BYTES = 0;
const DEST_T1_EXIT = 0;
const DEST_STDOUT_PHRASE = "Codex Responses stream did not emit a terminal response";
const DEST_AUTO_RPC_THROW =
  "Error: t1-read recorded no host tools (arm=nothing): []";

const HERMES_RESPONSES_STREAM_BODY = {
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
  stream: true,
};

function chatCompletionWithToolCall() {
  return {
    id: "chatcmpl-freshctx-0157",
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

test("dest 371457c7 leftover is not PCR 0156 JSON wrap; stream:true dumps already land", () => {
  assert.equal(DEST_SHA, "371457c74bbfd2b90717c8ac083b8ea6370924f4");
  assert.equal(DEST_ROOT, "/workspace/freshctx-measure-371457c7-multiturn");
  assert.equal(DEST_PROXY_BASE, "http://127.0.0.1:36637/v1");
  assert.equal(DEST_T1_STDOUT_BYTES, 2687);
  assert.equal(DEST_T1_STDERR_BYTES, 0);
  assert.equal(DEST_T1_EXIT, 0);
  assert.equal(DEST_STDOUT_PHRASE, HERMES_CODEX_NO_TERMINAL);
  assert.equal(
    DEST_AUTO_RPC_THROW,
    "Error: t1-read recorded no host tools (arm=nothing): []",
  );
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
  assert.equal(wantsResponsesStream(HERMES_RESPONSES_STREAM_BODY), true);
  assert.equal(wantsResponsesStream({ ...HERMES_RESPONSES_STREAM_BODY, stream: false }), false);
  assert.equal(wantsResponsesStream({ input: [] }), false);
  assert.equal(t1ToolsForAssert({ eventTools: [], recordedTools: [] }).length, 0);
});

test("0156 JSON wrap is not a Codex terminal stream event", () => {
  const wrapped = chatCompletionToResponses(chatCompletionWithToolCall());
  assert.equal(wrapped.object, "response");
  assert.equal(wrapped.status, "completed");
  assert.equal(Object.hasOwn(wrapped, "type"), false);
  assert.equal(HERMES_CODEX_TERMINAL_EVENT_TYPES.has(wrapped.object), false);
  assert.equal(HERMES_CODEX_TERMINAL_EVENT_TYPES.has(wrapped.status), false);
  assert.equal(RESPONSES_STREAM_CONTENT_TYPE, "text/event-stream");
  assert.notEqual(RESPONSES_STREAM_CONTENT_TYPE, "application/json");
  assert.throws(
    () => consumeCodexResponsesStream(JSON.stringify(wrapped)),
    (error) =>
      error instanceof Error && error.message === HERMES_CODEX_NO_TERMINAL,
  );
});

test("Hermes-shaped consumer accepts output_item.done plus response.completed SSE", () => {
  const wrapped = chatCompletionToResponses(chatCompletionWithToolCall());
  const events = responsesToStreamEvents(wrapped);
  assert.equal(events.some((event) => event.type === "response.output_item.done"), true);
  assert.equal(events.some((event) => event.type === "response.completed"), true);
  const itemDone = events.find((event) => event.type === "response.output_item.done");
  assert.equal(itemDone.item.type, "function_call");
  assert.equal(itemDone.item.name, "read_file");
  const completed = events.find((event) => event.type === "response.completed");
  assert.equal(completed.response.status, "completed");
  assert.equal(completed.response.object, "response");

  const sse = encodeResponsesSse(events);
  assert.match(sse, /^event: response\.output_item\.done\n/u);
  assert.match(sse, /^event: response\.completed\n/mu);
  assert.match(sse, /data: \{/u);
  assert.doesNotMatch(sse, /data: \[DONE\]/u);
  const parsed = parseResponsesSse(sse);
  assert.deepEqual(
    parsed.map((event) => event.type),
    events.map((event) => event.type),
  );

  const consumed = consumeCodexResponsesStream(sse);
  assert.equal(consumed.sawTerminal, true);
  assert.equal(consumed.status, "completed");
  const call = consumed.output.find((item) => item.type === "function_call");
  assert.equal(call.name, "read_file");
  assert.equal(call.call_id, "call_t1_read");
  assert.match(call.arguments, /settlement\.ts/u);
});

test("live dump proxy streams POST /v1/responses when Hermes sends stream:true", async () => {
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
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0157-live-stream-"));
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
    body: JSON.stringify(HERMES_RESPONSES_STREAM_BODY),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/u);
  const sse = await response.text();
  const consumed = consumeCodexResponsesStream(sse);
  assert.equal(consumed.sawTerminal, true);
  const call = consumed.output.find((item) => item.type === "function_call");
  assert.equal(call.name, "read_file");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "/v1/chat/completions");
  const forwarded = JSON.parse(seen[0].bodyText);
  assert.equal(forwarded.stream, false);
  assert.equal(Object.hasOwn(forwarded, "input"), false);
  const dumped = JSON.parse(await readFile(join(dumpDir, "001.json"), "utf8"));
  assert.equal(dumped.stream, true);
  await proxy.close();
  await mock.close();
});

test("non-stream JSON path still wraps a completed Responses object", async () => {
  const mock = await listenMock((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(chatCompletionWithToolCall()));
    });
  });
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0157-json-"));
  const proxy = createDumpProxy({
    dumpDir,
    dumpOnly: false,
    apiKey: "TESTKEY",
    upstream: mock.baseUrl,
  });
  const bound = await proxy.listen();
  const body = { ...HERMES_RESPONSES_STREAM_BODY };
  delete body.stream;
  const response = await fetch(`${bound.baseUrl}/responses`, {
    method: "POST",
    headers: { authorization: "Bearer TESTKEY", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/u);
  const parsed = await response.json();
  assert.equal(parsed.object, "response");
  assert.equal(parsed.status, "completed");
  const call = parsed.output.find((item) => item.type === "function_call");
  assert.equal(call.name, "read_file");
  await proxy.close();
  await mock.close();
});

test("dump-only stream:true still uses the PCR 0155 dummy as SSE", async () => {
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0157-dump-stream-"));
  const proxy = createDumpProxy({ dumpDir, dumpOnly: true });
  const bound = await proxy.listen();
  const response = await fetch(`${bound.baseUrl}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(HERMES_RESPONSES_STREAM_BODY),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/u);
  const consumed = consumeCodexResponsesStream(await response.text());
  assert.equal(consumed.sawTerminal, true);
  assert.equal(consumed.id, dummyResponses().id);
  await proxy.close();
});

test("upstream stays DeepSeek chat/completions; 0156 translate is not discarded", () => {
  assert.equal(DEEPSEEK_CHAT_COMPLETIONS_RELATIVE, "chat/completions");
  assert.equal(typeof chatCompletionToResponses, "function");
});
