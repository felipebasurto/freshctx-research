import { access } from "node:fs/promises";

import { launchChild } from "./launch-child.mjs";
import { hermesBin } from "./launch-hermes.mjs";
import { MODEL, promptForCell } from "./pack.mjs";

export function jsonRpcRequest({ id, method, params }) {
  return { jsonrpc: "2.0", id, method, params };
}

export function tuiPromptSubmit(text, id = "prompt-1") {
  return jsonRpcRequest({ id, method: "prompt.submit", params: { text } });
}

export function acpSessionPrompt({ sessionId, text, id = "prompt-1" }) {
  return jsonRpcRequest({
    id,
    method: "session/prompt",
    params: {
      sessionId,
      prompt: [{ type: "text", text }],
    },
  });
}

export function parseNdjsonMessages(buffer) {
  const lines = String(buffer ?? "").split("\n");
  const messages = [];
  for (const line of lines) {
    const trimmed = line.replace(/\r$/u, "");
    if (!trimmed.startsWith("{")) continue;
    try {
      messages.push(JSON.parse(trimmed));
    } catch {
      // skip non-JSON chatter
    }
  }
  return messages;
}

export function toolNameFromEvent(event) {
  return (
    event.toolName
    ?? event.name
    ?? event.tool
    ?? event.params?.toolName
    ?? event.params?.name
    ?? event.params?.update?.toolCall?.kind
    ?? event.params?.update?.toolCall?.title
    ?? null
  );
}

export function toolArgsFromEvent(event) {
  return (
    event.args
    ?? event.input
    ?? event.params?.args
    ?? event.params?.input
    ?? event.params?.update?.toolCall?.rawInput
    ?? event.params?.update?.toolCall?.content
    ?? null
  );
}

export function toolsFromHermesEvents(events) {
  const tools = [];
  for (const event of events) {
    const method = event.method ?? event.type;
    const isTool =
      method === "tool.start"
      || method === "tool_execution_start"
      || method === "session/update" && event.params?.update?.sessionUpdate === "tool_call";
    if (!isTool && event.toolName == null && event.name == null) continue;
    const toolName = toolNameFromEvent(event);
    if (!toolName) continue;
    tools.push({
      toolCallId: event.toolCallId ?? event.params?.update?.toolCall?.toolCallId ?? event.id ?? null,
      toolName,
      args: toolArgsFromEvent(event),
    });
  }
  return tools;
}

export function stdoutMatchesCurrent(reply) {
  const line = String(reply ?? "");
  return /\bSETTLE=ST1\b/u.test(line) || /\bSETTLE\s*=\s*ST1\b/u.test(line);
}

export function assistantTextFromEvents(events) {
  const chunks = [];
  for (const event of events) {
    if (event.method === "message.complete" && typeof event.params?.text === "string") {
      chunks.push(event.params.text);
    }
    if (event.method === "session/update" && typeof event.params?.update?.content?.text === "string") {
      chunks.push(event.params.update.content.text);
    }
    if (typeof event.data?.text === "string") chunks.push(event.data.text);
  }
  return chunks.join("");
}

export class HermesRpc {
  constructor({ proc, protocol = "tui-gateway" }) {
    this.proc = proc;
    this.protocol = protocol;
    this.buf = "";
    this.n = 0;
    this.pending = new Map();
    this.events = [];
    this.proc.stdout.on("data", (chunk) => this.onStdout(chunk));
  }

  onStdout(chunk) {
    this.buf += chunk.toString("utf8");
    while (true) {
      const idx = this.buf.indexOf("\n");
      if (idx < 0) break;
      const line = this.buf.slice(0, idx).replace(/\r$/u, "");
      this.buf = this.buf.slice(idx + 1);
      if (!line.startsWith("{")) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id != null && this.pending.has(msg.id)) {
        const waiter = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        waiter.resolve(msg);
        continue;
      }
      this.events.push(msg);
    }
  }

  send(body, timeoutMs = 30_000) {
    const id = body.id ?? `req-${++this.n}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`rpc timeout ${id} after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve(msg) {
          clearTimeout(timer);
          resolve(msg);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.proc.stdin.write(`${JSON.stringify({ ...body, id })}\n`);
    });
  }

  async prompt(message, timeoutMs = 6 * 60 * 1000) {
    const from = this.events.length;
    const body = this.protocol === "acp"
      ? acpSessionPrompt({ sessionId: this.sessionId, text: message })
      : tuiPromptSubmit(message);
    await this.send(body, timeoutMs);
    return this.events.slice(from);
  }
}

export const HERMES_Q_EXPECTED_ONE_ARGUMENT =
  "hermes chat: error: argument -q/--query: expected one argument";

export const HERMES_CLI_STDERR_LOG_MISSING =
  "t1-read.cli.stderr.log missing: CLI child exited without persisting logPath";

export async function cliStderrLogMissingReason(logPath) {
  if (!logPath) return HERMES_CLI_STDERR_LOG_MISSING;
  try {
    await access(logPath);
    return null;
  } catch {
    return HERMES_CLI_STDERR_LOG_MISSING;
  }
}

export function cliQueryArgvInvalidReason(args) {
  const list = Array.isArray(args) ? args : [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] !== "-q" && list[i] !== "--query") continue;
    const value = list[i + 1];
    if (value == null || value === "" || String(value).startsWith("-")) {
      return HERMES_Q_EXPECTED_ONE_ARGUMENT;
    }
  }
  return null;
}

export function hermesCliQueryFailedReason({ code, stderr } = {}) {
  const text = String(stderr ?? "");
  if (text.includes("argument -q/--query: expected one argument")) {
    return HERMES_Q_EXPECTED_ONE_ARGUMENT;
  }
  if (code != null && code !== 0) {
    return `hermes cli query failed (${code}): ${text.trim() || "no stderr"}`;
  }
  return null;
}

export function cliQueryArgs({ continueSession = false, message } = {}) {
  const query = message == null ? "" : String(message);
  const args = [];
  if (continueSession) args.push("--continue");
  args.push("chat", "-q", query, "--provider", "openai", "--model", MODEL);
  const reason = cliQueryArgvInvalidReason(args);
  if (reason) throw new Error(reason);
  return args;
}

export async function runCliQuery({ cwd, env, message, continueSession = false, logPath }) {
  if (!logPath) {
    throw new Error(HERMES_CLI_STDERR_LOG_MISSING);
  }
  const child = launchChild({
    command: hermesBin(),
    args: cliQueryArgs({ continueSession, message }),
    cwd,
    env,
    logPath,
  });
  const result = await child.exit;
  const missing = await cliStderrLogMissingReason(logPath);
  if (missing) throw new Error(missing);
  const reason = hermesCliQueryFailedReason(result);
  if (reason) throw new Error(reason);
  return {
    ...result,
    reply: result.stdout,
    tools: [],
  };
}

export function promptForPackCell(cell) {
  return promptForCell(cell);
}
