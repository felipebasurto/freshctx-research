/** Long-session vs two-turn ingest. Two-turn measure-pack ingest is INVALID. */

import { CELLS, MIN_LONG_SESSION_TURNS, SESSION_TURNS } from "./pack.mjs";

export const SESSION_KIND_LONG = "long-session";
export const SESSION_KIND_TWO_TURN = "two-turn-ingest";
export const SESSION_KIND_SHORT = "short-session";

const TWO_TURN_CELL_IDS = new Set(["t1-read", "t2-settle"]);

function turnList(turns) {
  return Array.isArray(turns) ? turns : [];
}

function cellIdsOf(turns) {
  return turnList(turns)
    .map((turn) => turn?.cellId)
    .filter((id) => typeof id === "string" && id.length > 0);
}

function labeledTwoTurn(options = {}) {
  const source = String(options.source ?? options.pack ?? options.label ?? "");
  return /two-turn|2-turn|two_turn/iu.test(source);
}

function looksLikeTwoTurnMeasurePack(turns, options = {}) {
  const list = turnList(turns);
  if (labeledTwoTurn(options)) return list.length <= 2;
  if (list.length !== 2) return false;
  const ids = cellIdsOf(list);
  if (ids.length === 0) return true;
  const onlyTwoTurnCells = ids.every((id) => TWO_TURN_CELL_IDS.has(id));
  const hasLaterCell = ids.some((id) => CELLS.some((cell) => cell.id === id && cell.turn >= 3));
  return onlyTwoTurnCells && !hasLaterCell;
}

export function classifySessionKind(turns, options = {}) {
  const list = turnList(turns);
  const count = list.length;
  if (looksLikeTwoTurnMeasurePack(list, options)) {
    return {
      kind: SESSION_KIND_TWO_TURN,
      turns: count,
      validForLongSessionCost: false,
      reason: "two-turn ingest is INVALID for long-session cost",
    };
  }
  if (count < MIN_LONG_SESSION_TURNS) {
    return {
      kind: SESSION_KIND_SHORT,
      turns: count,
      validForLongSessionCost: false,
      reason: `long-session cost requires >= ${MIN_LONG_SESSION_TURNS} turns, got ${count}`,
    };
  }
  return {
    kind: SESSION_KIND_LONG,
    turns: count,
    validForLongSessionCost: true,
    reason: null,
  };
}

export function assertLongSessionCost(turns, options = {}) {
  const classified = classifySessionKind(turns, options);
  if (!classified.validForLongSessionCost) {
    throw new Error(classified.reason);
  }
  return classified;
}

export function longSessionCellIds() {
  return CELLS.map((cell) => cell.id);
}

export { SESSION_TURNS, MIN_LONG_SESSION_TURNS };
