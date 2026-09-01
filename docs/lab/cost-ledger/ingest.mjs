/** Map dump scans into ledger turns. Never keep API keys. */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { MODEL, validateArm, validateCostCompareArm, validateHost, validateModel } from "./pack.mjs";
import { assertLongSessionCost } from "./session-kind.mjs";
import { usageFromScan } from "./usage.mjs";

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

export function turnFromScan(scan, { arm, turn, cellId, host, model = MODEL, source = "scan" } = {}) {
  validateArm(arm);
  validateModel(model);
  if (host !== undefined) validateHost(host);
  if (!Number.isInteger(turn) || turn < 1) {
    throw new Error(`scan turn must be a positive integer, got ${String(turn)}`);
  }
  const usage = usageFromScan(scan);
  const explicitPrompt = finiteNumber(scan.promptTokens ?? scan.usage?.prompt_tokens);
  const explicitCompletion = finiteNumber(scan.completionTokens ?? scan.usage?.completion_tokens);
  const promptTokens = scan.dumpOnly === true ? null : (usage.promptTokens ?? explicitPrompt);
  const completionTokens = scan.dumpOnly === true ? null : (usage.completionTokens ?? explicitCompletion);
  return {
    arm,
    host: host ?? scan.host ?? null,
    turn,
    cellId: cellId ?? scan.cellId ?? `t${turn}`,
    requestBytes: finiteNumber(scan.utf8Bytes ?? scan.requestBytes),
    promptTokens,
    completionTokens,
    model,
    source,
    usageFrom: usage.usageFrom,
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
      turn: meta.turn ?? scan.n ?? scan.turn ?? index + 1,
      cellId: meta.cellId ?? scan.cellId,
    }),
  );
}

export function ingestLongSession(scans, meta = {}) {
  const turns = ingestScans(scans, meta);
  assertLongSessionCost(turns, meta);
  return turns;
}

export async function readScanFiles(dir) {
  const names = (await readdir(dir))
    .filter((name) => name.endsWith(".scan.json"))
    .sort();
  const scans = [];
  for (const name of names) {
    scans.push(JSON.parse(await readFile(join(dir, name), "utf8")));
  }
  return scans;
}

export async function ingestScanDir(dir, meta = {}) {
  return ingestLongSession(await readScanFiles(dir), meta);
}

export async function ingestHostArmDumps({ root, host, arm }) {
  validateHost(host);
  validateCostCompareArm(arm);
  return ingestScanDir(join(root, host, arm), { host, arm });
}

export function fixtureTurns(fixture, host, arm) {
  validateHost(host);
  validateCostCompareArm(arm);
  const turns = fixture?.hosts?.[host]?.arms?.[arm]?.turns;
  if (!Array.isArray(turns)) {
    throw new Error(`fixture missing turns for ${host}/${arm}`);
  }
  return turns;
}

export function loadFixtureHostArm(fixture, host, arm) {
  if (fixture?.liveHost === true) {
    throw new Error("CI fixture loader refuses liveHost=true; live captures stay in COST_LEDGER_CAPTURE");
  }
  const turns = fixtureTurns(fixture, host, arm);
  return ingestLongSession(turns, {
    host,
    arm,
    source: fixture.label ?? "fixture",
    label: fixture.label,
  });
}
