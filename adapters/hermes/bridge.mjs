import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { FreshCtxEngine, stableReadMarker } from "../../src/index.mjs";

const READ_TOOLS = new Set(["read", "read_file", "read_text_file"]);
const MAX_FILE_BYTES = 512 * 1024;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function loadState(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return value && typeof value === "object" ? value : { calls: {} };
  } catch {
    return { calls: {} };
  }
}

async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function parseArguments(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function discoveredCalls(messages) {
  const candidates = new Map();
  const completed = new Set();

  for (const message of messages) {
    if (message?.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        const name = call?.function?.name ?? call?.name;
        if (!READ_TOOLS.has(name) || typeof call?.id !== "string") continue;
        const args = parseArguments(call?.function?.arguments ?? call?.arguments);
        const path = args.path ?? args.file_path;
        if (typeof path === "string") candidates.set(call.id, path);
      }
    }

    if (message?.role === "tool") {
      const id = message.tool_call_id ?? message.toolCallId;
      if (typeof id === "string") completed.add(id);
    }
  }

  return Object.fromEntries([...candidates].filter(([id]) => completed.has(id)));
}

function textContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function taskFrom(payload) {
  const incoming = textContent(payload.incomingMessage?.content);
  if (incoming) return incoming;
  for (let index = payload.messages.length - 1; index >= 0; index -= 1) {
    if (payload.messages[index]?.role === "user") {
      const text = textContent(payload.messages[index].content);
      if (text) return text;
    }
  }
  return "";
}

async function safeWorkspaceFile(rootInput, requestedPath) {
  const root = await realpath(rootInput);
  const candidate = resolve(root, isAbsolute(requestedPath) ? relative(root, requestedPath) : requestedPath);
  const canonical = await realpath(candidate);
  if (canonical !== root && !canonical.startsWith(`${root}${sep}`)) {
    throw new Error("outside-workspace path");
  }
  const bytes = await readFile(canonical);
  if (bytes.length > MAX_FILE_BYTES || bytes.includes(0)) throw new Error("unsupported file");
  return {
    path: relative(root, canonical).split(sep).join("/"),
    content: bytes.toString("utf8").replaceAll("\r\n", "\n"),
  };
}

async function observe(payload) {
  const state = await loadState(payload.stateFile);
  state.calls = { ...(state.calls ?? {}), ...discoveredCalls(payload.messages) };
  state.updatedAt = new Date().toISOString();
  await saveState(payload.stateFile, state);
  return { observedCalls: Object.keys(state.calls).length };
}

async function select(payload) {
  const state = await loadState(payload.stateFile);
  const calls = { ...(state.calls ?? {}), ...discoveredCalls(payload.messages) };
  const paths = [...new Set(Object.values(calls))].sort();
  if (paths.length === 0) return { messages: payload.messages, selected: 0 };

  const engine = new FreshCtxEngine();
  const unitsByPath = new Map();
  for (const requestedPath of paths) {
    try {
      const file = await safeWorkspaceFile(payload.cwd, requestedPath);
      const unit = engine.trackRead({ path: file.path, content: file.content, scope: "file" });
      unitsByPath.set(requestedPath, unit);
      unitsByPath.set(file.path, unit);
    } catch {
      // Keep the original result for paths that cannot be refreshed. This is
      // the adapter's fail-open boundary.
    }
  }

  const rewritten = payload.messages.map((message) => {
    if (message?.role !== "tool") return structuredClone(message);
    const id = message.tool_call_id ?? message.toolCallId;
    const requestedPath = typeof id === "string" ? calls[id] : undefined;
    const unit = requestedPath ? unitsByPath.get(requestedPath) : undefined;
    if (!unit) return structuredClone(message);
    return { ...structuredClone(message), content: stableReadMarker(unit) };
  });

  const configuredBudget = Number(process.env.FRESHCTX_BUDGET_CHARS);
  const derivedBudget = Math.min(
    32_000,
    Math.max(4_000, Math.floor(Number(payload.budgetTokens ?? 0) * 4 * 0.15)),
  );
  const projection = engine.project({
    task: taskFrom(payload),
    budgetChars: Number.isFinite(configuredBudget) && configuredBudget > 0
      ? configuredBudget
      : derivedBudget,
  });

  return {
    messages: [...rewritten, { role: "user", content: projection.text }],
    selected: projection.selected.length,
    unresolved: projection.omitted.filter((item) => item.reason === "unresolved").length,
  };
}

try {
  const payload = await readStdin();
  const result = payload.operation === "observe" ? await observe(payload) : await select(payload);
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
