import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ARMS, CELLS } from "./pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CAPTURE = join(here, ".work/capture");

function formatBool(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "—";
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

function lastRequestField(cell, field) {
  const last = cell.requests?.at(-1);
  if (!last) return null;
  return last[field] ?? null;
}

const RESOLUTION_ATTR_RE = /resolution=\\"([^"\\]+)\\"/gu;

function resolutionFromSerializedRequest(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  const matches = [...text.matchAll(RESOLUTION_ATTR_RE)].map((match) => match[1]);
  if (matches.length === 0) return null;
  return matches.at(-1) ?? null;
}

async function resolutionForTurn2Cell(cell) {
  const direct = cell.resolution ?? lastRequestField(cell, "resolution");
  if (direct && direct !== "none") return String(direct);

  const last = cell.requests?.at(-1);
  const scanFile = typeof last?.file === "string" ? last.file : null;
  const rawFile = scanFile?.replace(/\.scan\.json$/u, ".json") ?? null;
  if (!rawFile || !cell.arm) return direct == null ? "—" : String(direct);

  try {
    const serialized = await readFile(join(CAPTURE, cell.arm, "requests", rawFile), "utf8");
    const parsed = resolutionFromSerializedRequest(serialized);
    if (parsed) return parsed;
  } catch {
    // fall through to stored resolution
  }
  return direct == null ? "—" : String(direct);
}

function sumRequestBytes(cell) {
  if (!Array.isArray(cell.requestBytes) || cell.requestBytes.length === 0) return null;
  return cell.requestBytes.reduce((total, value) => total + Number(value ?? 0), 0);
}

function lastPromptTokens(cell) {
  if (!Array.isArray(cell.promptTokens) || cell.promptTokens.length === 0) return null;
  for (let index = cell.promptTokens.length - 1; index >= 0; index -= 1) {
    const value = cell.promptTokens[index];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

async function loadArmCells(arm) {
  const cells = [];
  for (const spec of CELLS) {
    const path = join(CAPTURE, arm, `${spec.id}.json`);
    try {
      cells.push(JSON.parse(await readFile(path, "utf8")));
    } catch {
      cells.push({ id: spec.id, turn: spec.turn, missing: true });
    }
  }
  return cells;
}

function printHeader() {
  process.stdout.write(
    [
      "arm",
      "turn",
      "t2_exact_new_bytes",
      "sibling_bytes_in_request",
      "request_bytes",
      "prompt_tokens",
      "pi_stdout_current",
      "resolution",
    ].join("\t"),
  );
  process.stdout.write("\n");
}

async function printRow({ arm, turn, cell }) {
  if (cell.missing) {
    process.stdout.write(
      [arm, turn, "—", "—", "—", "—", "—", "—"].join("\t"),
    );
    process.stdout.write("\n");
    return;
  }

  const t2Exact = turn === 2 ? formatBool(cell.t2ExactNewBytes ?? lastRequestField(cell, "t2ExactNewBytes")) : "n/a";
  const siblingBytes =
    turn === 2 ? formatBool(cell.siblingBytesInRequest ?? lastRequestField(cell, "siblingBytesInRequest")) : "n/a";
  const resolution =
    turn === 2
      ? String(await resolutionForTurn2Cell({ ...cell, arm }))
      : "n/a";

  process.stdout.write(
    [
      arm,
      turn,
      t2Exact,
      siblingBytes,
      formatNumber(sumRequestBytes(cell)),
      formatNumber(lastPromptTokens(cell)),
      turn === 2 ? formatBool(cell.stdoutMatchesCurrent) : "n/a",
      resolution,
    ].join("\t"),
  );
  process.stdout.write("\n");
}

async function main() {
  const capturePath = join(CAPTURE, "summary.json");
  try {
    await readFile(capturePath, "utf8");
  } catch {
    process.stderr.write(
      "No capture yet. Run auto-rpc.mjs or complete the BATTERY manually, then rerun print-columns.mjs.\n",
    );
    process.exitCode = 1;
    return;
  }

  printHeader();
  for (const arm of ARMS) {
    const cells = await loadArmCells(arm);
    for (const cell of cells) {
      await printRow({ arm, turn: cell.turn ?? "?", cell });
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
