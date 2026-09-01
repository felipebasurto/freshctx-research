/** Reset and mutate the shared settlement fixture for a later live long session. */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { flipTargetInteriorMarker } from "../pi-trial-ts/live.mjs";
import { MARKER_V0, MARKER_V1, TARGET_FILE, TARGET_SYMBOL } from "../pi-trial-ts/pack.mjs";
import { COST_COMPARE_ARMS, validateCostCompareArm } from "./pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "../pi-trial-ts/fixture");
const WORK_ROOT = join(here, ".work");

export function workDir(arm) {
  validateCostCompareArm(arm);
  return join(WORK_ROOT, arm);
}

export async function reset(arm, source = FIXTURE) {
  validateCostCompareArm(arm);
  const dest = workDir(arm);
  await rm(dest, { recursive: true, force: true });
  await mkdir(WORK_ROOT, { recursive: true });
  await cp(source, dest, { recursive: true });
  return dest;
}

export async function mutate(arm, name) {
  validateCostCompareArm(arm);
  if (name !== "flip-settle") {
    throw new Error(`unknown mutate ${name}. use flip-settle`);
  }
  const path = join(workDir(arm), TARGET_FILE);
  const text = await readFile(path, "utf8");
  await writeFile(path, flipTargetInteriorMarker(text, { v0: MARKER_V0, v1: MARKER_V1, symbol: TARGET_SYMBOL }));
}

async function main(argv) {
  const cmd = argv[0];
  if (cmd === "reset") {
    const dest = await reset(argv[1]);
    process.stdout.write(`reset ${argv[1]} -> ${dest}\n`);
    return;
  }
  if (cmd === "mutate") {
    await mutate(argv[1], argv[2]);
    process.stdout.write(`${JSON.stringify({ arm: argv[1], mutate: argv[2] })}\n`);
    return;
  }
  if (cmd === "arms") {
    process.stdout.write(`${COST_COMPARE_ARMS.join("\n")}\n`);
    return;
  }
  throw new Error("usage: live.mjs reset|mutate|arms ...");
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
