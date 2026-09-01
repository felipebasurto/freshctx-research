/** Dump proxy that records request bytes and response usage. Never logs API keys. */

import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { MODEL } from "./pack.mjs";
import { redactHeaders } from "./ingest.mjs";
import { usageFromResponseText } from "./usage.mjs";

const DEFAULT_UPSTREAM = "https://api.deepseek.com/v1";

export function dummyChatCompletion({ content = "SETTLE=ST0" } = {}) {
  return {
    id: "freshctx-cost-ledger-dummy",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function headerValue(headers, name) {
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function forwardChatCompletions({ upstream, apiKey, bodyText, headers }) {
  const target = new URL("chat/completions", upstream.endsWith("/") ? upstream : `${upstream}/`);
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

async function writeDump(dumpDir, n, bodyText, usage) {
  await mkdir(dumpDir, { recursive: true });
  const id = String(n).padStart(3, "0");
  const scan = {
    n,
    utf8Bytes: Buffer.byteLength(bodyText),
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    usageFrom: usage.usageFrom,
    dumpOnly: usage.dumpOnly === true,
    model: MODEL,
    at: new Date().toISOString(),
  };
  await writeFile(join(dumpDir, `${id}.json`), bodyText);
  await writeFile(join(dumpDir, `${id}.scan.json`), `${JSON.stringify(scan, null, 2)}\n`);
  if (usage.usageFrom === "provider-response") {
    await writeFile(
      join(dumpDir, `${id}.response.usage.json`),
      `${JSON.stringify(
        {
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          usageFrom: "provider-response",
        },
        null,
        2,
      )}\n`,
    );
  }
  return scan;
}

export function createCostLedgerDumpProxy({
  dumpDir,
  listenHost = "127.0.0.1",
  listenPort = 0,
  upstream = process.env.COST_LEDGER_UPSTREAM ?? DEFAULT_UPSTREAM,
  apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  dumpOnly = false,
} = {}) {
  if (!dumpDir) throw new Error("createCostLedgerDumpProxy requires dumpDir");
  let n = 0;
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
        res.end(JSON.stringify({ data: [{ id: MODEL, object: "model" }] }));
        return;
      }
      if (req.method === "POST" && /\/chat\/completions$/u.test(req.url ?? "")) {
        const bodyText = await readRequestBody(req);
        n += 1;
        const skipUpstream = dumpOnly || !apiKey;
        let usage = { promptTokens: null, completionTokens: null, usageFrom: "none", dumpOnly: true };
        let status = 200;
        let responseText = JSON.stringify(dummyChatCompletion());
        if (!skipUpstream) {
          const forwarded = await forwardChatCompletions({
            upstream,
            apiKey,
            bodyText,
            headers: req.headers,
          });
          status = forwarded.status;
          responseText = forwarded.text;
          usage = { ...usageFromResponseText(forwarded.text), dumpOnly: false };
        }
        const scan = await writeDump(dumpDir, n, bodyText, usage);
        scans.push(scan);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(responseText);
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
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
  const dumpDir = argv[0] ?? process.env.COST_LEDGER_DUMP_DIR;
  if (!dumpDir) throw new Error("usage: dump-proxy.mjs <dump-dir>");
  const dumpOnly = process.env.COST_LEDGER_DUMP_ONLY === "1";
  const proxy = createCostLedgerDumpProxy({ dumpDir, dumpOnly });
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
