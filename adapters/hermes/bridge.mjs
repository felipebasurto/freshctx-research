import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  DEFAULT_BUDGET_CHARS,
  dropUnservedReadToolPairs,
  resolveAdapterBudgetChars,
  servedReadCallIdsFromUnitsByCall,
} from "../request-prune.mjs";
import {
  shellCallsFromMessages,
  trackedReadTools,
} from "../shell-read.mjs";
import { FreshCtxEngine, stableReadMarker } from "../../src/index.mjs";

export const READ_TOOLS = new Set(["read", "read_file", "read_text_file"]);
const HERMES_TRACKED_TOOLS = trackedReadTools(READ_TOOLS);
const MAX_FILE_BYTES = 512 * 1024;

function lineCount(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n").length;
}

export function readScopeFromHermesArgs(args, fileLineCount) {
  if (!args || typeof args !== "object") return { scope: "file" };
  if (args.scope === "region") {
    return normalizeHermesReadScope(
      {
        scope: "region",
        startLine: args.startLine,
        endLine: args.endLine,
        selector: args.selector,
      },
      fileLineCount,
    );
  }
  const offset = args.offset;
  const limit = args.limit;
  if (Number.isFinite(offset) && Number.isFinite(limit) && offset >= 1 && limit >= 1) {
    return normalizeHermesReadScope(
      {
        scope: "region",
        startLine: offset,
        endLine: offset + limit - 1,
        selector: args.selector,
      },
      fileLineCount,
    );
  }
  return { scope: "file" };
}

export function normalizeHermesReadScope(scopeMeta, fileLineCount) {
  if (!scopeMeta || scopeMeta.scope !== "region") return scopeMeta ?? { scope: "file" };
  if (!Number.isInteger(fileLineCount) || fileLineCount < 1) return scopeMeta;
  const { startLine, endLine } = scopeMeta;
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) return scopeMeta;
  // Hermes pagination that reaches EOF (0064 past-EOF, 0069 exact-EOF) cannot refresh
  // after interior edits on multi-line spans; promote to whole-file so current bytes
  // still project without inventing neighbor lines. Rule shipped: endLine >= fileLineCount
  // (not startLine===1 && endLine===fileLineCount; 0071 may lock the stricter form).
  if (endLine >= fileLineCount) return { scope: "file" };
  return scopeMeta;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function loadState(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return value && typeof value === "object" ? value : { calls: {} };
  } catch {
    return { calls: {} };
  }
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export function parseArguments(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function discoveredCalls(messages) {
  const candidates = new Map();
  const completed = new Set();

  for (const message of messages) {
    if (message?.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        const name = call?.function?.name ?? call?.name;
        if (!READ_TOOLS.has(name) || typeof call?.id !== "string") continue;
        const args = parseArguments(call?.function?.arguments ?? call?.arguments);
        const path = args.path ?? args.file_path;
        if (typeof path !== "string") continue;
        const scopeMeta = readScopeFromHermesArgs(args);
        candidates.set(call.id, {
          path,
          ...scopeMeta,
        });
      }
    }

    if (message?.role === "tool") {
      const id = message.tool_call_id ?? message.toolCallId;
      if (typeof id === "string") completed.add(id);
    }
  }

  for (const [id, meta] of Object.entries(shellCallsFromMessages(messages))) {
    candidates.set(id, {
      path: meta.path,
      scope: meta.scope ?? "file",
      startLine: meta.startLine,
      endLine: meta.endLine,
      shellRead: true,
    });
  }

  return Object.fromEntries([...candidates].filter(([id]) => completed.has(id)));
}

export function textContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

export function taskFrom(payload) {
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

export async function safeWorkspaceFile(rootInput, requestedPath) {
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

export function trackedCallsFromMessages(messages) {
  const calls = discoveredCalls(messages);
  const tracked = {};
  for (const [callId, meta] of Object.entries(calls)) {
    const toolMessage = messages.find(
      (message) =>
        message?.role === "tool"
        && (message.tool_call_id ?? message.toolCallId) === callId,
    );
    if (!toolMessage) continue;
    tracked[callId] = {
      path: meta.path,
      content: textContent(toolMessage.content),
      scope: meta.scope ?? "file",
      startLine: meta.startLine,
      endLine: meta.endLine,
      selector: meta.selector,
    };
  }
  return tracked;
}

function scopeFromObservation(observation, fileLineCount) {
  const scopeMeta = {
    scope: observation.scope ?? "file",
    startLine: observation.startLine,
    endLine: observation.endLine,
    selector: observation.selector,
  };
  return normalizeHermesReadScope(scopeMeta, fileLineCount);
}

async function enrichTrackedWithLineCounts(cwd, tracked) {
  if (!cwd) return tracked;
  const enriched = {};
  for (const [callId, observation] of Object.entries(tracked)) {
    try {
      const file = await safeWorkspaceFile(cwd, observation.path);
      const observedFileLineCount = Number.isInteger(observation.observedFileLineCount)
        ? observation.observedFileLineCount
        : lineCount(file.content);
      const scopeMeta = scopeFromObservation(observation, observedFileLineCount);
      enriched[callId] = {
        ...observation,
        ...scopeMeta,
        observedFileLineCount,
      };
    } catch {
      enriched[callId] = observation;
    }
  }
  return enriched;
}

function mergeTrackedCalls(stored, incoming) {
  const merged = { ...stored };
  for (const [callId, observation] of Object.entries(incoming)) {
    const previous = stored[callId];
    merged[callId] = {
      ...observation,
      ...(Number.isInteger(previous?.observedFileLineCount)
        ? { observedFileLineCount: previous.observedFileLineCount }
        : {}),
    };
  }
  return merged;
}

function lastInjectedRevisionFromState(state) {
  const raw = state?.lastInjectedRevision;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Map();
  return new Map(
    Object.entries(raw).filter(
      ([unitId, revision]) => typeof unitId === "string" && typeof revision === "string",
    ),
  );
}

export async function observeTurn(payload) {
  const state = await loadState(payload.stateFile);
  state.calls = { ...(state.calls ?? {}), ...discoveredCalls(payload.messages) };
  const tracked = mergeTrackedCalls(
    state.tracked ?? {},
    trackedCallsFromMessages(payload.messages),
  );
  state.tracked = await enrichTrackedWithLineCounts(payload.cwd, tracked);
  state.updatedAt = new Date().toISOString();
  await saveState(payload.stateFile, state);
  return { observedCalls: Object.keys(state.calls).length };
}

export async function selectContext(payload) {
  const state = await loadState(payload.stateFile);
  const calls = { ...(state.calls ?? {}), ...discoveredCalls(payload.messages) };
  const tracked = await enrichTrackedWithLineCounts(
    payload.cwd,
    mergeTrackedCalls(
      state.tracked ?? {},
      trackedCallsFromMessages(payload.messages),
    ),
  );
  const paths = [...new Set(Object.values(calls).map((call) => call.path ?? call))].sort();
  if (paths.length === 0) {
    return {
      messages: payload.messages,
      selected: 0,
      applied: false,
      projectionText: "",
      telemetry: { totalMs: 0, projectionBytes: 0 },
    };
  }

  const budgetChars = resolveAdapterBudgetChars({
    budgetChars: payload.budgetChars,
    budgetTokens: payload.budgetTokens,
    defaultBudget: DEFAULT_BUDGET_CHARS,
  });
  const lastInjectedRevision = lastInjectedRevisionFromState(state);
  const engine = new FreshCtxEngine();
  const unitsByCall = new Map();
  const shellCallIds = new Set(Object.keys(shellCallsFromMessages(payload.messages)));
  for (const [callId, observation] of Object.entries(tracked)) {
    try {
      let trackArgs;
      if (shellCallIds.has(callId)) {
        const file = await safeWorkspaceFile(payload.cwd, observation.path);
        const observedFileLineCount = observation.observedFileLineCount ?? lineCount(file.content);
        const scopeMeta = scopeFromObservation(observation, observedFileLineCount);
        if (scopeMeta.scope === "region") {
          if (!observation.content) continue;
          trackArgs = {
            path: file.path,
            content: observation.content,
            scope: "region",
            startLine: scopeMeta.startLine,
            endLine: scopeMeta.endLine,
            selector: scopeMeta.selector,
            observedFileLineCount,
          };
        } else {
          trackArgs = {
            path: file.path,
            content: file.content,
            scope: "file",
          };
        }
      } else {
        trackArgs = observation.scope === "region"
          ? {
              path: observation.path,
              content: observation.content,
              scope: "region",
              startLine: observation.startLine,
              endLine: observation.endLine,
              selector: observation.selector,
              observedFileLineCount: observation.observedFileLineCount,
            }
          : {
              path: observation.path,
              content: observation.content,
              scope: "file",
            };
      }
      const unit = engine.trackRead(trackArgs);
      unitsByCall.set(callId, unit);
    } catch {
      // Unsupported observations remain ordinary tool results.
    }
  }

  await engine.refresh(async (filePath) =>
    (await safeWorkspaceFile(payload.cwd, filePath)).content,
  );

  const rewritten = payload.messages.map((message) => {
    if (message?.role !== "tool") return structuredClone(message);
    const id = message.tool_call_id ?? message.toolCallId;
    const unit = typeof id === "string" ? unitsByCall.get(id) : undefined;
    if (!unit) return structuredClone(message);
    return { ...structuredClone(message), content: stableReadMarker(unit) };
  });

  const projection = engine.project({
    task: taskFrom(payload),
    budgetChars,
    lastInjectedRevision,
  });

  state.lastInjectedRevision = Object.fromEntries(lastInjectedRevision);
  state.updatedAt = new Date().toISOString();
  await saveState(payload.stateFile, state);

  const projectionText = projection.text;
  const servedCallIds = servedReadCallIdsFromUnitsByCall(unitsByCall, projection);
  const assembled = dropUnservedReadToolPairs(rewritten, { readTools: HERMES_TRACKED_TOOLS, servedCallIds });
  return {
    messages: [...assembled, { role: "user", content: projectionText }],
    selected: projection.selected.length,
    unresolved: projection.omitted.filter((item) => item.reason === "unresolved").length,
    applied: engine.registry.list().length > 0,
    projectionText,
    telemetry: {
      totalMs: 0,
      projectionBytes: Buffer.byteLength(projectionText, "utf8"),
    },
  };
}

export function messageText(messages) {
  return messages
    .flatMap((message) => {
      if (typeof message.content === "string") return [message.content];
      if (!Array.isArray(message.content)) return [];
      return message.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text);
    })
    .join("\n\n");
}

export function toProviderPayload(messages, { model = "freshctx-capture" } = {}) {
  return {
    model,
    messages: messages.map((message) => structuredClone(message)),
    stream: false,
  };
}

import { fileURLToPath } from "node:url";

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  try {
    const payload = await readStdin();
    const result = payload.operation === "observe"
      ? await observeTurn(payload)
      : await selectContext(payload);
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
