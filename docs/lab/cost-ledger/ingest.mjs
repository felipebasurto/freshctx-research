/** Map dump scans into ledger turns. Never keep API keys. */

import { MODEL, validateArm, validateModel } from "./pack.mjs";

const SECRET_HEADER = /authorization|api-key|x-api-key/iu;
const SECRET_FIELD = /^(authorization|api[-_]?key|token|secret|password)$/iu;

export function redactHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SECRET_HEADER.test(key) ? "[redacted]" : value;
  }
  return out;
}

function redactValue(key, value) {
  if (SECRET_FIELD.test(key) || SECRET_HEADER.test(key)) return "[redacted]";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return redactRecord(value);
  }
  return value;
}

export function redactRecord(record = {}) {
  if (Array.isArray(record)) return record.map((item) => redactRecord(item));
  if (!record || typeof record !== "object") return record;
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "headers" && value && typeof value === "object") {
      out[key] = redactHeaders(value);
      continue;
    }
    if (key === "body" && value && typeof value === "object") {
      out[key] = redactRecord(value);
      continue;
    }
    out[key] = redactValue(key, value);
  }
  return out;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function turnFromScan(scan, { arm, turn, cellId, model = MODEL, source = "scan" } = {}) {
  validateArm(arm);
  validateModel(model);
  if (!Number.isInteger(turn) || turn < 1) {
    throw new Error(`scan turn must be a positive integer, got ${String(turn)}`);
  }
  return {
    arm,
    turn,
    cellId: cellId ?? `t${turn}`,
    requestBytes: finiteNumber(scan.utf8Bytes ?? scan.requestBytes),
    promptTokens: finiteNumber(scan.promptTokens ?? scan.usage?.prompt_tokens),
    completionTokens: finiteNumber(scan.completionTokens ?? scan.usage?.completion_tokens),
    model,
    source,
    resolution: scan.resolution ?? null,
  };
}

export function ingestScans(scans, meta) {
  if (!Array.isArray(scans)) {
    throw new Error("ingestScans expects an array of scans");
  }
  return scans.map((scan, index) =>
    turnFromScan(scan, {
      ...meta,
      turn: meta.turn ?? scan.n ?? index + 1,
      cellId: meta.cellId ?? scan.cellId,
    }),
  );
}
