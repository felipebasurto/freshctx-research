#!/usr/bin/env node
/** Dry host-eval helper. Never calls a model. Never prints API keys. */

import { fileURLToPath } from "node:url";

import {
  ARMS,
  HOSTS,
  KIND,
  MODEL,
  PACK_ID,
  hostHowTo,
  listTaskCards,
  loadTaskCard,
  measuredSweScores,
  printColumnNames,
  validateArm,
} from "./pack.mjs";

function parseArgs(argv) {
  const cmd = argv[0] ?? "";
  const flags = {};
  for (const arg of argv.slice(1)) {
    const matched = arg.match(/^--([^=]+)=(.+)$/u);
    if (matched) flags[matched[1]] = matched[2];
  }
  return { cmd, flags };
}

function printHowTo(flags) {
  const host = flags.host;
  const arm = flags.arm;
  validateArm(arm);
  if (!HOSTS.includes(host)) {
    throw new Error(`host must be one of ${HOSTS.join("|")}, got ${String(host)}`);
  }
  const guide = hostHowTo({ host, arm });
  for (const line of guide.commands) {
    console.log(line);
  }
  console.log("Never paste an API key.");
}

function main(argv) {
  const { cmd, flags } = parseArgs(argv);
  switch (cmd) {
    case "validate": {
      for (const id of listTaskCards()) {
        loadTaskCard(id);
      }
      console.log(
        `${PACK_ID} ${KIND} model=${MODEL} hosts=${HOSTS.join(",")} arms=${ARMS.join(",")}`,
      );
      return 0;
    }
    case "print-columns": {
      console.log(printColumnNames().join("\t"));
      if (measuredSweScores() === null) {
        console.log("not measured");
      }
      return 0;
    }
    case "how-to": {
      printHowTo(flags);
      return 0;
    }
    case "dry-run": {
      console.log("dry-run prepares local work copies only. No model call.");
      console.log("Never paste an API key.");
      return 0;
    }
    default: {
      console.error("usage: run.mjs validate|print-columns|how-to|dry-run");
      return 1;
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}

export { main };
