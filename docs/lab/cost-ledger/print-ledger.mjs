/** Print accumulated long-session cost columns. */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { accumulateTurns, formatMissing } from "./ledger.mjs";
import { ARMS } from "./pack.mjs";

export const TURN_COLUMNS = [
  "arm",
  "turn",
  "request_bytes",
  "prompt_tokens",
  "completion_tokens",
  "token_source",
  "cost_proxy_usd",
  "cumulative_request_bytes",
  "cumulative_prompt_tokens",
  "cumulative_cost_proxy_usd",
];

export const TOTAL_COLUMNS = [
  "arm",
  "turns",
  "request_bytes",
  "prompt_tokens",
  "completion_tokens",
  "token_source",
  "cost_proxy_usd",
  "cost_proxy_usd_estimated",
];

function formatNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "—";
}

export function ledgerTsvHeader() {
  return TURN_COLUMNS.join("\t");
}

export function totalsTsvHeader() {
  return TOTAL_COLUMNS.join("\t");
}

function turnRow(ledger, row) {
  return [
    ledger.arm,
    row.turn,
    formatNumber(row.requestBytes),
    formatMissing(row.promptTokens),
    formatMissing(row.completionTokens),
    row.tokenSource,
    formatNumber(row.costProxyUsd),
    formatNumber(row.cumulativeRequestBytes),
    formatMissing(row.cumulativePromptTokens),
    formatNumber(row.cumulativeCostProxyUsd),
  ].join("\t");
}

function totalRow(ledger) {
  return [
    ledger.arm,
    ledger.turns,
    formatNumber(ledger.requestBytes),
    formatMissing(ledger.promptTokens),
    formatMissing(ledger.completionTokens),
    ledger.tokenSource,
    formatNumber(ledger.costProxyUsd),
    formatNumber(ledger.costProxyUsdEstimated),
  ].join("\t");
}

export function formatLedgerTsv(ledgers) {
  const lines = [ledgerTsvHeader()];
  for (const arm of ARMS) {
    const ledger = ledgers[arm];
    if (!ledger) continue;
    for (const row of ledger.rows) lines.push(turnRow(ledger, row));
  }
  for (const [arm, ledger] of Object.entries(ledgers)) {
    if (ARMS.includes(arm)) continue;
    for (const row of ledger.rows) lines.push(turnRow(ledger, row));
  }
  return `${lines.join("\n")}\n`;
}

export function formatArmTotalsTsv(ledgers) {
  const lines = [totalsTsvHeader()];
  for (const arm of ARMS) {
    const ledger = ledgers[arm];
    if (!ledger) continue;
    lines.push(totalRow(ledger));
  }
  for (const [arm, ledger] of Object.entries(ledgers)) {
    if (ARMS.includes(arm)) continue;
    lines.push(totalRow(ledger));
  }
  return `${lines.join("\n")}\n`;
}

async function loadCapture(captureDir) {
  const summaryPath = join(captureDir, "summary.json");
  const summary = JSON.parse(await readFile(summaryPath, "utf8"));
  const ledgers = {};
  for (const arm of ARMS) {
    const turns = summary.arms?.[arm]?.turns;
    if (Array.isArray(turns) && turns.length > 0) {
      ledgers[arm] = accumulateTurns(turns);
    }
  }
  return ledgers;
}

async function main() {
  const captureDir = process.env.COST_LEDGER_CAPTURE ?? join(fileURLToPath(new URL(".", import.meta.url)), ".work/capture");
  try {
    await readdir(captureDir);
    const ledgers = await loadCapture(captureDir);
    process.stdout.write(formatLedgerTsv(ledgers));
    process.stdout.write("\n");
    process.stdout.write(formatArmTotalsTsv(ledgers));
  } catch {
    process.stderr.write("No capture yet. Run the BATTERY or ingest scans, then rerun print-ledger.mjs.\n");
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
