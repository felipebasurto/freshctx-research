/** Shared constants for the long-session cost ledger. */

import { CELLS, SESSION_TURNS } from "./session.mjs";

export const PACK_ROOT = new URL(".", import.meta.url);
export const MODEL = "deepseek-v4-flash";
export const ALLOWED_MODELS = [MODEL];
export const ARMS = ["nothing", "freshctx-no-ts", "freshctx-ts"];

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
