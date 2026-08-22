/** Budget-pressure request assembly: drop filler tool pairs under tight budgets. */

export const FILLER_PATH_PREFIX = "lab/filler/";

export const BUDGET_PRUNE_CHARS_THRESHOLD = 4_000;

export function isStaleFillerPath(path) {
  return typeof path === "string" && path.startsWith(FILLER_PATH_PREFIX);
}

export function shouldPruneAdapterRequest(budgetChars) {
  return Number.isFinite(budgetChars) && budgetChars > 0 && budgetChars <= BUDGET_PRUNE_CHARS_THRESHOLD;
}

export function resolveAdapterBudgetChars({
  budgetChars,
  budgetTokens = 0,
  defaultBudget = 24_000,
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

function readPathFromCall(call) {
  const argsRaw = call?.function?.arguments ?? call?.arguments;
  if (argsRaw && typeof argsRaw === "object") {
    return argsRaw.path ?? argsRaw.file_path;
  }
  if (typeof argsRaw !== "string") return undefined;
  try {
    const args = JSON.parse(argsRaw);
    return args?.path ?? args?.file_path;
  } catch {
    return undefined;
  }
}

export function fillerToolCallIds(messages, readTools) {
  const fillerIds = new Set();
  for (const message of messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.tool_calls)) continue;
    for (const call of message.tool_calls) {
      const name = call?.function?.name ?? call?.name;
      if (!readTools.has(name) || typeof call?.id !== "string") continue;
      const path = readPathFromCall(call);
      if (isStaleFillerPath(path)) fillerIds.add(call.id);
    }
  }
  return fillerIds;
}

export function dropStaleFillerToolPairs(messages, { readTools }) {
  const fillerIds = fillerToolCallIds(messages, readTools);
  if (fillerIds.size === 0) return messages.map((message) => structuredClone(message));

  const kept = [];
  for (const message of messages) {
    if (message?.role === "tool") {
      const id = message.tool_call_id ?? message.toolCallId;
      if (typeof id === "string" && fillerIds.has(id)) continue;
      kept.push(structuredClone(message));
      continue;
    }

    if (message?.role === "assistant" && Array.isArray(message.tool_calls)) {
      const toolCalls = message.tool_calls.filter((call) => !fillerIds.has(call?.id));
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
