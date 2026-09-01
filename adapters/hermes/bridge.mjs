import { realpathSync } from "node:fs";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  DEFAULT_BUDGET_CHARS,
  dropUnservedReadToolPairs,
  readToolCallIds,
  readDispositionByUnitsByCall,
  replaceHistoricalProjectionMessages,
  replaceTrackedReadToolResults,
  resolveAdapterBudgetChars,
  resolveProjectionText,
  servedReadCallIdsFromUnitsByCall,
} from "../request-prune.mjs";
import {
  shellCallsFromMessages,
  trackedReadTools,
} from "../shell-read.mjs";
import { createAdapterEngine } from "../engine-factory.mjs";

export const READ_TOOLS = new Set(["read", "read_file", "read_text_file"]);

/** Isolated Semantic Engine off is a harness env knob, same family as adapters/pi/extension.ts. */
export function isolatedSemanticEngineOffFromEnv(env = process.env) {
  return env.FRESHCTX_ISOLATED_SEMANTIC_ENGINE === "off";
}

/** Replay may pass a runner. Live Hermes honors FRESHCTX_ISOLATED_SEMANTIC_ENGINE=off. */
export function semanticEngineOptionsForBridge(payload = {}, env = process.env) {
  if (payload.semanticEngineRunner !== undefined) {
    return { semanticEngineRunner: payload.semanticEngineRunner };
  }
  if (isolatedSemanticEngineOffFromEnv(env)) {
    return { semanticEngineRunner: null };
  }
  return {};
}
const HERMES_TRACKED_TOOLS = trackedReadTools(READ_TOOLS);
const MAX_FILE_BYTES = 512 * 1024;

function lineCount(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n").length;
}

function splitLines(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n");
}

export function readScopeFromHermesArgs(args, fileLineCount) {
  if (!args || typeof args !== "object") return { scope: "file" };
  if (args.scope === "symbol") {
    if (typeof args.selector === "string" && args.selector.length > 0) {
      return { scope: "symbol", selector: args.selector };
    }
    return { scope: "file" };
  }
  if (args.scope === "region") {
    if (Number.isInteger(args.tailLines) && args.tailLines >= 1) {
      return { scope: "region", tailLines: args.tailLines, selector: args.selector };
    }
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
  if (Number.isInteger(scopeMeta.tailLines) && scopeMeta.tailLines >= 1) return scopeMeta;
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

function tailSpanContent(fileContent, startLine, endLine) {
  return splitLines(fileContent).slice(startLine - 1, endLine).join("\n");
}

function tailRegionFromObservation(scopeMeta, fileContent, observedContent) {
  if (!scopeMeta || scopeMeta.scope !== "region" || !Number.isInteger(scopeMeta.tailLines)) {
    return scopeMeta;
  }
  const fileLineCount = lineCount(fileContent);
  if (!Number.isInteger(fileLineCount) || fileLineCount < 1) return scopeMeta;
  const observedText = typeof observedContent === "string" ? observedContent.replaceAll("\r\n", "\n") : "";
  const startLine = Math.max(1, fileLineCount - scopeMeta.tailLines);
  if (tailSpanContent(fileContent, startLine, fileLineCount) !== observedText) {
    return {
      scope: "region",
      selector: scopeMeta.selector,
      tailLines: scopeMeta.tailLines,
      invalidTailObservation: true,
    };
  }
  return {
    scope: "region",
    startLine,
    endLine: fileLineCount,
    selector: scopeMeta.selector,
    tailLines: scopeMeta.tailLines,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwnEntries(value) {
  return isPlainObject(value) && Object.keys(value).length > 0;
}

function projectionAppliedToMessages(messages, projectionText) {
  if (!Array.isArray(messages) || typeof projectionText !== "string" || projectionText.length === 0) {
    return false;
  }
  return messages.some(
    (message) =>
      message?.role === "user"
      && (
        message.content === projectionText
        || (
          Array.isArray(message.content)
          && message.content.some((part) => part?.type === "text" && part.text === projectionText)
        )
      ),
  );
}

function clearPendingInjectedRevision(state) {
  delete state.pendingInjectedRevision;
  delete state.pendingProjectionText;
  delete state.pendingAckAfterUserIndex;
  if (!hasOwnEntries(state.lastInjectedRevision)) {
    delete state.projectionStateVersion;
  }
}

function clearPendingReadDisposition(state) {
  delete state.pendingReadDispositionByCallId;
}

function normalizeDeliveryState(state) {
  if (state?.projectionStateVersion === 1) {
    delete state?.lastDeliveredCollapsedRevision;
    return state;
  }
  delete state?.lastInjectedRevision;
  delete state?.lastDeliveredCollapsedRevision;
  delete state?.pendingInjectedRevision;
  delete state?.pendingProjectionText;
  delete state?.pendingAckAfterUserIndex;
  delete state?.pendingReadDispositionByCallId;
  delete state?.projectionStateVersion;
  return state;
}

function assistantMessageHasDeliveryContent(message) {
  if (message?.role !== "assistant") return false;
  if (typeof message.content === "string" && message.content.trim().length > 0) return true;
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) return true;
  if (!Array.isArray(message.content)) return false;
  return message.content.some((part) => {
    if (part?.type === "text" && typeof part.text === "string" && part.text.trim().length > 0) return true;
    if (part?.type === "toolCall") return true;
    return false;
  });
}

function lastUserMessageIndex(messages) {
  if (!Array.isArray(messages)) return -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function assistantCompletesUserTurn(messages, userIndex) {
  if (!Array.isArray(messages) || !Number.isInteger(userIndex) || userIndex < 0) return false;
  if (messages[userIndex]?.role !== "user") return false;
  for (let index = userIndex + 1; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") return false;
    if (assistantMessageHasDeliveryContent(messages[index])) return true;
  }
  return false;
}

function requestOnlyProjectionDelivered(messages, pendingAckAfterUserIndex) {
  return Number.isInteger(pendingAckAfterUserIndex)
    && assistantCompletesUserTurn(messages, pendingAckAfterUserIndex);
}

function commitPendingInjectedRevision(state) {
  if (hasOwnEntries(state.pendingInjectedRevision)) {
    state.lastInjectedRevision = { ...state.pendingInjectedRevision };
  }
  clearPendingInjectedRevision(state);
  state.appliedReadDispositionByCallId = {
    ...(state.appliedReadDispositionByCallId ?? {}),
    ...(state.pendingReadDispositionByCallId ?? {}),
  };
  clearPendingReadDisposition(state);
}

function promotePendingInjectedRevision(state, messages) {
  if (state?.projectionStateVersion !== 1) return;
  if (projectionAppliedToMessages(messages, state.pendingProjectionText)) {
    commitPendingInjectedRevision(state);
    return;
  }
  if (hasOwnEntries(state.pendingInjectedRevision)
    && requestOnlyProjectionDelivered(messages, state.pendingAckAfterUserIndex)) {
    commitPendingInjectedRevision(state);
    return;
  }
  if (hasOwnEntries(state.pendingInjectedRevision) || hasOwnEntries(state.pendingReadDispositionByCallId)) {
    clearPendingInjectedRevision(state);
    clearPendingReadDisposition(state);
  }
}

function selectedRevisionsFromProjection(projection) {
  return Object.fromEntries(
    (projection?.selected ?? [])
      .filter((unit) => typeof unit?.id === "string" && typeof unit?.revision === "string")
      .map((unit) => [unit.id, unit.revision]),
  );
}

function countSkipEligibleSelections(lastInjectedRevision, projection) {
  if (!isPlainObject(lastInjectedRevision)) return 0;
  let count = 0;
  for (const unit of projection?.selected ?? []) {
    if (typeof unit?.id !== "string" || typeof unit?.revision !== "string") continue;
    if (lastInjectedRevision[unit.id] === unit.revision) count += 1;
  }
  return count;
}

function officialObservationKey(observation) {
  if (typeof observation?.path !== "string") return null;
  if (observation.scope === "region") {
    const selector = observation.selector ?? `${observation.startLine ?? "?"}:${observation.endLine ?? "?"}`;
    return `region:${observation.path}:${selector}`;
  }
  if (observation.scope === "symbol") {
    if (typeof observation.selector !== "string" || observation.selector.length === 0) return null;
    return `symbol:${observation.path}:${observation.selector}`;
  }
  return `file:${observation.path}`;
}

function latestOfficialReadCallIds(messages, tracked) {
  const latest = new Map();
  for (const message of messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.tool_calls)) continue;
    for (const call of message.tool_calls) {
      const name = call?.function?.name ?? call?.name;
      if (!READ_TOOLS.has(name) || typeof call?.id !== "string") continue;
      const observation = tracked[call.id];
      const key = officialObservationKey(observation);
      if (key) latest.set(key, call.id);
    }
  }
  return new Set(latest.values());
}

function omittedReadDispositionObject(readDispositionByCallId) {
  return Object.fromEntries(
    [...readDispositionByCallId.entries()]
      .filter(([, item]) => item?.disposition === "budget" || item?.disposition === "unresolved")
      .map(([callId, item]) => [callId, { path: item.path, disposition: item.disposition }]),
  );
}

function readDispositionMapFromObject(value) {
  if (!isPlainObject(value)) return new Map();
  return new Map(
    Object.entries(value)
      .filter(([, item]) => typeof item?.path === "string")
      .map(([callId, item]) => [callId, { path: item.path, disposition: item.disposition }]),
  );
}

export async function loadState(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return { calls: {} };
    return normalizeDeliveryState({ ...value });
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
      tailLines: meta.tailLines,
      selector: meta.selector,
    };
  }
  return tracked;
}

function scopeFromObservation(observation, fileContent, fileLineCount) {
  if (
    observation?.scope === "symbol"
    && typeof observation?.selector === "string"
    && observation.selector.length > 0
  ) {
    return { scope: "symbol", selector: observation.selector };
  }
  if (
    observation?.scope === "region"
    && Number.isInteger(observation?.tailLines)
    && observation?.invalidTailObservation === true
  ) {
    return {
      scope: "region",
      selector: observation.selector,
      tailLines: observation.tailLines,
      invalidTailObservation: true,
    };
  }
  if (
    observation?.scope === "region"
    && Number.isInteger(observation?.tailLines)
    && Number.isInteger(observation?.startLine)
    && Number.isInteger(observation?.endLine)
  ) {
    return {
      scope: "region",
      startLine: observation.startLine,
      endLine: observation.endLine,
      selector: observation.selector,
      tailLines: observation.tailLines,
    };
  }
  const scopeMeta = tailRegionFromObservation({
    scope: observation.scope ?? "file",
    startLine: observation.startLine,
    endLine: observation.endLine,
    tailLines: observation.tailLines,
    selector: observation.selector,
  }, fileContent, observation.content);
  if (scopeMeta?.invalidTailObservation) return scopeMeta;
  return normalizeHermesReadScope(scopeMeta, fileLineCount);
}

function failClosedInvalidTailObservationUnits(tracked, unitsByCall) {
  for (const [callId, observation] of Object.entries(tracked)) {
    if (observation?.invalidTailObservation !== true) continue;
    const unit = unitsByCall.get(callId);
    if (!unit || unit.scope !== "region") continue;
    unit.state = "unresolved";
    unit.resolutionMethod = "tail-lines-invalid-observation";
  }
}

async function failClosedTailLineShiftedUnits(cwd, tracked, unitsByCall) {
  if (!cwd) return;
  for (const [callId, observation] of Object.entries(tracked)) {
    if (
      !Number.isInteger(observation?.tailLines)
      || !Number.isInteger(observation?.observedFileLineCount)
      || !Number.isInteger(observation?.startLine)
      || !Number.isInteger(observation?.endLine)
    ) {
      continue;
    }

    const unit = unitsByCall.get(callId);
    if (!unit || unit.scope !== "region" || unit.state !== "resolved") continue;

    let currentFileLineCount;
    try {
      const file = await safeWorkspaceFile(cwd, observation.path);
      currentFileLineCount = lineCount(file.content);
    } catch {
      continue;
    }

    if (currentFileLineCount === observation.observedFileLineCount) continue;
    if (unit.startLine === observation.startLine && unit.endLine === observation.endLine) continue;

    unit.state = "unresolved";
    unit.resolutionMethod = "tail-lines-line-count-shift";
    unit.startLine = observation.startLine;
    unit.endLine = observation.endLine;
  }
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
      const scopeMeta = scopeFromObservation(observation, file.content, observedFileLineCount);
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

function enrichCallsWithTracked(calls, tracked) {
  const enriched = {};
  for (const [callId, observation] of Object.entries(calls)) {
    const trackedObservation = tracked[callId];
    if (!trackedObservation) {
      enriched[callId] = observation;
      continue;
    }
    enriched[callId] = {
      path: trackedObservation.path,
      scope: trackedObservation.scope ?? observation.scope ?? "file",
      startLine: trackedObservation.startLine,
      endLine: trackedObservation.endLine,
      tailLines: trackedObservation.tailLines ?? observation.tailLines,
      selector: trackedObservation.selector ?? observation.selector,
    };
  }
  return enriched;
}

function mergeTrackedCalls(stored, incoming) {
  const merged = { ...stored };
  for (const [callId, observation] of Object.entries(incoming)) {
    const previous = stored[callId];
    merged[callId] = {
      ...observation,
      ...(Number.isInteger(previous?.startLine) && !Number.isInteger(observation?.startLine)
        ? { startLine: previous.startLine }
        : {}),
      ...(Number.isInteger(previous?.endLine) && !Number.isInteger(observation?.endLine)
        ? { endLine: previous.endLine }
        : {}),
      ...(Number.isInteger(previous?.observedFileLineCount)
        ? { observedFileLineCount: previous.observedFileLineCount }
        : {}),
      ...(previous?.selector != null && observation?.selector == null
        ? { selector: previous.selector }
        : {}),
      ...(Number.isInteger(previous?.tailLines) && !Number.isInteger(observation?.tailLines)
        ? { tailLines: previous.tailLines }
        : {}),
      ...(previous?.invalidTailObservation === true
        ? { invalidTailObservation: true }
        : {}),
    };
  }
  return merged;
}

export async function observeTurn(payload) {
  const state = await loadState(payload.stateFile);
  promotePendingInjectedRevision(state, payload.messages);
  const calls = { ...(state.calls ?? {}), ...discoveredCalls(payload.messages) };
  const tracked = mergeTrackedCalls(
    state.tracked ?? {},
    trackedCallsFromMessages(payload.messages),
  );
  state.tracked = await enrichTrackedWithLineCounts(payload.cwd, tracked);
  state.calls = enrichCallsWithTracked(calls, state.tracked);
  state.updatedAt = new Date().toISOString();
  await saveState(payload.stateFile, state);
  return { observedCalls: Object.keys(state.calls).length };
}

export async function selectContext(payload) {
  const state = await loadState(payload.stateFile);
  const conversationMessages = Array.isArray(payload.conversationMessages)
    ? payload.conversationMessages
    : payload.messages;
  promotePendingInjectedRevision(state, conversationMessages);
  const tracked = await enrichTrackedWithLineCounts(
    payload.cwd,
    mergeTrackedCalls(
      state.tracked ?? {},
      trackedCallsFromMessages(payload.messages),
    ),
  );
  const calls = enrichCallsWithTracked(
    { ...(state.calls ?? {}), ...discoveredCalls(payload.messages) },
    tracked,
  );
  const paths = [...new Set(Object.values(calls).map((call) => call.path ?? call))].sort();
  if (paths.length === 0) {
    state.updatedAt = new Date().toISOString();
    await saveState(payload.stateFile, state);
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
  const engine = createAdapterEngine(semanticEngineOptionsForBridge(payload));
  const unitsByCall = new Map();
  const shellCallIds = new Set(Object.keys(shellCallsFromMessages(payload.messages)));
  const activeOfficialCallIds = latestOfficialReadCallIds(payload.messages, tracked);
  for (const [callId, observation] of Object.entries(tracked)) {
    if (!shellCallIds.has(callId) && !activeOfficialCallIds.has(callId)) continue;
    try {
      let trackArgs;
      if (shellCallIds.has(callId)) {
        const file = await safeWorkspaceFile(payload.cwd, observation.path);
        const observedFileLineCount = observation.observedFileLineCount ?? lineCount(file.content);
        const scopeMeta = scopeFromObservation(observation, file.content, observedFileLineCount);
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
        } else if (scopeMeta.scope === "symbol") {
          if (!observation.content) continue;
          trackArgs = {
            path: file.path,
            content: observation.content,
            scope: "symbol",
            selector: scopeMeta.selector,
            startLine: 1,
            endLine: lineCount(observation.content),
          };
        } else {
          trackArgs = {
            path: file.path,
            content: file.content,
            scope: "file",
          };
        }
      } else if (observation.scope === "symbol") {
        trackArgs = {
          path: observation.path,
          content: observation.content,
          scope: "symbol",
          selector: observation.selector,
          startLine: 1,
          endLine: lineCount(observation.content),
        };
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

  failClosedInvalidTailObservationUnits(tracked, unitsByCall);
  await failClosedTailLineShiftedUnits(payload.cwd, tracked, unitsByCall);

  const projection = engine.project({
    task: taskFrom(payload),
    budgetChars,
  });
  const skipEligibleSelections = countSkipEligibleSelections(state.lastInjectedRevision, projection);
  const servedCallIds = servedReadCallIdsFromUnitsByCall(unitsByCall, projection);
  const readDispositionByCallId = readDispositionByUnitsByCall(unitsByCall, projection);
  const projectionText = resolveProjectionText({
    messages: payload.messages,
    projection,
    skipEligibleSelections,
    userCountMessages: conversationMessages,
  });
  const pendingInjectedRevision = selectedRevisionsFromProjection(projection);
  const pendingReadDispositionByCallId = omittedReadDispositionObject(readDispositionByCallId);
  if (projectionText.length > 0 && (
    hasOwnEntries(pendingInjectedRevision) || hasOwnEntries(pendingReadDispositionByCallId)
  )) {
    state.projectionStateVersion = 1;
    if (hasOwnEntries(pendingInjectedRevision)) {
      state.pendingInjectedRevision = pendingInjectedRevision;
    } else {
      delete state.pendingInjectedRevision;
    }
    state.pendingProjectionText = projectionText;
    state.pendingAckAfterUserIndex = lastUserMessageIndex(conversationMessages);
    if (hasOwnEntries(pendingReadDispositionByCallId)) {
      state.pendingReadDispositionByCallId = pendingReadDispositionByCallId;
    } else {
      clearPendingReadDisposition(state);
    }
  } else {
    clearPendingInjectedRevision(state);
    clearPendingReadDisposition(state);
  }
  state.updatedAt = new Date().toISOString();
  await saveState(payload.stateFile, state);
  const rewritten = replaceTrackedReadToolResults(payload.messages, {
    unitForCallId: (id) => unitsByCall.get(id),
    projection,
    skipEligibleSelections,
    projectionText,
    lastInjectedRevision: isPlainObject(state.lastInjectedRevision)
      ? new Map(Object.entries(state.lastInjectedRevision))
      : new Map(),
    userCountMessages: conversationMessages,
  });
  const assembled = dropUnservedReadToolPairs(replaceHistoricalProjectionMessages(rewritten), {
    readTools: HERMES_TRACKED_TOOLS,
    servedCallIds,
    observedCallIds: readToolCallIds(payload.messages, HERMES_TRACKED_TOOLS),
    trackedPaths: engine.registry.list().map((unit) => unit.path),
    projection,
    readDispositionByCallId,
    historicalReadDispositionByCallId: readDispositionMapFromObject(state.appliedReadDispositionByCallId),
  });
  return {
    messages: projectionText.length > 0
      ? [...assembled, { role: "user", content: projectionText }]
      : assembled,
    selected: projection.selected.length,
    unresolved: projection.omitted.filter((item) => item.reason === "unresolved").length,
    applied: engine.registry.list().length > 0,
    projectionText,
    telemetry: {
      totalMs: 0,
      projectionBytes: Buffer.byteLength(projectionText, "utf8"),
      skipEligibleSelections,
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

function invokedAsCli() {
  if (!process.argv[1]) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(modulePath) === realpathSync(process.argv[1]);
  } catch {
    return modulePath === process.argv[1];
  }
}

const invoked = invokedAsCli();
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
