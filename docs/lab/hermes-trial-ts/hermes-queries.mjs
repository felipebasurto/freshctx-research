import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { toolsFromHermesCliStdout } from "./auto-rpc-host-read.mjs";
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

export const HERMES_CLI_STDERR_LOG_EMPTY =
  "t1-read.cli.stderr.log empty: CLI child persisted 0 bytes (not a query log)";

/** Dest 51fab717 CLI rejected this name. Hermes registry has no `openai`. */
export const HERMES_CLI_REJECTED_PROVIDER = "openai";

/**
 * Hermes Agent dump-proxy path. `OPENAI_BASE_URL` is honored only for
 * `openai-api` (NousResearch/hermes-agent PROVIDER_REGISTRY / providers.md).
 */
export const HERMES_CLI_PROVIDER = "openai-api";

export const HERMES_CLI_UNKNOWN_PROVIDER =
  "Unknown provider 'openai'. Check 'hermes model' for available providers, or run 'hermes doctor' to diagnose config issues.";

export function cliQueryCompanionPaths(logPath) {
  const stderrLog = String(logPath ?? "");
  if (stderrLog.endsWith(".cli.stderr.log")) {
    return {
      stderrLog,
      stdoutLog: stderrLog.replace(/\.cli\.stderr\.log$/u, ".cli.stdout.log"),
      spawnLog: stderrLog.replace(/\.cli\.stderr\.log$/u, ".cli.spawn.json"),
      homeLog: stderrLog.replace(/\.cli\.stderr\.log$/u, ".cli.hermes-home.log"),
    };
  }
  return {
    stderrLog,
    stdoutLog: `${stderrLog}.stdout.log`,
    spawnLog: `${stderrLog}.spawn.json`,
    homeLog: `${stderrLog}.hermes-home.log`,
  };
}

export function cliQueryChannelReason({ stderr, stdout } = {}) {
  const stderrBytes = Buffer.byteLength(String(stderr ?? ""));
  const stdoutBytes = Buffer.byteLength(String(stdout ?? ""));
  if (stderrBytes > 0 || stdoutBytes > 0) return null;
  return HERMES_CLI_STDERR_LOG_EMPTY;
}

export async function readHermesHomeQueryLog(hermesHome) {
  if (!hermesHome) return "";
  const logsDir = join(hermesHome, "logs");
  const chunks = [];
  for (const name of ["agent.log", "errors.log"]) {
    try {
      chunks.push(await readFile(join(logsDir, name), "utf8"));
    } catch {
      // absent channel
    }
  }
  return chunks.join("");
}

/** Hermes `PluginContext.register_context_engine` info line (999703f). */
export const FRESHCTX_ENGINE_REGISTERED_LINE = "registered context engine: freshctx";

const FRESHCTX_ENGINE_DIAGNOSTIC_LINE =
  /Context engine 'freshctx'|plugin discovery skipped|Failed to load plugin|Skipping 'freshctx'|Skipping 'context_engine\/freshctx'|could not be safely copied/u;

/**
 * `resolution=none` on a freshctx arm reads the same whether the unit was
 * unresolved or Hermes never loaded the engine and served its own compressor.
 * Only HERMES_HOME/logs/agent.log tells them apart.
 */
export function freshctxEngineMissingReason(hermesHomeLog) {
  const text = String(hermesHomeLog ?? "");
  if (text.includes(FRESHCTX_ENGINE_REGISTERED_LINE)) return null;
  const diagnostic = text.split("\n").findLast((line) => FRESHCTX_ENGINE_DIAGNOSTIC_LINE.test(line));
  const detail = diagnostic ? diagnostic.trim() : "no context engine line in HERMES_HOME logs";
  return `FreshCtx context engine not registered in Hermes: ${detail}`;
}

export function assertFreshCtxEngineRegistered(hermesHomeLog, { arm = "unknown" } = {}) {
  if (arm === "nothing") return;
  const reason = freshctxEngineMissingReason(hermesHomeLog);
  if (reason) throw new Error(`${reason} (arm=${arm})`);
}

/**
 * `adapters/hermes/__init__.py` logger `freshctx.hermes` lines in HERMES_HOME/logs.
 * WARNING lines land in both agent.log and errors.log, which the query log joins.
 */
export function freshctxBridgeLogLines(hermesHomeLog) {
  const lines = String(hermesHomeLog ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("FreshCtx bridge"));
  return [...new Set(lines)];
}

/**
 * A registered engine can still serve nothing: the adapter returns None when
 * the bridge exits non-zero, times out, or never got a state file, and Hermes
 * sends its own request. Dest 5030c56d printed `resolution=none` on eight such
 * dumps (PCR 0168). After the t1 host read, at least one provider dump of a
 * freshctx arm must carry the FreshCtx envelope; otherwise the row is not a
 * FreshCtx measurement and the bridge lines from the Hermes log say why.
 */
export function freshctxProjectionMissingReason(requests, hermesHomeLog) {
  const list = Array.isArray(requests) ? requests : [];
  const projected = list.some((item) => item?.hasFreshCtxEnvelope === true || item?.hasFreshCtxUnit === true);
  if (projected) return null;
  const bridgeLines = freshctxBridgeLogLines(hermesHomeLog);
  const detail = bridgeLines.length > 0
    ? bridgeLines.join("\n  ")
    : "no FreshCtx bridge lines in HERMES_HOME logs";
  return `no FreshCtx projection in any of ${list.length} t1 provider dumps; Hermes sent its own request:\n  ${detail}`;
}

export function assertFreshCtxProjectionSeen(requests, hermesHomeLog, { arm = "unknown", cell } = {}) {
  if (arm === "nothing" || cell?.turn !== 1) return;
  const reason = freshctxProjectionMissingReason(requests, hermesHomeLog);
  if (reason) throw new Error(`${reason}\n(arm=${arm})`);
}

export async function persistCliQueryCompanions({
  logPath,
  args,
  result,
  hermesHomeLog = "",
} = {}) {
  if (!logPath) return null;
  const paths = cliQueryCompanionPaths(logPath);
  await mkdir(dirname(paths.stdoutLog), { recursive: true });
  await writeFile(paths.stdoutLog, result?.stdout ?? "");
  await writeFile(paths.homeLog, hermesHomeLog ?? "");
  const record = {
    args: Array.isArray(args) ? args : [],
    code: result?.code ?? null,
    signal: result?.signal ?? null,
    stderrBytes: Buffer.byteLength(String(result?.stderr ?? "")),
    stdoutBytes: Buffer.byteLength(String(result?.stdout ?? "")),
    hermesHomeBytes: Buffer.byteLength(String(hermesHomeLog ?? "")),
  };
  await writeFile(paths.spawnLog, `${JSON.stringify(record, null, 2)}\n`);
  return paths;
}

export async function cliStderrLogMissingReason(logPath) {
  if (!logPath) return HERMES_CLI_STDERR_LOG_MISSING;
  try {
    await access(logPath);
  } catch {
    return HERMES_CLI_STDERR_LOG_MISSING;
  }
  const size = (await stat(logPath)).size;
  if (size === 0) return HERMES_CLI_STDERR_LOG_EMPTY;
  return null;
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

export function hermesUnknownProviderReason(text) {
  const raw = String(text ?? "");
  const match = raw.match(/Unknown provider '([^']+)'/u);
  if (!match) return null;
  if (match[1] === HERMES_CLI_REJECTED_PROVIDER) return HERMES_CLI_UNKNOWN_PROVIDER;
  return `Unknown provider '${match[1]}'. Check 'hermes model' for available providers, or run 'hermes doctor' to diagnose config issues.`;
}

export function cliQueryProviderInvalidReason(args) {
  const list = Array.isArray(args) ? args : [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] !== "--provider") continue;
    const value = list[i + 1];
    if (value === HERMES_CLI_REJECTED_PROVIDER) return HERMES_CLI_UNKNOWN_PROVIDER;
  }
  return null;
}

export function hermesCliQueryFailedReason({ code, stderr, stdout } = {}) {
  const text = `${String(stderr ?? "")}\n${String(stdout ?? "")}`;
  const unknown = hermesUnknownProviderReason(text);
  if (unknown) return unknown;
  if (text.includes("argument -q/--query: expected one argument")) {
    return HERMES_Q_EXPECTED_ONE_ARGUMENT;
  }
  if (code != null && code !== 0) {
    return `hermes cli query failed (${code}): ${String(stderr ?? "").trim() || "no stderr"}`;
  }
  return null;
}

export const HERMES_CLI_IN_FLAG = "--in";

export function hermesInDirArgs(workspace) {
  const inDir = typeof workspace === "string" ? workspace.trim() : "";
  if (!inDir) return [];
  if (inDir.startsWith("-")) {
    throw new Error(`hermes --in must be a dest work path, got ${inDir}`);
  }
  return [HERMES_CLI_IN_FLAG, inDir];
}

export function cliQueryArgs({ continueSession = false, message, workspace } = {}) {
  const query = message == null ? "" : String(message);
  const args = [];
  if (continueSession) args.push("--continue");
  args.push(...hermesInDirArgs(workspace));
  args.push("chat", "-q", query, "--provider", HERMES_CLI_PROVIDER, "--model", MODEL);
  const reason = cliQueryArgvInvalidReason(args) ?? cliQueryProviderInvalidReason(args);
  if (reason) throw new Error(reason);
  return args;
}

export async function runCliQuery({ cwd, env, message, continueSession = false, logPath, hermesHome }) {
  if (!logPath) {
    throw new Error(HERMES_CLI_STDERR_LOG_MISSING);
  }
  const args = cliQueryArgs({ continueSession, message, workspace: cwd });
  const child = launchChild({
    command: hermesBin(),
    args,
    cwd,
    env,
    logPath,
  });
  try {
    child.proc.stdin.end();
  } catch {
    // already closed
  }
  const result = await child.exit;
  const home = hermesHome ?? env?.HERMES_HOME ?? "";
  const hermesHomeLog = await readHermesHomeQueryLog(home);
  await persistCliQueryCompanions({ logPath, args, result, hermesHomeLog });
  const missing = await cliStderrLogMissingReason(logPath);
  if (missing === HERMES_CLI_STDERR_LOG_MISSING) throw new Error(missing);
  if (missing === HERMES_CLI_STDERR_LOG_EMPTY) {
    const channel = cliQueryChannelReason({
      stderr: result.stderr,
      stdout: result.stdout,
    });
    if (channel) throw new Error(channel);
  }
  const reason = hermesCliQueryFailedReason(result);
  if (reason) throw new Error(reason);
  return {
    ...result,
    reply: result.stdout,
    tools: toolsFromHermesCliStdout(result.stdout),
    hermesHomeLog,
  };
}

export function promptForPackCell(cell) {
  return promptForCell(cell);
}
