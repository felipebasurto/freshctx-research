import { resolutionFromStringifiedPayload } from "../pi-trial-ts/resolution-from-stringified.mjs";
import {
  SIBLING_MARKER,
  TARGET_FILE,
  TARGET_SYMBOL,
  expectedMarkerForCell,
  priorMarkersForCell,
} from "./pack.mjs";

export function promptTokensFromPayload(text) {
  const usageMatch = /"prompt_tokens"\s*:\s*(\d+)/u.exec(text);
  const promptTokens = usageMatch ? Number(usageMatch[1]) : null;
  return Number.isFinite(promptTokens) ? promptTokens : null;
}

export function stdoutMatchesMarker(reply, marker) {
  const escaped = String(marker).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\bSETTLE\\s*=\\s*${escaped}\\b`, "u").test(String(reply ?? ""));
}

export function scanProviderPayloadForCell(text, cell) {
  const expected = expectedMarkerForCell(cell);
  const prior = priorMarkersForCell(cell);
  const staleMarkers = prior.filter((marker) => text.includes(marker));
  return {
    utf8Bytes: Buffer.byteLength(text),
    promptTokens: promptTokensFromPayload(text),
    expectedMarker: expected,
    turn: cell.turn,
    exactCurrentBytes: text.includes(expected),
    stalePriorBytes: staleMarkers.length > 0,
    staleMarkers,
    siblingBytesInRequest: text.includes(SIBLING_MARKER),
    hasFreshCtxEnvelope: text.includes("<freshctx turn="),
    hasFreshCtxUnit: text.includes("<freshctx-unit"),
    resolution: resolutionFromStringifiedPayload(text),
    targetFileMention: text.includes(TARGET_FILE),
    targetSymbolMention: text.includes(TARGET_SYMBOL),
  };
}

export function normalizeResolution(raw, arm) {
  if (arm === "nothing") return "none";
  const value = String(raw ?? "none");
  if (value.includes("isolated-semantic-engine")) return "isolated-semantic-engine";
  if (value.includes("file") || value.includes("whole")) return "file";
  return value === "none" || value.length === 0 ? "none" : value;
}

export const COLUMN_NAMES = [
  "host",
  "arm",
  "turn",
  "exact_current_bytes",
  "stale_prior_bytes",
  "sibling_bytes_in_request",
  "request_bytes",
  "prompt_tokens",
  "stdout_current",
  "resolution",
];

export function formatBool(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "—";
}

export function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

function lastRequestField(cell, field) {
  const last = cell.requests?.at(-1);
  if (!last) return null;
  return last[field] ?? null;
}

function sumRequestBytes(cell) {
  if (!Array.isArray(cell.requestBytes) || cell.requestBytes.length === 0) return null;
  return cell.requestBytes.reduce((total, value) => total + Number(value ?? 0), 0);
}

function lastPromptTokens(cell) {
  if (!Array.isArray(cell.promptTokens) || cell.promptTokens.length === 0) return null;
  for (let index = cell.promptTokens.length - 1; index >= 0; index -= 1) {
    const value = cell.promptTokens[index];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

export function formatCaptureRow({ host, arm, turn, cell }) {
  if (cell.missing) {
    return [host, arm, turn, "—", "—", "—", "—", "—", "—", "—"];
  }
  const later = turn >= 2;
  return [
    host,
    arm,
    turn,
    later ? formatBool(cell.exactCurrentBytes ?? lastRequestField(cell, "exactCurrentBytes")) : "n/a",
    later ? formatBool(cell.stalePriorBytes ?? lastRequestField(cell, "stalePriorBytes")) : "n/a",
    later ? formatBool(cell.siblingBytesInRequest ?? lastRequestField(cell, "siblingBytesInRequest")) : "n/a",
    formatNumber(sumRequestBytes(cell)),
    formatNumber(lastPromptTokens(cell)),
    later ? formatBool(cell.stdoutMatchesCurrent) : "n/a",
    later ? String(cell.resolution ?? lastRequestField(cell, "resolution") ?? "—") : "n/a",
  ];
}
