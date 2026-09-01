import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ARMS, CELLS, HOSTS } from "./pack.mjs";
import { COLUMN_NAMES, formatCaptureRow } from "./scan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CAPTURE = join(here, ".work/capture");

async function loadArmCells(host, arm) {
  const cells = [];
  for (const spec of CELLS) {
    const path = join(CAPTURE, host, arm, `${spec.id}.json`);
    try {
      cells.push(JSON.parse(await readFile(path, "utf8")));
    } catch {
      cells.push({ id: spec.id, turn: spec.turn, missing: true });
    }
  }
  return cells;
}

function printHeader() {
  process.stdout.write(`${COLUMN_NAMES.join("\t")}\n`);
}

export function printRow({ host, arm, turn, cell }) {
  process.stdout.write(`${formatCaptureRow({ host, arm, turn, cell }).join("\t")}\n`);
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
  for (const host of HOSTS) {
    for (const arm of ARMS) {
      const cells = await loadArmCells(host, arm);
      for (const cell of cells) {
        printRow({ host, arm, turn: cell.turn ?? "?", cell });
      }
    }
  }
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}
