import { Buffer } from "node:buffer";

import { decodeProjectionUnits } from "../../src/projector.mjs";
import { stableReadMarker } from "../../src/transcript.mjs";

const SUMMARY_MARKER_RE = /\[freshctx:[^\]]+\]\s+Current content is supplied in the live projection\./u;
const ALREADY_SERVED_RE = /\[freshctx:already-served units=\d+\]/u;

export function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1;
    index += Math.max(1, needle.length);
  }
  return count;
}

/** Rough token estimate for replay boards (bytes / 4, ceiling). Not provider-specific. */
export function estimateTokens(text) {
  return Math.ceil(Buffer.byteLength(String(text ?? ""), "utf8") / 4);
}

export function textFromMessage(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => {
      if (part?.type === "text" && typeof part.text === "string") return true;
      if (part?.type === "toolCall") return false;
      return false;
    })
    .map((part) => part.text)
    .join("\n");
}

export function payloadTextFromMessages(messages) {
  return messages.map((message) => textFromMessage(message)).join("\n\n");
}

export function isSummaryReadMarker(text) {
  return SUMMARY_MARKER_RE.test(String(text ?? ""));
}

export function isAlreadyServedStub(text) {
  return ALREADY_SERVED_RE.test(String(text ?? ""));
}

export function toolResultBodies(messages) {
  const bodies = [];
  for (const message of messages) {
    const role = message?.role;
    if (role !== "tool" && role !== "toolResult") continue;
    bodies.push(textFromMessage(message));
  }
  return bodies;
}

export function assistantToolCallIds(messages) {
  const ids = new Set();
  for (const message of messages) {
    if (message?.role !== "assistant") continue;
    if (Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        if (typeof call?.id === "string") ids.add(call.id);
      }
    }
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type === "toolCall" && typeof part.id === "string") ids.add(part.id);
      }
    }
  }
  return ids;
}

export function toolResultCallIds(messages) {
  const ids = new Set();
  for (const message of messages) {
    const role = message?.role;
    if (role !== "tool" && role !== "toolResult") continue;
    const id = message.tool_call_id ?? message.toolCallId;
    if (typeof id === "string") ids.add(id);
  }
  return ids;
}

/**
 * Preserve native assistant↔tool pairing in the provider-visible copy.
 * Orphan tool results and orphan calls both fail.
 */
export function validateToolPairing(messages) {
  const callIds = assistantToolCallIds(messages);
  const resultIds = toolResultCallIds(messages);
  const orphanResults = [...resultIds].filter((id) => !callIds.has(id));
  const orphanCalls = [...callIds].filter((id) => !resultIds.has(id));
  return {
    valid: orphanResults.length === 0 && orphanCalls.length === 0,
    orphanResults,
    orphanCalls,
    callCount: callIds.size,
    resultCount: resultIds.size,
  };
}

/**
 * Minimal provider-schema checks for replay payloads. Does not validate every
 * host extension field; catches broken roles/IDs before live compare.
 */
export function validateProviderSchema(messages, { host = "pi" } = {}) {
  const issues = [];
  const allowedRoles = host === "hermes"
    ? new Set(["user", "assistant", "tool", "system"])
    : new Set(["user", "assistant", "tool", "toolResult", "system"]);

  for (const [index, message] of messages.entries()) {
    if (!allowedRoles.has(message?.role)) {
      issues.push(`message ${index}: unexpected role ${String(message?.role)}`);
    }
    if (message?.role === "tool" || message?.role === "toolResult") {
      const id = message.tool_call_id ?? message.toolCallId;
      if (typeof id !== "string" || id.length === 0) {
        issues.push(`message ${index}: tool result missing call id`);
      }
      if (host === "hermes" && message.toolCallId && !message.tool_call_id) {
        issues.push(`message ${index}: Hermes payload used Pi toolCallId field`);
      }
      if (host === "pi" && message.tool_call_id && !message.toolCallId) {
        issues.push(`message ${index}: Pi payload used Hermes tool_call_id field`);
      }
    }
  }

  const pairing = validateToolPairing(messages);
  if (!pairing.valid) {
    if (pairing.orphanResults.length > 0) {
      issues.push(`orphan tool results: ${pairing.orphanResults.join(", ")}`);
    }
    if (pairing.orphanCalls.length > 0) {
      issues.push(`orphan tool calls: ${pairing.orphanCalls.join(", ")}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    pairing,
  };
}

export function countBodyCopies(payloadText, body) {
  if (!body) return 0;
  return countOccurrences(payloadText, body);
}

/**
 * Quoteability probe: bounded current bytes visible outside summary markers.
 * A unit is quoteable when the probe substring appears in a read slot body or
 * decoded projection unit, not only in `[freshctx:…]` summary markers.
 */
export function measureUnitQuoteability({
  messages,
  projectionText = "",
  unit,
  probe,
  observedContent = "",
}) {
  const payloadText = payloadTextFromMessages(messages);
  const currentContent = String(unit?.content ?? "");
  const probeText = probe ?? currentContent;
  const projectionUnits = decodeProjectionUnits(projectionText);
  const projectionBodies = projectionUnits.map((decoded) => decoded.content);

  let quoteableViaReadSlot = false;
  for (const body of toolResultBodies(messages)) {
    if (isSummaryReadMarker(body)) continue;
    if (probeText && body.includes(probeText)) {
      quoteableViaReadSlot = true;
      break;
    }
  }

  let quoteableViaProjection = false;
  for (const body of projectionBodies) {
    if (probeText && body.includes(probeText)) {
      quoteableViaProjection = true;
      break;
    }
  }

  const markerOnlyAtReadSlot = toolResultBodies(messages).some(
    (body) => body === stableReadMarker(unit) || isSummaryReadMarker(body),
  );

  return {
    unitId: unit?.id ?? null,
    path: unit?.path ?? null,
    quoteableCurrent: quoteableViaReadSlot || quoteableViaProjection,
    quoteableViaReadSlot,
    quoteableViaProjection,
    markerOnlyAtReadSlot,
    currentBodyCopyCount: countBodyCopies(payloadText, currentContent),
    staleBodyCopyCount: observedContent ? countBodyCopies(payloadText, observedContent) : 0,
    probeInPayload: probeText ? payloadText.includes(probeText) : false,
    probeInProjection: probeText ? projectionText.includes(probeText) : false,
  };
}

export function measureLaterTurnQuoteability({
  messages,
  projectionText = "",
  selectedUnits = [],
  probesByUnitId = {},
  observedByUnitId = {},
}) {
  const perUnit = selectedUnits.map((unit) =>
    measureUnitQuoteability({
      messages,
      projectionText,
      unit,
      probe: probesByUnitId[unit.id],
      observedContent: observedByUnitId[unit.id] ?? "",
    }),
  );

  return {
    selectedCount: selectedUnits.length,
    quoteableUnitCount: perUnit.filter((item) => item.quoteableCurrent).length,
    allSelectedQuoteable: perUnit.length > 0 && perUnit.every((item) => item.quoteableCurrent),
    perUnit,
  };
}

export function summarizeCompactionState({
  projectionText = "",
  telemetry = {},
  skipEligibleSelections = telemetry.skipEligibleSelections ?? 0,
} = {}) {
  return {
    projectionBytes: Buffer.byteLength(projectionText, "utf8"),
    projectionChars: projectionText.length,
    collapsedStub: isAlreadyServedStub(projectionText),
    tailOmitted: projectionText.length === 0,
    skipEligibleSelections,
    totalMs: telemetry.totalMs ?? 0,
  };
}

/**
 * Full request visibility snapshot for replay characterization boards.
 * Does not mutate messages; read-only measurement over adapter output.
 */
export function measureRequestVisibility({
  messages,
  projectionText = "",
  selectedUnits = [],
  probesByUnitId = {},
  observedByUnitId = {},
  telemetry = {},
  priorPayloadText = "",
  host = "pi",
}) {
  const payloadText = payloadTextFromMessages(messages);
  const payloadBytes = Buffer.byteLength(payloadText, "utf8");
  const quoteability = measureLaterTurnQuoteability({
    messages,
    projectionText,
    selectedUnits,
    probesByUnitId,
    observedByUnitId,
  });
  const compaction = summarizeCompactionState({
    projectionText,
    telemetry,
    skipEligibleSelections: telemetry.skipEligibleSelections,
  });
  const schema = validateProviderSchema(messages, { host });
  const projectionUnits = decodeProjectionUnits(projectionText);

  let currentBodyCopyCount = 0;
  let staleBodyCopyCount = 0;
  for (const unit of selectedUnits) {
    currentBodyCopyCount += countBodyCopies(payloadText, String(unit.content ?? ""));
    const observed = observedByUnitId[unit.id];
    if (observed) staleBodyCopyCount += countBodyCopies(payloadText, observed);
  }

  return {
    effectivePayloadBytes: payloadBytes,
    effectivePayloadTokens: estimateTokens(payloadText),
    projectionBytes: compaction.projectionBytes,
    projectionUnitCount: projectionUnits.length,
    currentBodyCopyCount,
    staleBodyCopyCount,
    quoteability,
    compaction,
    schema,
    cachePrefixReuse: priorPayloadText
      ? commonPrefixBytes(priorPayloadText, payloadText) / Math.max(1, Buffer.byteLength(priorPayloadText, "utf8"))
      : 1,
  };
}

function commonPrefixBytes(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

/** Pin table row for PCR 0102 boards (0098–0100 seam). */
export function formatMeasurementRow({ turn, host, metrics }) {
  return {
    turn,
    host,
    effectivePayloadBytes: metrics.effectivePayloadBytes,
    effectivePayloadTokens: metrics.effectivePayloadTokens,
    projectionBytes: metrics.projectionBytes,
    currentBodyCopyCount: metrics.currentBodyCopyCount,
    staleBodyCopyCount: metrics.staleBodyCopyCount,
    quoteableAllSelected: metrics.quoteability.allSelectedQuoteable,
    quoteableUnitCount: metrics.quoteability.quoteableUnitCount,
    selectedCount: metrics.quoteability.selectedCount,
    collapsedStub: metrics.compaction.collapsedStub,
    tailOmitted: metrics.compaction.tailOmitted,
    pairingValid: metrics.schema.pairing.valid,
    schemaValid: metrics.schema.valid,
  };
}
