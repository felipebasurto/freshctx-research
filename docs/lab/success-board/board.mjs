/** Fail-closed task pass/fail from exact_current_bytes and stdout_current. */

import { readFile } from "node:fs/promises";

import { ASSERTS, measuredSweScores, validateArm } from "./pack.mjs";

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

export function coerceAssert(value) {
  if (value === true || value === "yes") return true;
  if (value === false || value === "no") return false;
  if (value === "n/a" || value === null) return null;
  throw new Error(`unknown assert value ${String(value)}`);
}

export function formatAssert(value) {
  if (value === true || value === "yes") return "yes";
  if (value === false || value === "no") return "no";
  if (value === "n/a" || value === null) return "n/a";
  return "—";
}

export function scoreCell(cell) {
  if (cell == null || cell.missing === true || cell.dumpMissing === true) {
    return {
      verdict: "fail",
      reason: "missing-dump",
      exact_current_bytes: "—",
      stdout_current: "—",
    };
  }

  const exactRaw = firstDefined(cell.exact_current_bytes, cell.exactCurrentBytes);
  const stdoutRaw = firstDefined(
    cell.stdout_current,
    cell.stdoutCurrent,
    cell.stdoutMatchesCurrent,
  );

  if (exactRaw === undefined || stdoutRaw === undefined) {
    return {
      verdict: "fail",
      reason: "missing-dump",
      exact_current_bytes: formatAssert(exactRaw),
      stdout_current: formatAssert(stdoutRaw),
    };
  }

  if (exactRaw === "n/a" && stdoutRaw === "n/a") {
    return {
      verdict: "n/a",
      reason: "asserts-not-applicable",
      exact_current_bytes: "n/a",
      stdout_current: "n/a",
    };
  }

  const exact = coerceAssert(exactRaw);
  const stdout = coerceAssert(stdoutRaw);
  if (exact !== true || stdout !== true) {
    return {
      verdict: "fail",
      reason: "assert-failed",
      exact_current_bytes: formatAssert(exactRaw),
      stdout_current: formatAssert(stdoutRaw),
    };
  }

  return {
    verdict: "pass",
    reason: "exact-current-and-stdout",
    exact_current_bytes: "yes",
    stdout_current: "yes",
  };
}

export function scoreTask(cells) {
  const list = Array.isArray(cells) ? cells : [];
  const scored = list.map((cell) => ({
    turn: cell?.turn ?? null,
    ...scoreCell(cell),
  }));
  const fails = scored.filter((row) => row.verdict === "fail");
  if (fails.length > 0) {
    const missing = fails.find((row) => row.reason === "missing-dump");
    return {
      verdict: "fail",
      reason: missing ? "missing-dump" : "assert-failed",
      cells: scored,
    };
  }
  if (!scored.some((row) => row.verdict === "pass")) {
    return {
      verdict: "fail",
      reason: "missing-dump",
      cells: scored,
    };
  }
  return {
    verdict: "pass",
    reason: "exact-current-and-stdout",
    cells: scored,
  };
}

export function scoreBoard(pack) {
  const rows = [];
  for (const entry of pack.tasks ?? []) {
    validateArm(entry.arm);
    const scored = scoreTask(entry.cells);
    rows.push({
      host: entry.host,
      arm: entry.arm,
      task: entry.task,
      verdict: scored.verdict,
      reason: scored.reason,
      cells: scored.cells,
    });
  }
  return {
    label: pack.label ?? "synthetic",
    liveHost: pack.liveHost === true,
    notSweBench: pack.notSweBench !== false,
    asserts: ASSERTS,
    measuredSweScores: measuredSweScores(),
    rows,
  };
}

export async function loadSyntheticPack(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function formatBoardTsv(board) {
  const header = ["host", "arm", "task", "verdict", "reason"].join("\t");
  const lines = [header];
  for (const row of board.rows) {
    lines.push([row.host, row.arm, row.task, row.verdict, row.reason].join("\t"));
  }
  return `${lines.join("\n")}\n`;
}

export function formatCellTsv(board) {
  const header = [
    "host",
    "arm",
    "task",
    "turn",
    "exact_current_bytes",
    "stdout_current",
    "verdict",
    "reason",
  ].join("\t");
  const lines = [header];
  for (const row of board.rows) {
    for (const cell of row.cells) {
      lines.push(
        [
          row.host,
          row.arm,
          row.task,
          cell.turn ?? "—",
          cell.exact_current_bytes,
          cell.stdout_current,
          cell.verdict,
          cell.reason,
        ].join("\t"),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
