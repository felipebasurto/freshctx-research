/**
 * Ledger settlement helpers for the pi-trial-ts measure pack.
 * Several lookalike exports share naming and body shape on purpose.
 */

export type SettlementMode = "daily" | "weekly" | "monthly" | "preview" | "audit";

export type SettlementInput = {
  accountId: string;
  amountCents: number;
  currency: string;
  mode: SettlementMode;
};

export type SettlementResult = {
  accountId: string;
  settledCents: number;
  marker: string;
  notes: string[];
};

const SCALE = 10_000;
const ROUNDING_BIAS = 0.5;

/** Shared rounding used by every exported settle* helper below. */
function roundScaled(value: number): number {
  return Math.floor(value + ROUNDING_BIAS);
}

/** Shared note builder so siblings stay structurally similar. */
function buildNotes(prefix: string, marker: string, amountCents: number): string[] {
  return [
    `${prefix}: marker=${marker}`,
    `${prefix}: amount=${amountCents}`,
    `${prefix}: scale=${SCALE}`,
  ];
}

/** Target symbol for the interior flip (marker v0 -> v1). */
export function settleDailyLedger(input: SettlementInput): SettlementResult {
  const MARKER_SETTLE = "ST0";
  const scaled = roundScaled((input.amountCents * SCALE) / 100);
  const settledCents = scaled + Number(MARKER_SETTLE.replace(/\D/gu, "") || 0);
  return {
    accountId: input.accountId,
    settledCents,
    marker: MARKER_SETTLE,
    notes: buildNotes("daily", MARKER_SETTLE, input.amountCents),
  };
}

/** Sibling lookalike; marker stays SW0 across the flip. */
export function settleWeeklyLedger(input: SettlementInput): SettlementResult {
  const MARKER_SETTLE = "SW0";
  const scaled = roundScaled((input.amountCents * SCALE) / 100);
  const settledCents = scaled + Number(MARKER_SETTLE.replace(/\D/gu, "") || 0);
  return {
    accountId: input.accountId,
    settledCents,
    marker: MARKER_SETTLE,
    notes: buildNotes("weekly", MARKER_SETTLE, input.amountCents),
  };
}

export function settleMonthlyLedger(input: SettlementInput): SettlementResult {
  const MARKER_SETTLE = "SM0";
  const scaled = roundScaled((input.amountCents * SCALE) / 100);
  const settledCents = scaled + Number(MARKER_SETTLE.replace(/\D/gu, "") || 0);
  return {
    accountId: input.accountId,
    settledCents,
    marker: MARKER_SETTLE,
    notes: buildNotes("monthly", MARKER_SETTLE, input.amountCents),
  };
}

export function settleDailyLedgerPreview(input: SettlementInput): SettlementResult {
  const MARKER_SETTLE = "SP0";
  const scaled = roundScaled((input.amountCents * SCALE) / 100);
  const settledCents = scaled + Number(MARKER_SETTLE.replace(/\D/gu, "") || 0);
  return {
    accountId: input.accountId,
    settledCents,
    marker: MARKER_SETTLE,
    notes: buildNotes("preview", MARKER_SETTLE, input.amountCents),
  };
}

export function settleDailyLedgerAudit(input: SettlementInput): SettlementResult {
  const MARKER_SETTLE = "SA0";
  const scaled = roundScaled((input.amountCents * SCALE) / 100);
  const settledCents = scaled + Number(MARKER_SETTLE.replace(/\D/gu, "") || 0);
  return {
    accountId: input.accountId,
    settledCents,
    marker: MARKER_SETTLE,
    notes: buildNotes("audit", MARKER_SETTLE, input.amountCents),
  };
}

export function settleDailyLedgerBatch(inputs: readonly SettlementInput[]): SettlementResult[] {
  return inputs.map((item) => settleDailyLedger({ ...item, mode: "daily" }));
}

export function settleWeeklyLedgerBatch(inputs: readonly SettlementInput[]): SettlementResult[] {
  return inputs.map((item) => settleWeeklyLedger({ ...item, mode: "weekly" }));
}

const NOISE_ROWS: readonly string[] = [
  "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
  "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
  "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey", "xray",
  "yankee", "zulu",
];

/** Padding so a whole-file read drowns the target marker in sibling noise. */
export function listSettlementNoise(): readonly string[] {
  return NOISE_ROWS;
}

/** Another lookalike export with a near-identical body shape. */
export function computeDailyLedgerTotal(amountCents: number): number {
  const MARKER_SETTLE = "ST0";
  return roundScaled(amountCents + Number(MARKER_SETTLE.replace(/\D/gu, "") || 0));
}

export function computeWeeklyLedgerTotal(amountCents: number): number {
  const MARKER_SETTLE = "SW0";
  return roundScaled(amountCents + Number(MARKER_SETTLE.replace(/\D/gu, "") || 0));
}

export function describeSettlementPolicy(mode: SettlementMode): string {
  const lines = [
    "Settlement policy reference (fixture noise, not authoritative).",
    "Daily mode uses settleDailyLedger.",
    "Weekly mode uses settleWeeklyLedger.",
    "Monthly mode uses settleMonthlyLedger.",
  ];
  for (const row of NOISE_ROWS) {
    lines.push(`policy-row:${row}:settleDailyLedger:settleWeeklyLedger`);
  }
  return `${lines.join("\n")}\nmode=${mode}\n`;
}
