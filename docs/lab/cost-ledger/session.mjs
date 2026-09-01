/** Long-session cells. Same prompts on every arm. Eight provider turns. */

export const SESSION_TURNS = 8;

export const TARGET_FILE = "src/settlement.ts";
export const TARGET_SYMBOL = "settleDailyLedger";
export const TARGET_FN = "settleDailyLedger";

export const PROMPT_T1 = `Lee el símbolo ${TARGET_SYMBOL} en ${TARGET_FILE} con scope=symbol y selector ${TARGET_SYMBOL}.

No edites. No crees archivos. Responde solo:

SETTLE=...`;

export const PROMPT_SETTLE = `No uses herramientas. No leas. No edites.
¿Cuál es ahora MARKER_SETTLE dentro de ${TARGET_FN} en ${TARGET_FILE}?
Responde una sola línea: SETTLE=...`;

export const PROMPT_REREAD = `Lee otra vez el símbolo ${TARGET_SYMBOL} en ${TARGET_FILE} con scope=symbol y selector ${TARGET_SYMBOL}.

No edites. No crees archivos. Responde solo:

SETTLE=...`;

export const CELLS = [
  { id: "t1-read", turn: 1, mutate: null, prompt: PROMPT_T1 },
  { id: "t2-settle", turn: 2, mutate: "flip-settle", prompt: PROMPT_SETTLE },
  { id: "t3-reread", turn: 3, mutate: null, prompt: PROMPT_REREAD },
  { id: "t4-settle", turn: 4, mutate: null, prompt: PROMPT_SETTLE },
  { id: "t5-ask-again", turn: 5, mutate: null, prompt: PROMPT_SETTLE },
  { id: "t6-reread", turn: 6, mutate: null, prompt: PROMPT_REREAD },
  { id: "t7-settle", turn: 7, mutate: null, prompt: PROMPT_SETTLE },
  { id: "t8-ask-again", turn: 8, mutate: null, prompt: PROMPT_SETTLE },
];

export function promptForCell(cell) {
  return cell.prompt;
}
