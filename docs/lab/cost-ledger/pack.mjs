/** Shared constants for the long-session cost ledger. */

import { CELLS, SESSION_TURNS } from "./session.mjs";

export const PACK_ROOT = new URL(".", import.meta.url);
export const MODEL = "deepseek-v4-flash";
export const ALLOWED_MODELS = [MODEL];
export const ARMS = ["nothing", "freshctx-no-ts", "freshctx-ts"];
export const HOSTS = ["pi", "hermes"];
/** PCR 0140: FreshCtx off vs FreshCtx. Tree-sitter is the Isolated Semantic Engine default. */
export const COST_COMPARE_ARMS = ["nothing", "freshctx-ts"];
export const MIN_LONG_SESSION_TURNS = SESSION_TURNS;

export { CELLS, SESSION_TURNS };

export function validateModel(model) {
  if (model !== MODEL) {
    throw new Error(`cost-ledger model must be ${MODEL}, got ${String(model)}`);
  }
}

export function validateArm(arm) {
  if (!ARMS.includes(arm)) {
    throw new Error(`arm must be one of ${ARMS.join("|")}, got ${String(arm)}`);
  }
}

export function validateHost(host) {
  if (!HOSTS.includes(host)) {
    throw new Error(`host must be one of ${HOSTS.join("|")}, got ${String(host)}`);
  }
}

/** PCR 0140 live/ingest/compare. FreshCtx without Tree-sitter does not exist. */
export function validateCostCompareArm(arm) {
  if (!COST_COMPARE_ARMS.includes(arm)) {
    throw new Error(`PCR 0140 arm must be one of ${COST_COMPARE_ARMS.join("|")}, got ${String(arm)}`);
  }
}

export function armUsesFreshCtx(arm) {
  validateArm(arm);
  return arm !== "nothing";
}

export function armUsesTreeSitter(arm) {
  validateArm(arm);
  return arm === "freshctx-ts";
}

/** Isolated Semantic Engine off is a harness env knob on `freshctx-no-ts` only. */
export function freshCtxEnvForArm(arm) {
  validateArm(arm);
  if (arm === "freshctx-no-ts") return { FRESHCTX_ISOLATED_SEMANTIC_ENGINE: "off" };
  return {};
}
