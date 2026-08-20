import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function requestBody(request, limit = 16 * 1024 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error("capture request exceeds 16 MiB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function chatCompletion(model) {
  return {
    id: "freshctx-capture",
    object: "chat.completion",
    created: 0,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "FRESHCTX_CAPTURE_OK" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function streamChat(response, model) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const first = {
    id: "freshctx-capture",
    object: "chat.completion.chunk",
    created: 0,
    model,
    choices: [
      { index: 0, delta: { role: "assistant", content: "FRESHCTX_CAPTURE_OK" }, finish_reason: null },
    ],
  };
  const last = {
    id: "freshctx-capture",
    object: "chat.completion.chunk",
    created: 0,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
  response.write(`data: ${JSON.stringify(first)}\n\n`);
  response.write(`data: ${JSON.stringify(last)}\n\n`);
  response.end("data: [DONE]\n\n");
}

function responsesCompletion(model) {
  return {
    id: "resp_freshctx_capture",
    object: "response",
    created_at: 0,
    status: "completed",
    model,
    output: [
      {
        id: "msg_freshctx_capture",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: "FRESHCTX_CAPTURE_OK", annotations: [] }],
      },
    ],
    output_text: "FRESHCTX_CAPTURE_OK",
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}

export function createCaptureProvider({ capturePath, expectedRequests = 0 } = {}) {
  const captures = [];
  let writeChain = Promise.resolve();
  let semanticRequests = 0;
  let server;

  async function record(request, raw, parsed) {
    const canonical = JSON.stringify(stableValue(parsed));
    const entry = {
      schema_version: 1,
      sequence: semanticRequests,
      method: request.method,
      path: request.url,
      content_type: request.headers["content-type"] ?? null,
      raw_bytes: raw.length,
      raw_sha256: sha256(raw),
      canonical_bytes: Buffer.byteLength(canonical),
      canonical_sha256: sha256(canonical),
      request: parsed,
    };
    captures.push(entry);
    if (capturePath) {
      writeChain = writeChain.then(async () => {
        await mkdir(dirname(capturePath), { recursive: true });
        await appendFile(capturePath, `${JSON.stringify(entry)}\n`);
      });
      await writeChain;
    }
    return entry;
  }

  server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        return json(response, 200, { ok: true, semantic_requests: semanticRequests });
      }
      if (request.method === "GET" && request.url === "/v1/models") {
        return json(response, 200, {
          object: "list",
          data: [{ id: "freshctx-capture", object: "model", created: 0, owned_by: "freshctx" }],
        });
      }
      if (
        request.method !== "POST" ||
        !["/v1/chat/completions", "/v1/responses"].includes(request.url)
      ) {
        return json(response, 404, { error: { message: "unsupported capture endpoint" } });
      }

      semanticRequests += 1;
      if (expectedRequests > 0 && semanticRequests > expectedRequests) {
        return json(response, 409, { error: { message: "unexpected extra semantic request" } });
      }
      const raw = await requestBody(request);
      const parsed = JSON.parse(raw.toString("utf8"));
      await record(request, raw, parsed);
      const model = parsed.model ?? "freshctx-capture";

      if (request.url === "/v1/chat/completions" && parsed.stream) {
        streamChat(response, model);
      } else if (request.url === "/v1/chat/completions") {
        json(response, 200, chatCompletion(model));
      } else if (parsed.stream) {
        json(response, 400, { error: { message: "streaming Responses capture is not implemented" } });
      } else {
        json(response, 200, responsesCompletion(model));
      }
    } catch (error) {
      json(response, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
  });

  return {
    server,
    captures,
    async flushed() {
      await writeChain;
    },
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const port = Number(process.env.FRESHCTX_CAPTURE_PORT ?? 8787);
  const capturePath = process.env.FRESHCTX_CAPTURE_FILE ?? "./capture/results/requests.jsonl";
  const expectedRequests = Number(process.env.FRESHCTX_EXPECTED_REQUESTS ?? 0);
  const provider = createCaptureProvider({ capturePath, expectedRequests });
  provider.server.listen(port, "127.0.0.1", () => {
    process.stderr.write(`FreshCtx capture provider listening on http://127.0.0.1:${port}/v1\n`);
  });
}
