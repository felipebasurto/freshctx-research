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

export function staleShellDumpPathByCallId(messages, { trackedPaths, servedCallIds } = {}) {
  const served = servedCallIds instanceof Set ? servedCallIds : new Set(servedCallIds ?? []);
  const paths = Array.isArray(trackedPaths) ? trackedPaths : [];
  const replace = new Map();
  if (paths.length === 0) return replace;

  for (const message of messages) {
    for (const call of assistantToolCalls(message)) {
      const name = callName(call);
      const id = callId(call);
      if (!SHELL_TOOLS.has(name) || typeof id !== "string") continue;
      if (served.has(id)) continue;
      const command = shellCommandFromInput(toolCallArguments(call));
      if (!command) continue;
      const hits = trackedPathsMentionedInCommand(command, paths);
      if (hits.length === 1) replace.set(id, hits[0]);
    }
  }
  return replace;
}

function staleDumpMarker(path) {
  return `[freshctx:stale-dump path=${path}] Shell dump removed. Check the live projection.`;
}

function withReplacedDumpBody(message, path) {
  const marker = staleDumpMarker(path);
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
} = {}) {
  const dropIds = unservedReadToolCallIds(messages, readTools, servedCallIds, observedCallIds);
  const dumpPaths = staleShellDumpPathByCallId(messages, { trackedPaths, servedCallIds });
  for (const id of dropIds) dumpPaths.delete(id);

  if (dropIds.size === 0 && dumpPaths.size === 0) {
    return messages.map((message) => structuredClone(message));
  }

  const kept = [];
  for (const message of messages) {
    const resultId = toolResultCallId(message);
    if (resultId) {
      if (dropIds.has(resultId)) continue;
      if (dumpPaths.has(resultId)) {
        kept.push(withReplacedDumpBody(message, dumpPaths.get(resultId)));
        continue;
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
