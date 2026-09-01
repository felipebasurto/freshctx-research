/** Accumulate request_bytes / tokens / cost proxy across many turns. */

import { costProxyUsd, COST_PROXY_VERSION, estimatePromptTokensFromBytes } from "./cost-proxy.mjs";
import { MODEL, validateArm, validateModel } from "./pack.mjs";

export function formatMissing(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && !Number.isFinite(value)) return "—";
  return String(value);
}

export function emptyLedger(arm) {
  validateArm(arm);
  return {
    arm,
    turns: 0,
    requestBytes: null,
    promptTokens: null,
    completionTokens: null,
    estimatedPromptTokens: null,
    costProxyUsd: null,
    costProxyUsdEstimated: null,
    tokenSource: "none",
    costProxyVersion: COST_PROXY_VERSION,
    model: MODEL,
    rows: [],
  };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sumFinite(values) {
  const present = values.filter(finiteNumber);
  if (present.length === 0) return null;
  return present.reduce((total, value) => total + value, 0);
}

function tokenSourceForRows(rows) {
  if (rows.length === 0) return "none";
  const withProvider = rows.filter((row) => finiteNumber(row.promptTokens)).length;
  if (withProvider === rows.length) return "provider";
  if (withProvider === 0) return "bytes-estimate";
  return "mixed";
}

function decorateRow(turn) {
  validateArm(turn.arm);
  validateModel(turn.model ?? MODEL);
  const requestBytes = finiteNumber(turn.requestBytes) ? turn.requestBytes : null;
  const promptTokens = finiteNumber(turn.promptTokens) ? turn.promptTokens : null;
  const completionTokens = finiteNumber(turn.completionTokens) ? turn.completionTokens : null;
  const estimatedPromptTokens = promptTokens ?? estimatePromptTokensFromBytes(requestBytes);
  const source = turn.source ?? (promptTokens === null ? "synthetic" : "provider");
  const rowTokenSource = promptTokens === null ? "bytes-estimate" : "provider";
  return {
    arm: turn.arm,
    turn: turn.turn,
    cellId: turn.cellId ?? `t${turn.turn}`,
    requestBytes,
    promptTokens,
    completionTokens,
    estimatedPromptTokens,
    model: MODEL,
    source,
    tokenSource: rowTokenSource,
    costProxyUsd: costProxyUsd({ promptTokens, completionTokens }),
    costProxyUsdEstimated: costProxyUsd({
      promptTokens: estimatedPromptTokens,
      completionTokens: completionTokens ?? 0,
    }),
  };
}

function withCumulatives(rows) {
  let requestBytes = 0;
  let sawRequestBytes = false;
  let promptTokens = 0;
  let sawPromptTokens = false;
  let costProxy = 0;
  let sawCost = false;
  return rows.map((row) => {
    if (finiteNumber(row.requestBytes)) {
      requestBytes += row.requestBytes;
      sawRequestBytes = true;
    }
    if (finiteNumber(row.promptTokens)) {
      promptTokens += row.promptTokens;
      sawPromptTokens = true;
    }
    if (finiteNumber(row.costProxyUsd)) {
      costProxy += row.costProxyUsd;
      sawCost = true;
    }
    return {
      ...row,
      cumulativeRequestBytes: sawRequestBytes ? requestBytes : null,
      cumulativePromptTokens: sawPromptTokens ? promptTokens : null,
      cumulativeCostProxyUsd: sawCost ? costProxy : null,
    };
  });
}

function totalsFromRows(arm, rows) {
  const requestBytes = sumFinite(rows.map((row) => row.requestBytes));
  const promptTokens = sumFinite(rows.map((row) => row.promptTokens));
  const completionTokens = sumFinite(rows.map((row) => row.completionTokens));
  const estimatedPromptTokens = sumFinite(rows.map((row) => row.estimatedPromptTokens));
  const tokenSource = tokenSourceForRows(rows);
  return {
    arm,
    turns: rows.length,
    requestBytes,
    promptTokens: tokenSource === "bytes-estimate" ? null : promptTokens,
    completionTokens: tokenSource === "bytes-estimate" ? null : completionTokens,
    estimatedPromptTokens,
    costProxyUsd: tokenSource === "provider" ? costProxyUsd({ promptTokens, completionTokens }) : null,
    costProxyUsdEstimated: costProxyUsd({
      promptTokens: estimatedPromptTokens,
      completionTokens: completionTokens ?? 0,
    }),
    tokenSource,
    costProxyVersion: COST_PROXY_VERSION,
    model: MODEL,
    rows,
  };
}

export function recordTurn(ledger, turn) {
  if (!ledger || ledger.arm !== turn.arm) {
    throw new Error(`turn arm ${String(turn.arm)} does not match ledger ${String(ledger?.arm)}`);
  }
  if (!Number.isInteger(turn.turn) || turn.turn < 1) {
    throw new Error(`turn must be a positive integer, got ${String(turn.turn)}`);
  }
  if (ledger.rows.some((row) => row.turn === turn.turn)) {
    throw new Error(`duplicate turn ${turn.turn} on arm ${ledger.arm}`);
  }
  const next = [...ledger.rows, decorateRow(turn)].sort((left, right) => left.turn - right.turn);
  return totalsFromRows(ledger.arm, withCumulatives(next));
}

export function accumulateTurns(turns, options = {}) {
  if (!Array.isArray(turns) || turns.length === 0) {
    return emptyLedger(options.arm ?? "nothing");
  }
  const arm = turns[0].arm;
  validateArm(arm);
  let ledger = emptyLedger(arm);
  for (const turn of turns) {
    ledger = recordTurn(ledger, turn);
  }
  return ledger;
}

export function compareArmTotals(ledgers, baselineArm = "nothing") {
  const baseline = ledgers[baselineArm];
  if (!baseline) {
    throw new Error(`missing baseline ledger ${baselineArm}`);
  }
  const rows = Object.keys(ledgers)
    .sort((left, right) => left.localeCompare(right))
    .map((arm) => {
      const ledger = ledgers[arm];
      return {
        arm,
        requestBytesDelta: finiteNumber(ledger.requestBytes) && finiteNumber(baseline.requestBytes)
          ? ledger.requestBytes - baseline.requestBytes
          : null,
        promptTokensDelta: finiteNumber(ledger.promptTokens) && finiteNumber(baseline.promptTokens)
          ? ledger.promptTokens - baseline.promptTokens
          : null,
        costProxyUsdDelta: finiteNumber(ledger.costProxyUsd) && finiteNumber(baseline.costProxyUsd)
          ? ledger.costProxyUsd - baseline.costProxyUsd
          : null,
        costProxyUsdEstimatedDelta:
          finiteNumber(ledger.costProxyUsdEstimated) && finiteNumber(baseline.costProxyUsdEstimated)
            ? ledger.costProxyUsdEstimated - baseline.costProxyUsdEstimated
            : null,
      };
    });
  return { baseline: baselineArm, rows };
}
