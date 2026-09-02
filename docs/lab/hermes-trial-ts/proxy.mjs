import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { MARKER_V0, MARKER_V1, SIBLING_MARKER, TARGET_FILE, TARGET_SYMBOL } from "./pack.mjs";
import { resolutionFromStringifiedPayload } from "./resolution-from-stringified.mjs";

const DEFAULT_UPSTREAM = "https://api.deepseek.com/v1";

/** Dest efeaef64 catch-all body. Do not invent a different 404 shape. */
export const DUMP_PROXY_NOT_FOUND = { error: "not found" };

/**
 * Hermes Agent `openai-api` overlay is `codex_responses`.
 * OPENAI_BASE_URL=`http://127.0.0.1:33457/v1` POSTs this path.
 */
export const HERMES_OPENAI_API_POST_PATH = "/v1/responses";

export function requestPathname(url) {
  const raw = String(url ?? "");
  try {
    return new URL(raw, "http://dump-proxy.invalid").pathname;
  } catch {
    return raw.split("?")[0] ?? "";
  }
}

export function isChatCompletionsPath(url) {
  return /\/chat\/completions$/u.test(requestPathname(url));
}

export function isResponsesPath(url) {
  return /\/responses$/u.test(requestPathname(url));
}

/**
 * DeepSeek Hermes overlay is `openai_chat` (NousResearch/hermes-agent
 * providers.py). Official chat docs are POST `/chat/completions`.
 * PCR 0155 live path forwarded Hermes Responses JSON to upstream
 * `responses` untranslated. This leftover translates to that chat path.
 */
export const DEEPSEEK_CHAT_COMPLETIONS_RELATIVE = "chat/completions";

/**
 * Hermes openai-api overlay is Codex Responses streaming
 * (`NousResearch/hermes-agent` `agent/codex_runtime.py`
 * `_consume_codex_event_stream`). `client.responses.create(stream=True)`
 * iterates SSE frames. A single JSON `object:"response"` is not an event.
 * Measured dest 371457c7 stdout: this exact throw.
 */
export const HERMES_CODEX_NO_TERMINAL = "Codex Responses stream did not emit a terminal response";

/** Hermes `_TERMINAL_EVENT_TYPES`. Do not invent other names. */
export const HERMES_CODEX_TERMINAL_EVENT_TYPES = new Set([
  "response.completed",
  "response.incomplete",
  "response.failed",
]);

/** OpenAI Python SDK `_streaming.py` SSE decoder + official Responses wire. */
export const RESPONSES_STREAM_CONTENT_TYPE = "text/event-stream";

export function isResponsesRequestBody(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "input"));
}

export function wantsResponsesStream(value) {
  if (typeof value === "string") {
    try {
      return wantsResponsesStream(JSON.parse(value));
    } catch {
      return false;
    }
  }
  return Boolean(value && typeof value === "object" && value.stream === true);
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : String(content);
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("");
}

export function responsesToolsToChatCompletions(tools) {
  if (!Array.isArray(tools)) return undefined;
  return tools.map((tool) => {
    if (!tool || typeof tool !== "object") return tool;
    if (tool.function && typeof tool.function === "object") return tool;
    if (tool.type === "function" && typeof tool.name === "string") {
      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description ?? "",
          parameters: tool.parameters ?? { type: "object", properties: {} },
        },
      };
    }
    return tool;
  });
}

export function responsesInputToMessages(input, instructions) {
  const messages = [];
  if (typeof instructions === "string" && instructions.trim()) {
    messages.push({ role: "system", content: instructions });
  }
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
    return messages;
  }
  if (!Array.isArray(input)) return messages;

  const pendingToolCalls = [];
  function flushToolCalls() {
    if (!pendingToolCalls.length) return;
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: pendingToolCalls.splice(0, pendingToolCalls.length),
    });
  }

  for (const item of input) {
    if (typeof item === "string") {
      flushToolCalls();
      messages.push({ role: "user", content: item });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const type = item.type;
    if (type === "function_call") {
      pendingToolCalls.push({
        id: item.call_id || item.id,
        type: "function",
        function: {
          name: item.name,
          arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
        },
      });
      continue;
    }
    if (type === "function_call_output") {
      flushToolCalls();
      messages.push({
        role: "tool",
        tool_call_id: item.call_id || item.id,
        content: textFromContent(item.output),
      });
      continue;
    }
    const role = item.role;
    if (role) {
      flushToolCalls();
      messages.push({ role, content: textFromContent(item.content) });
    }
  }
  flushToolCalls();
  return messages;
}

export function responsesRequestToChatCompletions(parsed) {
  const body = {
    model: parsed.model,
    messages: responsesInputToMessages(parsed.input, parsed.instructions),
  };
  const tools = responsesToolsToChatCompletions(parsed.tools);
  if (tools) body.tools = tools;
  if (parsed.tool_choice !== undefined) body.tool_choice = parsed.tool_choice;
  if (parsed.temperature !== undefined) body.temperature = parsed.temperature;
  if (parsed.max_output_tokens !== undefined) body.max_tokens = parsed.max_output_tokens;
  if (parsed.parallel_tool_calls !== undefined) body.parallel_tool_calls = parsed.parallel_tool_calls;
  body.stream = false;
  return body;
}

export function liveResponsesForwardBody(bodyText) {
  const parsed = JSON.parse(bodyText);
  if (Array.isArray(parsed?.messages) && !isResponsesRequestBody(parsed)) {
    return bodyText;
  }
  return JSON.stringify(responsesRequestToChatCompletions(parsed));
}

export function chatCompletionToResponses(parsed, { requestModel } = {}) {
  if (parsed && parsed.object === "response") return parsed;
  const choice = parsed?.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const content = typeof message.content === "string" ? message.content : "";
  const output = [];
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const call of toolCalls) {
    output.push({
      id: call.id ? `fc_${call.id}` : "fc_freshctx",
      type: "function_call",
      call_id: call.id ?? "call_freshctx",
      name: call.function?.name ?? "",
      arguments: call.function?.arguments ?? "{}",
      status: "completed",
    });
  }
  if (content || output.length === 0) {
    output.push({
      id: "msg_freshctx_upstream",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: content }],
    });
  }
  const usage = parsed?.usage ?? {};
  return {
    id: parsed?.id ? `resp_${parsed.id}` : "resp_freshctx_translated",
    object: "response",
    created_at: parsed?.created ?? 0,
    status: "completed",
    model: parsed?.model ?? requestModel ?? "deepseek-v4-flash",
    output,
    output_text: content,
    usage: {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
      total_tokens: usage.total_tokens ?? 0,
    },
  };
}

export function responsesToStreamEvents(response) {
  const events = [];
  const output = Array.isArray(response?.output) ? response.output : [];
  let sequence = 0;
  for (const [outputIndex, item] of output.entries()) {
    events.push({
      type: "response.output_item.done",
      output_index: outputIndex,
      sequence_number: sequence,
      item,
    });
    sequence += 1;
  }
  events.push({
    type: "response.completed",
    sequence_number: sequence,
    response,
  });
  return events;
}

export function encodeResponsesSse(events) {
  return events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
}

export function parseResponsesSse(text) {
  const events = [];
  const blocks = String(text ?? "").split(/\r?\n\r?\n/u);
  for (const block of blocks) {
    const dataLines = [];
    for (const line of block.split(/\r?\n/u)) {
      if (line.startsWith("data:")) {
        const value = line.slice(5).startsWith(" ") ? line.slice(6) : line.slice(5);
        dataLines.push(value);
      }
    }
    if (dataLines.length === 0) continue;
    const data = dataLines.join("\n");
    if (data.startsWith("[DONE]")) continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      // skip non-JSON chatter
    }
  }
  return events;
}

/**
 * Hermes-shaped consumer. Same terminal set and output_item.done rule as
 * `_consume_codex_event_stream`. Terminal event is required when no items
 * arrived. Content is never read from `response.completed.response.output`.
 */
export function consumeCodexResponsesStream(sseText) {
  const events = parseResponsesSse(sseText);
  const output = [];
  let sawTerminal = false;
  let status = "completed";
  let id;
  let usage;
  for (const event of events) {
    const eventType = typeof event?.type === "string" ? event.type : "";
    if (eventType === "response.output_item.done" && event.item != null) {
      output.push(event.item);
      continue;
    }
    if (HERMES_CODEX_TERMINAL_EVENT_TYPES.has(eventType)) {
      sawTerminal = true;
      const resp = event.response;
      if (resp && typeof resp === "object") {
        if (typeof resp.status === "string") status = resp.status;
        if (resp.id != null) id = resp.id;
        if (resp.usage != null) usage = resp.usage;
      }
      if (eventType === "response.completed") status = status || "completed";
      if (eventType === "response.incomplete") status = status || "incomplete";
      if (eventType === "response.failed") status = status || "failed";
      break;
    }
  }
  if (!sawTerminal && output.length === 0) {
    throw new Error(HERMES_CODEX_NO_TERMINAL);
  }
  return { output, sawTerminal, status, id, usage };
}

export function dummyChatCompletion({ content = "SETTLE=ST0" } = {}) {
  return {
    id: "freshctx-hermes-trial-dummy",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

export function dummyResponses({ content = "SETTLE=ST0" } = {}) {
  return {
    id: "freshctx-hermes-trial-dummy-response",
    object: "response",
    created_at: 0,
    status: "completed",
    model: "deepseek-v4-flash",
    output: [
      {
        id: "msg_freshctx_hermes_trial",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: content }],
      },
    ],
    output_text: content,
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}

export function scanProviderPayload(text) {
  const usageMatch = /"prompt_tokens"\s*:\s*(\d+)/u.exec(text);
  const promptTokens = usageMatch ? Number(usageMatch[1]) : null;
  return {
    utf8Bytes: Buffer.byteLength(text),
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : null,
    markers: {
      targetV0: text.includes(MARKER_V0),
      targetV1: text.includes(MARKER_V1),
      sibling: text.includes(SIBLING_MARKER),
    },
    t2ExactNewBytes: text.includes(MARKER_V1),
    siblingBytesInRequest: text.includes(SIBLING_MARKER),
    hasFreshCtxUnit: text.includes("<freshctx-unit"),
    resolution: resolutionFromStringifiedPayload(text),
    targetFileMention: text.includes(TARGET_FILE),
    targetSymbolMention: text.includes(TARGET_SYMBOL),
  };
}

function headerValue(headers, name) {
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function redactHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|api-key|x-api-key/iu.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value;
  }
  return out;
}

async function writeDump(dumpDir, n, bodyText) {
  await mkdir(dumpDir, { recursive: true });
  const id = String(n).padStart(3, "0");
  const scan = { n, ...scanProviderPayload(bodyText), at: new Date().toISOString() };
  await writeFile(join(dumpDir, `${id}.json`), bodyText);
  await writeFile(join(dumpDir, `${id}.scan.json`), `${JSON.stringify(scan, null, 2)}\n`);
  return scan;
}

async function writeUnmatchedDump(dumpDir, n, { method, url }) {
  await mkdir(dumpDir, { recursive: true });
  const id = String(n).padStart(3, "0");
  const record = {
    n,
    method: method ?? "",
    url: url ?? "",
    unmatched: true,
    at: new Date().toISOString(),
  };
  await writeFile(join(dumpDir, `unmatched-${id}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function writeResponsesOrChat(res, { responses, stream, payload, status = 200 }) {
  if (responses && stream) {
    res.writeHead(status, {
      "content-type": RESPONSES_STREAM_CONTENT_TYPE,
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.end(encodeResponsesSse(responsesToStreamEvents(payload)));
    return;
  }
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function forwardProviderPost({ upstream, apiKey, bodyText, headers, relativePath }) {
  const target = new URL(relativePath, upstream.endsWith("/") ? upstream : `${upstream}/`);
  const outgoing = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  const accept = headerValue(headers, "accept");
  if (accept) outgoing.accept = accept;
  const response = await fetch(target, {
    method: "POST",
    headers: outgoing,
    body: bodyText,
  });
  const text = await response.text();
  return { status: response.status, text, headers: Object.fromEntries(response.headers) };
}

export function createDumpProxy({
  dumpDir,
  listenHost = "127.0.0.1",
  listenPort = 0,
  upstream = process.env.HERMES_TRIAL_UPSTREAM ?? DEFAULT_UPSTREAM,
  apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  dumpOnly = false,
} = {}) {
  if (!dumpDir) throw new Error("createDumpProxy requires dumpDir");
  let n = 0;
  let unmatchedN = 0;
  const scans = [];

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && (req.url === "/health" || req.url === "/v1/health")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "GET" && (req.url === "/v1/models" || req.url === "/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "deepseek-v4-flash", object: "model" }] }));
        return;
      }
      const chat = req.method === "POST" && isChatCompletionsPath(req.url);
      const responses = req.method === "POST" && isResponsesPath(req.url);
      if (chat || responses) {
        const bodyText = await readRequestBody(req);
        n += 1;
        const scan = await writeDump(dumpDir, n, bodyText);
        scans.push(scan);
        if (dumpOnly || !apiKey) {
          writeResponsesOrChat(res, {
            responses,
            stream: wantsResponsesStream(bodyText),
            payload: responses ? dummyResponses() : dummyChatCompletion(),
          });
          return;
        }
        let forwardBody = bodyText;
        let translateBack = false;
        if (responses) {
          try {
            forwardBody = liveResponsesForwardBody(bodyText);
            translateBack = true;
          } catch (error) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            return;
          }
        }
        const forwarded = await forwardProviderPost({
          upstream,
          apiKey,
          bodyText: forwardBody,
          headers: req.headers,
          relativePath: DEEPSEEK_CHAT_COMPLETIONS_RELATIVE,
        });
        let responsePayload = forwarded.text;
        let parsedResponses = null;
        if (translateBack && forwarded.status >= 200 && forwarded.status < 300) {
          try {
            parsedResponses = chatCompletionToResponses(JSON.parse(forwarded.text));
            responsePayload = JSON.stringify(parsedResponses);
          } catch {
            // keep upstream text
          }
        }
        if (
          responses &&
          forwarded.status >= 200 &&
          forwarded.status < 300 &&
          wantsResponsesStream(bodyText) &&
          parsedResponses
        ) {
          writeResponsesOrChat(res, {
            responses: true,
            stream: true,
            payload: parsedResponses,
            status: forwarded.status,
          });
          return;
        }
        res.writeHead(forwarded.status, { "content-type": "application/json" });
        res.end(responsePayload);
        return;
      }
      if (req.method === "POST") {
        await readRequestBody(req);
      }
      unmatchedN += 1;
      await writeUnmatchedDump(dumpDir, unmatchedN, { method: req.method, url: req.url });
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify(DUMP_PROXY_NOT_FOUND));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });

  function listen() {
    return new Promise((resolve) => {
      server.listen(listenPort, listenHost, () => {
        const address = server.address();
        resolve({
          host: address.address,
          port: address.port,
          origin: `http://${address.address}:${address.port}`,
          baseUrl: `http://${address.address}:${address.port}/v1`,
        });
      });
    });
  }

  function close() {
    return new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  return { server, listen, close, scans, redactHeaders };
}

async function main(argv) {
  const dumpDir = argv[0] ?? process.env.HERMES_TRIAL_DUMP_DIR;
  if (!dumpDir) throw new Error("usage: proxy.mjs <dump-dir>");
  const dumpOnly = process.env.HERMES_TRIAL_DUMP_ONLY === "1";
  const proxy = createDumpProxy({ dumpDir, dumpOnly });
  const bound = await proxy.listen();
  process.stdout.write(`${JSON.stringify({ origin: bound.origin, baseUrl: bound.baseUrl, dumpOnly })}\n`);
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
