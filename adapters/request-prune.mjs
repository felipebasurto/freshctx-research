/** Adapter request assembly: drop unserved read tool pairs whenever a projection is applied. */

import { decodeProjectionUnits, stableReadMarker } from "../src/index.mjs";

import {
  SHELL_TOOLS,
  shellCommandFromInput,
  shellDumpPathsFromCommand,
  trackedPathsMentionedInCommand,
} from "./shell-read.mjs";

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

function readObservationKey(observation) {
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

function textMessageContent(message) {
  if (typeof message?.content === "string") return message.content;
  if (!Array.isArray(message?.content)) return null;
  const textParts = message.content.filter((part) => part?.type === "text" && typeof part.text === "string");
  if (textParts.length !== message.content.length) return null;
  return textParts.map((part) => part.text).join("\n");
}

function textFromToolContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function withToolResultContent(message, content) {
  if (Array.isArray(message?.content)) {
    return { ...structuredClone(message), content: [{ type: "text", text: content }] };
  }
  return { ...structuredClone(message), content };
}

function hasAssistantReplyBetweenFirstAndLastUser(messages) {
  let seenFirstUser = false;
  let seenAssistantAfterFirstUser = false;
  for (const message of messages) {
    if (message?.role === "user") {
      if (!seenFirstUser) {
        seenFirstUser = true;
        continue;
      }
      return seenAssistantAfterFirstUser;
    }
    if (seenFirstUser && message?.role === "assistant" && assistantHasNonToolContent(message)) {
      seenAssistantAfterFirstUser = true;
    }
  }
  return false;
}

/**
 * Turn-2 first-NEW seam: the tracked read is stale relative to disk, but the
 * provider still sees only the summary marker at the read tool result. Inline
 * the current selected unit bytes there while the tail keeps the full live
 * projection envelope (PCR 0079 single-user boards stay full-body in projection).
 */
export function shouldInlineServedReadAtToolResult({
  messages,
  projection,
  skipEligibleSelections,
  projectionText,
  lastInjectedRevision,
  userCountMessages = messages,
}) {
  if (userMessageCount(userCountMessages) !== 2) return false;
  if (!hasAssistantReplyBetweenFirstAndLastUser(userCountMessages)) return false;
  if (!(lastInjectedRevision instanceof Map) || lastInjectedRevision.size === 0) return false;
  if (typeof projectionText !== "string" || !projectionText.includes("<freshctx-unit")) return false;
  if (skipEligibleSelections !== 0) return false;
  if ((projection?.selected?.length ?? 0) === 0) return false;
  if ((projection?.omitted?.length ?? 0) !== 0) return false;
  return true;
}

/** True when the live tail carries bounded unit body bytes models can quote (not stub/empty). */
export function projectionCarriesQuoteableUnits(projectionText) {
  if (typeof projectionText !== "string" || projectionText.length === 0) return false;
  if (isCurrentCollapsedProjectionMarker(projectionText)) return false;
  if (!projectionText.includes("<freshctx-unit")) return false;
  try {
    const units = decodeProjectionUnits(projectionText);
    return units.some((unit) => String(unit.content ?? "").length > 0);
  } catch {
    return false;
  }
}

/**
 * Provider-neutral quoteability: inline bounded current bytes at the original
 * read tool-result slot when the tail does not carry quoteable unit bodies
 * (Design D), or on the turn-2 first-NEW seam while the tail keeps the full
 * envelope (PCR 0098). Fail closed when the unit has no current content (P5).
 */
export function shouldInlineSelectedReadAtToolResult({
  unit,
  observedContent,
  projectionText,
  selectedUnitIds,
  turn2FirstNewGate = false,
}) {
  if (!selectedUnitIds.has(unit.id)) return false;
  const current = String(unit.content ?? "");
  if (current.length === 0) return false;
  if (turn2FirstNewGate) {
    const observed = textFromToolContent(observedContent);
    if (observed.length > 0 && observed === current) return false;
    return true;
  }
  return !projectionCarriesQuoteableUnits(projectionText);
}

/**
 * PCR 0108: after a prior-turn budget omit, later unchanged turns inline bounded
 * current bytes at the latest read slot when the tail carries no quoteable bodies.
 * Turn-1 first delivery and fresh same-turn over-cap reads stay omitted markers.
 */
export function shouldInlineBudgetOmittedReadAtToolResult({
  userCountMessages = [],
  unit,
  projectionText,
}) {
  if (userMessageCount(userCountMessages) <= 1) return false;
  if (unit?.state !== "resolved") return false;
  const current = String(unit?.content ?? "");
  if (current.length === 0) return false;
  return !projectionCarriesQuoteableUnits(projectionText);
}

export function replaceBudgetOmittedReadQuoteability(messages, {
  unitForCallId,
  projectionText,
  userCountMessages = messages,
  historicalReadDispositionByCallId = new Map(),
  latestReadCallIds,
} = {}) {
  const budgetHistorical = new Set();
  for (const [callId, item] of historicalReadDispositionByCallId.entries()) {
    if (item?.disposition === "budget") budgetHistorical.add(callId);
  }
  const latest = latestReadCallIds instanceof Set
    ? latestReadCallIds
    : new Set(latestReadCallIds ?? []);

  return messages.map((message) => {
    const callId = toolResultCallId(message);
    if (!callId || !budgetHistorical.has(callId) || !latest.has(callId)) {
      return structuredClone(message);
    }
    const unit = unitForCallId(callId);
    if (!unit) return structuredClone(message);
    if (!shouldInlineBudgetOmittedReadAtToolResult({
      userCountMessages,
      unit,
      projectionText,
    })) {
      return structuredClone(message);
    }
    return withToolResultContent(message, String(unit.content ?? ""));
  });
}

export function servedReadToolResultContent({
  unit,
  inlineSelectedRead = false,
  selectedUnitIds,
}) {
  if (!inlineSelectedRead || !selectedUnitIds.has(unit.id)) {
    return stableReadMarker(unit);
  }
  const current = String(unit.content ?? "");
  if (current.length === 0) return stableReadMarker(unit);
  return current;
}

export function replaceTrackedReadToolResults(messages, {
  unitForCallId,
  projection,
  skipEligibleSelections,
  projectionText,
  lastInjectedRevision,
  userCountMessages = messages,
} = {}) {
  const turn2FirstNewGate = shouldInlineServedReadAtToolResult({
    messages,
    projection,
    skipEligibleSelections,
    projectionText,
    lastInjectedRevision,
    userCountMessages,
  });
  const selectedUnitIds = new Set((projection?.selected ?? []).map((unit) => unit.id));
  return messages.map((message) => {
    const callId = toolResultCallId(message);
    if (!callId) return structuredClone(message);
    const unit = unitForCallId(callId);
    if (!unit) return structuredClone(message);
    const inlineSelectedRead = shouldInlineSelectedReadAtToolResult({
      unit,
      observedContent: message.content,
      projectionText,
      selectedUnitIds,
      turn2FirstNewGate,
    });
    const content = servedReadToolResultContent({
      unit,
      inlineSelectedRead,
      selectedUnitIds,
    });
    return withToolResultContent(message, content);
  });
}

function replaceTextMessageContent(message, text) {
  if (typeof message?.content === "string") return { ...structuredClone(message), content: text };
  if (!Array.isArray(message?.content)) return structuredClone(message);
  return { ...structuredClone(message), content: [{ type: "text", text }] };
}

function freshCtxProjectionInfo(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("<freshctx ") || !trimmed.endsWith("</freshctx>")) return null;
  try {
    const units = decodeProjectionUnits(text);
    return { unitCount: units.length };
  } catch {
    return null;
  }
}

function historicalProjectionMarker({ unitCount }) {
  return `[freshctx:already-served units=${unitCount}] Historical FreshCtx projection omitted; see latest live projection below.`;
}

export function currentProjectionMarker({ unitCount }) {
  return `[freshctx:already-served units=${unitCount}] Current tracked content was already served and disk is unchanged.`;
}

export function revisionsRecordFromProjection(projection) {
  return Object.fromEntries(
    (projection?.selected ?? [])
      .filter((unit) => typeof unit?.id === "string" && typeof unit?.revision === "string")
      .map((unit) => [unit.id, unit.revision]),
  );
}

export function isCurrentCollapsedProjectionMarker(text) {
  return typeof text === "string"
    && text.startsWith("[freshctx:already-served units=")
    && text.includes("Current tracked content was already served and disk is unchanged.");
}

export function resolveProjectionText({
  messages,
  projection,
  skipEligibleSelections,
  userCountMessages = messages,
}) {
  if (shouldCollapseCurrentProjection(
    messages,
    projection,
    skipEligibleSelections,
    { userCountMessages },
  )) {
    return "";
  }
  return projection.text;
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

export function latestReadCallIdsByObservation(messages, observationsByCallId, readTools) {
  const observations = observationsByCallId instanceof Map
    ? observationsByCallId
    : new Map(Object.entries(observationsByCallId ?? {}));
  const latest = new Map();
  for (const message of messages) {
    for (const call of assistantToolCalls(message)) {
      const name = callName(call);
      const id = callId(call);
      if (!readTools.has(name) || typeof id !== "string") continue;
      const observation = observations.get(id);
      const key = readObservationKey(observation);
      if (key) latest.set(key, id);
    }
  }
  return new Set(latest.values());
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
      const match = trackedDumpPathsForCommand(command, paths);
      if (!match) continue;
      if (match.trackedPaths.length === 1
        && match.untrackedPaths.length === 0
        && served.has(id)
        && pathDispositions?.get(match.trackedPaths[0]) !== "unresolved") {
        continue;
      }
      replace.set(id, match);
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

function matchTrackedPath(namedPath, trackedPaths) {
  const normalizedNamed = String(namedPath ?? "").replace(/^\.\//u, "");
  let best = null;
  for (const trackedPath of trackedPaths) {
    if (typeof trackedPath !== "string" || trackedPath.length === 0) continue;
    const normalizedTracked = trackedPath.replace(/^\.\//u, "");
    if (normalizedNamed === normalizedTracked) {
      if (best == null || trackedPath.length > best.length) best = trackedPath;
    }
  }
  return best;
}

function trackedDumpPathsForCommand(command, trackedPaths) {
  const namedPaths = shellDumpPathsFromCommand(command);
  if (namedPaths.length >= 2) {
    const resolved = [];
    const untracked = [];
    const seen = new Set();
    const seenUntracked = new Set();
    for (const namedPath of namedPaths) {
      const trackedPath = matchTrackedPath(namedPath, trackedPaths);
      if (!trackedPath) {
        const normalizedNamed = String(namedPath ?? "").replace(/^\.\//u, "");
        if (!seenUntracked.has(normalizedNamed)) {
          seenUntracked.add(normalizedNamed);
          untracked.push(normalizedNamed);
        }
        continue;
      }
      if (seen.has(trackedPath)) continue;
      seen.add(trackedPath);
      resolved.push(trackedPath);
    }
    return resolved.length > 0
      ? { trackedPaths: resolved, untrackedPaths: untracked }
      : null;
  }

  const singleHits = trackedPathsMentionedInCommand(command, trackedPaths);
  return singleHits.length === 1
    ? { trackedPaths: singleHits, untrackedPaths: [] }
    : null;
}

function staleDumpMarkerForSinglePath(path, disposition) {
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

function staleDumpMarker({ trackedPaths, untrackedPaths }, pathDispositions) {
  if (trackedPaths.length === 1) {
    const [path] = trackedPaths;
    if (untrackedPaths.length === 0) return staleDumpMarkerForSinglePath(path, pathDispositions.get(path));
    return `${staleDumpMarkerForSinglePath(path, pathDispositions.get(path))} `
      + `Untracked named paths are not supplied: ${untrackedPaths.join(", ")}.`;
  }

  const details = trackedPaths
    .map((path) => `${path}=${pathDispositions.get(path) ?? "absent"}`)
    .join("; ");
  if (untrackedPaths.length === 0) {
    return `[freshctx:stale-dump paths=${trackedPaths.join(", ")}] Per-path live projection status: ${details}.`;
  }
  return `[freshctx:stale-dump paths=${trackedPaths.join(", ")}] Per-path live projection status: ${details}. `
    + `Untracked named paths are not supplied: ${untrackedPaths.join(", ")}.`;
}

function withReplacedDumpBody(message, dumpMatch, pathDispositions) {
  const marker = staleDumpMarker(dumpMatch, pathDispositions);
  const content = Array.isArray(message.content)
    ? [{ type: "text", text: marker }]
    : marker;
  return { ...structuredClone(message), content };
}

function omittedReadMarker(path, disposition) {
  if (disposition === "budget") {
    return `[freshctx:omitted-read path=${path}] Current content was omitted from the live projection for budget.`;
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

export function replaceHistoricalProjectionMessages(messages) {
  return messages.map((message) => {
    if (message?.role !== "user") return structuredClone(message);
    const text = textMessageContent(message);
    const projection = freshCtxProjectionInfo(text);
    if (!projection) return structuredClone(message);
    return replaceTextMessageContent(message, historicalProjectionMarker(projection));
  });
}

export function hasHistoricalProjectionMessage(messages) {
  return messages.some((message) => freshCtxProjectionInfo(textMessageContent(message)));
}

function userMessageCount(messages) {
  let count = 0;
  for (const message of messages) {
    if (message?.role === "user") count += 1;
  }
  return count;
}

function selectedIsolatedSemanticEngineSymbol(unit) {
  if (unit?.scope !== "symbol") return false;
  return String(unit?.resolutionMethod ?? "") === "isolated-semantic-engine";
}

export function shouldCollapseCurrentProjection(
  messages,
  projection,
  skipEligibleSelections,
  { userCountMessages = messages } = {},
) {
  if (hasHistoricalProjectionMessage(messages)) return false;
  if (userMessageCount(userCountMessages) <= 1) return false;
  if ((projection?.selected?.length ?? 0) === 0) return false;
  // PCR 0148: an Isolated Semantic Engine symbol that resolved this request
  // must stay on the live tail. Empty-tail collapse prints resolution=none
  // (PCR 0139 t4 leftover). File-scope unchanged collapse stays PCR 0103.
  if ((projection.selected ?? []).some(selectedIsolatedSemanticEngineSymbol)) {
    return false;
  }
  // Budget-omitted units were never served in the live projection; collapse
  // when every unit we would serve this turn is already injected (PCR 0100).
  return projection.selected.length === skipEligibleSelections;
}

export function dropUnservedReadToolPairs(messages, {
  readTools,
  servedCallIds,
  trackedPaths,
  observedCallIds,
  projection,
  readDispositionByCallId,
  historicalReadDispositionByCallId,
} = {}) {
  const dropIds = unservedReadToolCallIds(messages, readTools, servedCallIds, observedCallIds);
  const dispositions = projectionDispositionByPath(projection);
  const keptReadCalls = readDispositionByCallId instanceof Map ? readDispositionByCallId : new Map();
  const historicalReadCalls = historicalReadDispositionByCallId instanceof Map
    ? historicalReadDispositionByCallId
    : new Map();
  for (const [callId, item] of keptReadCalls.entries()) {
    if (item?.disposition === "budget") {
      dropIds.delete(callId);
    }
  }
  for (const [callId, item] of historicalReadCalls.entries()) {
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
  ) || [...historicalReadCalls.values()].some(
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
        const dumpMatch = dumpPaths.get(resultId);
        kept.push(withReplacedDumpBody(message, dumpMatch, dispositions));
        continue;
      }
      if (keptReadCalls.has(resultId)) {
        const { path, disposition } = keptReadCalls.get(resultId);
        if (disposition === "budget") {
          kept.push(withReplacedReadBody(message, path, disposition));
          continue;
        }
      }
      if (historicalReadCalls.has(resultId)) {
        const { path, disposition } = historicalReadCalls.get(resultId);
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
