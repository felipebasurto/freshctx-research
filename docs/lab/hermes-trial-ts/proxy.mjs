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
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(responses ? dummyResponses() : dummyChatCompletion()));
          return;
        }
        const forwarded = await forwardProviderPost({
          upstream,
          apiKey,
          bodyText,
          headers: req.headers,
          relativePath: responses ? "responses" : "chat/completions",
        });
        res.writeHead(forwarded.status, { "content-type": "application/json" });
        res.end(forwarded.text);
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
