#!/usr/bin/env node
/** Dry success-board helper. Never calls a model. Never prints API keys. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { formatCellTsv, loadSyntheticPack, scoreBoard } from "./board.mjs";
import { ARMS, HOSTS, KIND, MODEL, PACK_ID, measuredSweScores } from "./pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixture/synthetic-cells.json");

function parseArgs(argv) {
  return { cmd: argv[0] ?? "" };
}

async function main(argv) {
  const { cmd } = parseArgs(argv);
  switch (cmd) {
    case "validate": {
      const pack = await loadSyntheticPack(FIXTURE);
      if (pack.measuredSweScores !== null) {
        throw new Error("synthetic pack must keep measuredSweScores null");
      }
      if (measuredSweScores() !== null) {
        throw new Error("measuredSweScores must stay null");
      }
      scoreBoard(pack);
      console.log(
        `${PACK_ID} ${KIND} model=${MODEL} hosts=${HOSTS.join(",")} arms=${ARMS.join(",")}`,
      );
      console.log("Never paste an API key.");
      return 0;
    }
    case "print-board": {
      const pack = await loadSyntheticPack(FIXTURE);
      const board = scoreBoard(pack);
      process.stdout.write(formatCellTsv(board));
      return 0;
    }
    default: {
      console.error("usage: run.mjs validate|print-board");
      return 1;
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}

export { main };
