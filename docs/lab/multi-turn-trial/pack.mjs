/** Multi-turn host trial. Extends the 2-turn Pi/Hermes TS packs past turn 2. */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARMS,
  HOST_READ_SCOPE,
  LOOKALIKE_MARKER,
  LOOKALIKE_SYMBOL,
  MARKER_V0,
  MARKER_V1,
  PROMPT_T1,
  PROMPT_T2,
  SIBLING_MARKER,
  SIBLING_SYMBOL,
  TARGET_FILE,
  TARGET_FN,
  TARGET_SYMBOL,
  freshCtxEnvForArm,
  freshCtxExtensionForArm,
  hostReadToolArgs,
  promptForCell as promptForTwoTurnCell,
  validateArm,
} from "../pi-trial-ts/pack.mjs";
import { MODEL as HERMES_MODEL } from "../hermes-trial-ts/pack.mjs";

const packDir = dirname(fileURLToPath(import.meta.url));

export const PACK_ROOT = new URL(".", import.meta.url);
export const MODEL = "deepseek-v4-flash";
export const HOSTS = ["pi", "hermes"];
export const MARKER_V2 = "ST2";
export const MARKER_SEQUENCE = [MARKER_V0, MARKER_V1, MARKER_V2];
export const PI_PACK_FIXTURE = new URL("../pi-trial-ts/fixture/", import.meta.url);

export {
  ARMS,
  HOST_READ_SCOPE,
  LOOKALIKE_MARKER,
  LOOKALIKE_SYMBOL,
  MARKER_V0,
  MARKER_V1,
  PROMPT_T1,
  PROMPT_T2,
  SIBLING_MARKER,
  SIBLING_SYMBOL,
  TARGET_FILE,
  TARGET_FN,
  TARGET_SYMBOL,
  freshCtxEnvForArm,
  freshCtxExtensionForArm,
  hostReadToolArgs,
  validateArm,
};

if (MODEL !== HERMES_MODEL) {
  throw new Error(`multi-turn model ${MODEL} must stay ${HERMES_MODEL}`);
}

export const MUTATE_FLIPS = {
  "flip-settle": { from: MARKER_V0, to: MARKER_V1 },
  "flip-settle-2": { from: MARKER_V1, to: MARKER_V2 },
};

export const CELLS = [
  { id: "t1-read", turn: 1, mutate: null, expectedMarker: MARKER_V0, prompt: PROMPT_T1 },
  { id: "t2-settle", turn: 2, mutate: "flip-settle", expectedMarker: MARKER_V1, prompt: PROMPT_T2 },
  { id: "t3-settle", turn: 3, mutate: "flip-settle-2", expectedMarker: MARKER_V2, prompt: PROMPT_T2 },
  { id: "t4-unchanged", turn: 4, mutate: null, expectedMarker: MARKER_V2, prompt: PROMPT_T2 },
];

export function promptForCell(cell) {
  return promptForTwoTurnCell(cell);
}

export function expectedMarkerForCell(cell) {
  return cell.expectedMarker;
}

export function priorMarkersForCell(cell) {
  const expected = expectedMarkerForCell(cell);
  return MARKER_SEQUENCE.filter((marker) => marker !== expected);
}

export function validateHost(host) {
  if (!HOSTS.includes(host)) {
    throw new Error(`host must be one of ${HOSTS.join("|")}, got ${String(host)}`);
  }
}

export function validateMutate(name) {
  if (!Object.hasOwn(MUTATE_FLIPS, name)) {
    throw new Error(`unknown mutate ${name}. use ${Object.keys(MUTATE_FLIPS).join("|")}`);
  }
}

export function resolveRepoRoot() {
  let dir = packDir;
  for (let depth = 0; depth < 6; depth += 1) {
    if (
      existsSync(join(dir, "adapters/pi/extension.ts")) &&
      existsSync(join(dir, "adapters/hermes/bridge.mjs"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("could not resolve FreshCtx repo root from docs/lab/multi-turn-trial");
}

export function fixtureRoot() {
  return fileURLToPath(PI_PACK_FIXTURE).replace(/\/$/u, "");
}

export function parseHostArg(raw, fallback = "both") {
  const value = raw == null || raw === "" ? fallback : String(raw);
  if (value === "both") return [...HOSTS];
  if (HOSTS.includes(value)) return [value];
  throw new Error(`host must be one of ${HOSTS.join("|")}|both, got ${String(raw)}`);
}
