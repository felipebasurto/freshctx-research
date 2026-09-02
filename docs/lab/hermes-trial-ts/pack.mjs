/** Shared constants for the Hermes TypeScript measure pack. Same family as docs/lab/pi-trial-ts/. */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARMS,
  CELLS,
  FRESHCTX_CWD_ENV,
  HERMES_TRIAL_WORKSPACE_ENV,
  HOST_READ_SCOPE,
  LOOKALIKE_MARKER,
  LOOKALIKE_SYMBOL,
  MARKER_V0,
  MARKER_V1,
  PI_TRIAL_WORKSPACE_ENV,
  PROMPT_T1,
  PROMPT_T2,
  SIBLING_MARKER,
  SIBLING_SYMBOL,
  TARGET_FILE,
  TARGET_FN,
  TARGET_SYMBOL,
  freshCtxEnvForArm,
  hostReadToolArgs,
  isDestRootSettlementPath,
  isDestRootSettlementSearch,
  isWorkFixtureSettlementPath,
  promptForCell,
  resolveHostReadWorkspace,
  searchPathFromArgs,
  DEST_ROOT_SEARCH_TOOLS,
  destRootFromWorkCwd,
  isAllowedTrialTreePath,
  wrongTreeHostReadReason,
  validateArm,
} from "../pi-trial-ts/pack.mjs";

const packDir = dirname(fileURLToPath(import.meta.url));

export const PACK_ROOT = new URL(".", import.meta.url);
export const MODEL = "deepseek-v4-flash";
export const PI_PACK_FIXTURE = new URL("../pi-trial-ts/fixture/", import.meta.url);

export {
  ARMS,
  CELLS,
  FRESHCTX_CWD_ENV,
  HERMES_TRIAL_WORKSPACE_ENV,
  HOST_READ_SCOPE,
  LOOKALIKE_MARKER,
  LOOKALIKE_SYMBOL,
  MARKER_V0,
  MARKER_V1,
  PI_TRIAL_WORKSPACE_ENV,
  PROMPT_T1,
  PROMPT_T2,
  SIBLING_MARKER,
  SIBLING_SYMBOL,
  TARGET_FILE,
  TARGET_FN,
  TARGET_SYMBOL,
  freshCtxEnvForArm,
  hostReadToolArgs,
  isDestRootSettlementPath,
  isDestRootSettlementSearch,
  isWorkFixtureSettlementPath,
  promptForCell,
  resolveHostReadWorkspace,
  searchPathFromArgs,
  DEST_ROOT_SEARCH_TOOLS,
  destRootFromWorkCwd,
  isAllowedTrialTreePath,
  wrongTreeHostReadReason,
  validateArm,
};

export function resolveRepoRoot() {
  let dir = packDir;
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, "adapters/hermes/bridge.mjs"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("could not resolve FreshCtx repo root from docs/lab/hermes-trial-ts");
}

export function freshCtxHermesAdapterDir(repoRoot = resolveRepoRoot()) {
  return join(repoRoot, "adapters/hermes");
}

export function freshCtxHermesInstallScript(repoRoot = resolveRepoRoot()) {
  return join(freshCtxHermesAdapterDir(repoRoot), "install.mjs");
}

export function freshCtxPluginForArm(arm, repoRoot = resolveRepoRoot()) {
  validateArm(arm);
  if (arm === "nothing") return null;
  return freshCtxHermesAdapterDir(repoRoot);
}

export function hermesContextEngineForArm(arm) {
  validateArm(arm);
  return arm === "nothing" ? null : "freshctx";
}

export function fixtureRoot() {
  return fileURLToPath(PI_PACK_FIXTURE).replace(/\/$/u, "");
}
