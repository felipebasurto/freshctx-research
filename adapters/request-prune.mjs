/** Adapter request assembly: drop unserved read tool pairs whenever a projection is applied. */

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

export function readToolCallIds(messages, readTools) {
  const ids = new Set();
  for (const message of messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.tool_calls)) continue;
    for (const call of message.tool_calls) {
      const name = call?.function?.name ?? call?.name;
      if (!readTools.has(name) || typeof call?.id !== "string") continue;
      ids.add(call.id);
    }
  }
  return ids;
}

export function unservedReadToolCallIds(messages, readTools, servedCallIds) {
  const served = servedCallIds instanceof Set ? servedCallIds : new Set(servedCallIds);
  const drop = new Set();
  for (const id of readToolCallIds(messages, readTools)) {
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

export function dropUnservedReadToolPairs(messages, { readTools, servedCallIds }) {
  const dropIds = unservedReadToolCallIds(messages, readTools, servedCallIds);
  if (dropIds.size === 0) return messages.map((message) => structuredClone(message));

  const kept = [];
  for (const message of messages) {
    if (message?.role === "tool") {
      const id = message.tool_call_id ?? message.toolCallId;
      if (typeof id === "string" && dropIds.has(id)) continue;
      kept.push(structuredClone(message));
      continue;
    }

    if (message?.role === "assistant" && Array.isArray(message.tool_calls)) {
      const toolCalls = message.tool_calls.filter((call) => !dropIds.has(call?.id));
      if (toolCalls.length === 0) {
        const hasNonToolContent = typeof message.content === "string"
          ? message.content.trim().length > 0
          : Array.isArray(message.content) && message.content.some(
            (part) => part?.type === "text" && typeof part.text === "string" && part.text.trim().length > 0,
          );
        if (!hasNonToolContent) continue;
      }
      kept.push({ ...structuredClone(message), tool_calls: toolCalls });
      continue;
    }

    kept.push(structuredClone(message));
  }
  return kept;
}
