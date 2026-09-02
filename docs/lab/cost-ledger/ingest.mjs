/** Map dump scans into ledger turns. Never keep API keys. */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { MODEL, validateArm, validateCostCompareArm, validateHost, validateModel } from "./pack.mjs";
import {
  FOUR_TURN_NOT_PAPER_REASON,
  SESSION_KIND_FOUR_TURN,
  assertLongSessionCost,
  classifySessionKind,
} from "./session-kind.mjs";
import { usageFromScan } from "./usage.mjs";

export const DEST_71379F00 =
  "/workspace/freshctx-measure-71379f00-multiturn";
export const DEST_71379F00_SHA = "71379f009d22d2487fb3396fb5de4b6cc3ab3bc9";
export const HERMES_TRIAL_TS_DUMP_PROXY = "docs/lab/hermes-trial-ts/proxy.mjs";
export const COST_LEDGER_DUMP_PROXY = "docs/lab/cost-ledger/dump-proxy.mjs";
export const DEST_DUMPS_MISSING_SIBLING = `${HERMES_TRIAL_TS_DUMP_PROXY} dump-proxy scans vs ${COST_LEDGER_DUMP_PROXY} dump path`;
export const PAPER_DOLLARS_REFUSED = "four-turn multi-turn ingest refuses paper $";
export const PASS_AT_1_REFUSED = "four-turn multi-turn ingest refuses Pass@1";

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

function lastFiniteOrNull(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function sumRequestBytes(cell) {
  if (typeof cell.requestBytes === "number" && Number.isFinite(cell.requestBytes)) {
    return cell.requestBytes;
  }
  if (!Array.isArray(cell.requestBytes) || cell.requestBytes.length === 0) return null;
  return cell.requestBytes.reduce((total, value) => total + Number(value ?? 0), 0);
}

export function destDumpsMissingReason(destRoot = DEST_71379F00) {
  return `dest dumps missing: ${destRoot} (${DEST_DUMPS_MISSING_SIBLING})`;
}

export function cellsFromMultiTurnSummary(summary, host, arm) {
  validateHost(host);
  validateCostCompareArm(arm);
  const cells = summary?.arms?.[host]?.[arm];
  if (!Array.isArray(cells)) {
    throw new Error(`multi-turn summary missing cells for ${host}/${arm}`);
  }
  return cells;
}

export function ingestMultiTurnCells(cells, { host, arm } = {}) {
  validateHost(host);
  validateCostCompareArm(arm);
  const turns = cells.map((cell) =>
    turnFromScan(
      {
        utf8Bytes: sumRequestBytes(cell),
        promptTokens: lastFiniteOrNull(cell.promptTokens),
        completionTokens: lastFiniteOrNull(cell.completionTokens),
        dumpOnly: lastFiniteOrNull(cell.promptTokens) == null,
        resolution: cell.resolution ?? null,
        host,
      },
      {
        host,
        arm,
        turn: cell.turn,
        cellId: cell.id,
        source: SESSION_KIND_FOUR_TURN,
      },
    ),
  );
  const classified = classifySessionKind(turns, { sessionKind: SESSION_KIND_FOUR_TURN });
  if (classified.validForLongSessionCost || classified.validForPaperDollars) {
    throw new Error(FOUR_TURN_NOT_PAPER_REASON);
  }
  return turns;
}

export function ingestMultiTurnSummary(summary, { destMounted = false } = {}) {
  if (summary?.notAPaperResult !== true) {
    throw new Error("multi-turn ingest requires notAPaperResult=true");
  }
  if (summary.passAt1 != null) {
    throw new Error(PASS_AT_1_REFUSED);
  }
  const hosts = {};
  const hostNames = Array.isArray(summary.hosts) ? summary.hosts : Object.keys(summary.arms ?? {});
  for (const host of hostNames) {
    const armMap = summary.arms?.[host];
    if (!armMap) continue;
    hosts[host] = {};
    for (const arm of Object.keys(armMap)) {
      if (arm !== "nothing" && arm !== "freshctx-ts") continue;
      hosts[host][arm] = ingestMultiTurnCells(armMap[arm], { host, arm });
    }
  }
  return {
    label: summary.label ?? "live-host",
    notAPaperResult: true,
    paperDollars: false,
    passAt1: null,
    sessionKind: SESSION_KIND_FOUR_TURN,
    destSha: summary.destSha ?? summary.commit ?? null,
    destRoot: summary.destRoot ?? null,
    destMounted,
    destSkip: destMounted ? null : destDumpsMissingReason(summary.destRoot ?? DEST_71379F00),
    hosts,
  };
}

export function assertNotPaperResult(ingest) {
  if (ingest?.paperDollars === true) {
    throw new Error(PAPER_DOLLARS_REFUSED);
  }
  if (ingest?.passAt1 != null) {
    throw new Error(PASS_AT_1_REFUSED);
  }
  if (ingest?.notAPaperResult !== true) {
    throw new Error("four-turn multi-turn ingest requires notAPaperResult=true");
  }
  if (ingest?.sessionKind !== SESSION_KIND_FOUR_TURN) {
    throw new Error(FOUR_TURN_NOT_PAPER_REASON);
  }
  return ingest;
}

export async function ingestFourTurnScanDir(dir, meta = {}) {
  const turns = ingestScans(await readScanFiles(dir), {
    ...meta,
    source: SESSION_KIND_FOUR_TURN,
  });
  const classified = classifySessionKind(turns, { sessionKind: SESSION_KIND_FOUR_TURN });
  if (classified.validForLongSessionCost || classified.validForPaperDollars) {
    throw new Error(FOUR_TURN_NOT_PAPER_REASON);
  }
  return {
    turns,
    classified,
    notAPaperResult: true,
    paperDollars: false,
    passAt1: null,
    sessionKind: SESSION_KIND_FOUR_TURN,
  };
}
