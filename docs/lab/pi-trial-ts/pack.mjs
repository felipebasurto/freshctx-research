/** Shared constants for the Pi-only TypeScript measure pack. */

export const PACK_ROOT = new URL(".", import.meta.url);

export const ARMS = ["without", "with-file", "with-symbol"];

export const TARGET_FILE = "src/settlement.ts";
export const TARGET_SYMBOL = "settleDailyLedger";
export const SIBLING_SYMBOL = "settleWeeklyLedger";

export const MARKER_V0 = "ST0";
export const MARKER_V1 = "ST1";
export const SIBLING_MARKER = "SW0";

export const TARGET_FN = "settleDailyLedger";

export const PROMPT_T2 = `No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_SETTLE dentro de ${TARGET_FN} en ${TARGET_FILE}?
Responde una sola línea: SETTLE=...`;

export const PROMPT_T1_FILE = `Lee este archivo entero, sin offset:
- ${TARGET_FILE}

No edites. No crees archivos. Responde solo:

SETTLE=...`;

export const PROMPT_T1_SYMBOL = `Lee estos símbolos de ${TARGET_FILE} con scope=symbol (no leas el archivo entero):
- ${TARGET_SYMBOL}
- ${SIBLING_SYMBOL}

No edites. No crees archivos. Responde solo:

SETTLE=...
SIBLING=...`;

export const CELLS = [
  { id: "t1-read", turn: 1, mutate: null, promptByArm: { without: PROMPT_T1_FILE, "with-file": PROMPT_T1_FILE, "with-symbol": PROMPT_T1_SYMBOL } },
  { id: "t2-settle", turn: 2, mutate: "flip-settle", promptByArm: { without: PROMPT_T2, "with-file": PROMPT_T2, "with-symbol": PROMPT_T2 } },
];

export function promptForCell(cell, arm) {
  return cell.promptByArm[arm] ?? cell.promptByArm.without;
}

export function freshCtxExtensionForArm(arm, repoRoot) {
  if (arm === "without") return null;
  return `${repoRoot}/adapters/pi/extension.ts`;
}

export function validateArm(arm) {
  if (!ARMS.includes(arm)) {
    throw new Error(`arm must be one of ${ARMS.join("|")}, got ${String(arm)}`);
  }
}
