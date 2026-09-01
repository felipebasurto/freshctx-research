/** Harness-only success board. Task pass/fail. Not a SWE-bench dump. */

export const PACK_ID = "success-board-v0.1";
export const KIND = "harness-only-success-board";
export const MODEL = "deepseek-v4-flash";
export const HOSTS = ["pi", "hermes"];
export const ARMS = ["nothing", "freshctx-no-ts", "freshctx-ts"];
export const ASSERTS = ["exact_current_bytes", "stdout_current"];
export const SUCCESS_METRIC = "task-pass-fail-exact-current-and-stdout";
export const SUCCESS_METRIC_NOT = ["pass@1", "swe-bench-score", "cost", "tokens"];
export const BOARD_COLUMNS = [
  "host",
  "arm",
  "task",
  "turn",
  "exact_current_bytes",
  "stdout_current",
  "verdict",
  "reason",
];

export function measuredSweScores() {
  return null;
}

export function validateArm(arm) {
  if (!ARMS.includes(arm)) {
    throw new Error(`arm must be one of ${ARMS.join("|")}, got ${String(arm)}`);
  }
}

export function validateModel(model) {
  if (model !== MODEL) {
    throw new Error(`model must be ${MODEL}, got ${String(model)}`);
  }
}

export function freshCtxOn(arm) {
  validateArm(arm);
  return arm !== "nothing";
}

export function isolatedSemanticEngineOn(arm) {
  validateArm(arm);
  return arm === "freshctx-ts";
}
