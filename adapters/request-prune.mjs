/** Adapter request assembly: drop unserved read tool pairs whenever a projection is applied. */

import { SHELL_TOOLS, shellCommandFromInput, trackedPathsMentionedInCommand } from "./shell-read.mjs";

/**
 * Live adapter default (chars counted in policy selection, not envelope bytes).
 * Replay: 20 ordinary source files + one 64k-char file whose official read is
 * budget-omitted while a tracked `head` slice is served (PCR 0078 large board).
 */
export const DEFAULT_BUDGET_CHARS = 32_768;

export function resolveAdapterBudgetChars({
  budgetChars,
  budgetTokens = 0,
  defaultBudget = DEFAULT_BUDGET_CHARS,
} = {}) {
  const envBudget = Number(process.env.FRESHCTX_BUDGET_CHARS);
  if (Number.isFinite(envBudget) && envBudget > 0) return envBudget;

  const explicit = Number(budgetChars);
  const derived = Math.min(
    32_000,
    Math.max(4_000, Math.floor(Number(budgetTokens) * 4 * 0.15)),
  );

  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (Number(budgetTokens) > 0 && Number.isFinite(derived) && derived > 0) return derived;
  return defaultBudget;
}

function callName(call) {
  return call?.function?.name ?? call?.name;
}

function callId(call) {
  return call?.id;
}

/** OpenAI `tool_calls` or Pi-native `{ type: "toolCall" }` content parts. */
export function assistantToolCalls(message) {
  if (message?.role !== "assistant") return [];
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) return message.tool_calls;
  if (!Array.isArray(message.content)) return [];
  return message.content.filter((part) => part?.type === "toolCall");
}

function toolResultCallId(message) {
  if (message?.role !== "tool" && message?.role !== "toolResult") return undefined;
  const id = message.tool_call_id ?? message.toolCallId;
  return typeof id === "string" ? id : undefined;
}

function assistantHasNonToolContent(message) {
  if (typeof message.content === "string") return message.content.trim().length > 0;
  if (!Array.isArray(message.content)) return false;
  return message.content.some((part) => {
    if (part?.type === "text" && typeof part.text === "string" && part.text.trim().length > 0) return true;
    if (part?.type === "thinking" && typeof part.thinking === "string" && part.thinking.trim().length > 0) return true;
    return false;
  });
}

export function readToolCallIds(messages, readTools) {
  const ids = new Set();
  for (const message of messages) {
    for (const call of assistantToolCalls(message)) {
      const name = callName(call);
      const id = callId(call);
      if (!readTools.has(name) || typeof id !== "string") continue;
      ids.add(id);
    }
  }
  return ids;
}

export function unservedReadToolCallIds(messages, readTools, servedCallIds, observedCallIds) {
  const served = servedCallIds instanceof Set ? servedCallIds : new Set(servedCallIds);
  const observed = observedCallIds instanceof Set
    ? observedCallIds
    : (observedCallIds ? new Set(observedCallIds) : null);
  const drop = new Set();
  for (const id of readToolCallIds(messages, readTools)) {
    if (observed && !observed.has(id)) continue;
    if (!served.has(id)) drop.add(id);
  }
  return drop;
}

function unitIdsFromProjectionOmission(projection, reason) {
  return new Set(
    projection.omitted
      .filter((item) => item.reason === reason)
      .map((item) => item.unit?.id ?? item.id),
  );
}

export function servedReadCallIdsFromProjection(callToUnit, projection) {
  const selectedIds = new Set(projection.selected.map((unit) => unit.id));
  const unresolvedIds = unitIdsFromProjectionOmission(projection, "unresolved");
  const served = new Set();
  for (const [callId, unitId] of callToUnit.entries()) {
    const id = typeof unitId === "object" ? unitId.id : unitId;
    if (selectedIds.has(id) || unresolvedIds.has(id)) served.add(callId);
  }
  return served;
}

/** Map callId -> unit object (Hermes bridge uses unit objects, Pi uses unit ids). */
export function servedReadCallIdsFromUnitsByCall(unitsByCall, projection) {
  const selectedIds = new Set(projection.selected.map((unit) => unit.id));
  const unresolvedIds = unitIdsFromProjectionOmission(projection, "unresolved");
  const served = new Set();
  for (const [callId, unit] of unitsByCall.entries()) {
    if (selectedIds.has(unit.id) || unresolvedIds.has(unit.id)) served.add(callId);
  }
  return served;
}

function callDispositionByEntries(entries, projection) {
  const selectedIds = new Set(projection.selected.map((unit) => unit.id));
  const budgetIds = unitIdsFromProjectionOmission(projection, "budget");
  const unresolvedIds = unitIdsFromProjectionOmission(projection, "unresolved");
  const dispositions = new Map();
  for (const [callId, mappedUnit] of entries.entries()) {
    const unit = typeof mappedUnit === "object" ? mappedUnit : { id: mappedUnit };
    if (!unit?.id || typeof unit?.path !== "string") continue;
    if (selectedIds.has(unit.id)) {
      dispositions.set(callId, { path: unit.path, disposition: "selected" });
      continue;
    }
    if (budgetIds.has(unit.id)) {
      dispositions.set(callId, { path: unit.path, disposition: "budget" });
      continue;
    }
    if (unresolvedIds.has(unit.id)) {
      dispositions.set(callId, { path: unit.path, disposition: "unresolved" });
    }
  }
  return dispositions;
}

export function readDispositionByCallToUnit(callToUnit, registry, projection) {
  const entries = new Map();
  for (const [callId, unitId] of callToUnit.entries()) {
    const id = typeof unitId === "object" ? unitId.id : unitId;
    const unit = registry?.get?.(id);
    if (typeof id !== "string" || !unit) continue;
    entries.set(callId, { id, path: unit.path });
  }
  return callDispositionByEntries(entries, projection);
}

export function readDispositionByUnitsByCall(unitsByCall, projection) {
  return callDispositionByEntries(unitsByCall, projection);
}

function toolCallArguments(call) {
  const raw = call?.function?.arguments ?? call?.arguments ?? call?.input ?? {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw : {};
}

export function staleShellDumpCallIds(messages, { trackedPaths, servedCallIds } = {}) {
  return new Set(staleShellDumpPathByCallId(messages, { trackedPaths, servedCallIds }).keys());
}

export function staleShellDumpPathByCallId(
  messages,
  { trackedPaths, servedCallIds, pathDispositions } = {},
) {
  const served = servedCallIds instanceof Set ? servedCallIds : new Set(servedCallIds ?? []);
  const paths = Array.isArray(trackedPaths) ? trackedPaths : [];
  const replace = new Map();
  if (paths.length === 0) return replace;

  for (const message of messages) {
    for (const call of assistantToolCalls(message)) {
      const name = callName(call);
      const id = callId(call);
      if (!SHELL_TOOLS.has(name) || typeof id !== "string") continue;
      const command = shellCommandFromInput(toolCallArguments(call));
      if (!command) continue;
      const hits = trackedPathsMentionedInCommand(command, paths);
      if (hits.length !== 1) continue;
      if (served.has(id) && pathDispositions?.get(hits[0]) !== "unresolved") continue;
      replace.set(id, hits[0]);
    }
  }
  return replace;
}

function projectionDispositionByPath(projection) {
  const dispositions = new Map();
  for (const unit of projection?.selected ?? []) {
    dispositions.set(unit.path, "selected");
  }
  for (const item of projection?.omitted ?? []) {
    const path = item.unit?.path;
    if (typeof path !== "string" || dispositions.has(path)) continue;
    dispositions.set(path, item.reason === "budget" ? "budget" : "unresolved");
  }
  return dispositions;
}

function staleDumpMarker(path, disposition) {
  if (disposition === "selected") {
    return `[freshctx:stale-dump path=${path}] Current content is supplied in the live projection.`;
  }
  if (disposition === "budget") {
    return `[freshctx:stale-dump path=${path}] Current content was omitted from the live projection for budget.`;
  }
  if (disposition === "unresolved") {
    return `[freshctx:stale-dump path=${path}] Current content is not supplied because the tracked unit is unresolved.`;
  }
  return `[freshctx:stale-dump path=${path}] Current content is not supplied in the live projection.`;
}

function withReplacedDumpBody(message, path, disposition) {
  const marker = staleDumpMarker(path, disposition);
  const content = Array.isArray(message.content)
    ? [{ type: "text", text: marker }]
    : marker;
  return { ...structuredClone(message), content };
}

function omittedReadMarker(path, disposition) {
  if (disposition === "budget") {
    return `[freshctx:omitted-read path=${path}] Current content was omitted from the live projection for budget.`;
  }
  if (disposition === "unresolved") {
    return `[freshctx:omitted-read path=${path}] Current content is not supplied because the tracked unit is unresolved.`;
  }
  return `[freshctx:omitted-read path=${path}] Current content is not supplied in the live projection.`;
}

function withReplacedReadBody(message, path, disposition) {
  const marker = omittedReadMarker(path, disposition);
  const content = Array.isArray(message.content)
    ? [{ type: "text", text: marker }]
    : marker;
  return { ...structuredClone(message), content };
}

export function dropUnservedReadToolPairs(messages, {
  readTools,
  servedCallIds,
  trackedPaths,
  observedCallIds,
  projection,
  readDispositionByCallId,
} = {}) {
  const dropIds = unservedReadToolCallIds(messages, readTools, servedCallIds, observedCallIds);
  const dispositions = projectionDispositionByPath(projection);
  const keptReadCalls = readDispositionByCallId instanceof Map ? readDispositionByCallId : new Map();
  for (const [callId, item] of keptReadCalls.entries()) {
    if (item?.disposition === "budget" || item?.disposition === "unresolved") {
      dropIds.delete(callId);
    }
  }
  const dumpPaths = staleShellDumpPathByCallId(messages, {
    trackedPaths,
    servedCallIds,
    pathDispositions: dispositions,
  });
  for (const id of dumpPaths.keys()) dropIds.delete(id);

  const hasReadReplacements = [...keptReadCalls.values()].some(
    (item) => item?.disposition === "budget" || item?.disposition === "unresolved",
  );
  if (dropIds.size === 0 && dumpPaths.size === 0 && !hasReadReplacements) {
    return messages.map((message) => structuredClone(message));
  }

  const kept = [];
  for (const message of messages) {
    const resultId = toolResultCallId(message);
    if (resultId) {
      if (dropIds.has(resultId)) continue;
      if (dumpPaths.has(resultId)) {
        const path = dumpPaths.get(resultId);
        kept.push(withReplacedDumpBody(message, path, dispositions.get(path)));
        continue;
      }
      if (keptReadCalls.has(resultId)) {
        const { path, disposition } = keptReadCalls.get(resultId);
        if (disposition === "budget" || disposition === "unresolved") {
          kept.push(withReplacedReadBody(message, path, disposition));
          continue;
        }
      }
      kept.push(structuredClone(message));
      continue;
    }

    if (message?.role === "assistant" && Array.isArray(message.tool_calls)) {
      const toolCalls = message.tool_calls.filter((call) => !dropIds.has(call?.id));
      if (toolCalls.length === 0 && !assistantHasNonToolContent(message)) continue;
      kept.push({ ...structuredClone(message), tool_calls: toolCalls });
      continue;
    }

    if (message?.role === "assistant" && Array.isArray(message.content)
      && message.content.some((part) => part?.type === "toolCall")) {
      const content = message.content.filter(
        (part) => part?.type !== "toolCall" || !dropIds.has(part?.id),
      );
      const remainingCalls = content.filter((part) => part?.type === "toolCall");
      if (remainingCalls.length === 0 && !assistantHasNonToolContent({ ...message, content })) continue;
      kept.push({ ...structuredClone(message), content });
      continue;
    }

    kept.push(structuredClone(message));
  }
  return kept;
}
