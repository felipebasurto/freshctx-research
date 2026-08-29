/** Shared constants for the Pi-only TypeScript measure pack. */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packDir = dirname(fileURLToPath(import.meta.url));

export const PACK_ROOT = new URL(".", import.meta.url);

export const ARMS = ["without", "with"];

export const TARGET_FILE = "src/settlement.ts";
export const TARGET_SYMBOL = "settleDailyLedger";
export const SIBLING_SYMBOL = "settleWeeklyLedger";

export const MARKER_V0 = "ST0";
export const MARKER_V1 = "ST1";
export const SIBLING_MARKER = "SW0";
export const LOOKALIKE_MARKER = "CT0";
export const LOOKALIKE_SYMBOL = "computeDailyLedgerTotal";

export const TARGET_FN = "settleDailyLedger";

export const PROMPT_T2 = `No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_SETTLE dentro de ${TARGET_FN} en ${TARGET_FILE}?
Responde una sola línea: SETTLE=...`;

export const PROMPT_T1 = `Lee este archivo entero, sin offset:
- ${TARGET_FILE}

No edites. No crees archivos. Responde solo:

SETTLE=...`;

export const CELLS = [
  { id: "t1-read", turn: 1, mutate: null, prompt: PROMPT_T1 },
  { id: "t2-settle", turn: 2, mutate: "flip-settle", prompt: PROMPT_T2 },
];

export function promptForCell(cell) {
  return cell.prompt;
}

export function resolveRepoRoot() {
  let dir = packDir;
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, "adapters/pi/extension.ts"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("could not resolve FreshCtx repo root from docs/lab/pi-trial-ts");
}

export function freshCtxExtensionPath(repoRoot = resolveRepoRoot()) {
  return join(repoRoot, "adapters/pi/extension.ts");
}

export function freshCtxExtensionForArm(arm, repoRoot = resolveRepoRoot()) {
  if (arm === "without") return null;
  return freshCtxExtensionPath(repoRoot);
}

export function validateArm(arm) {
  if (!ARMS.includes(arm)) {
    throw new Error(`arm must be one of ${ARMS.join("|")}, got ${String(arm)}`);
  }
}
