/** SWE-bench-like host-eval scaffold. Not a SWE-bench dump. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packDir = dirname(fileURLToPath(import.meta.url));

export const PACK_ID = "swe-host-trial-v0.1";
export const KIND = "host-eval-scaffold";
export const MODEL = "deepseek-v4-flash";
export const HOSTS = ["pi", "hermes"];
export const ARMS = ["nothing", "freshctx"];
export const SUCCESS_METRIC = "host-request-bytes-and-resolution";

const TASK_FILE = join(packDir, "tasks", "synthetic-mini-ledger.json");

export function freshCtxOn(arm) {
  validateArm(arm);
  return arm === "freshctx";
}

export function validateArm(arm) {
  if (!ARMS.includes(arm)) {
    throw new Error(`arm must be one of ${ARMS.join("|")}, got ${String(arm)}`);
  }
}

export function validateModel(model) {
  if (model !== MODEL) {
    throw new Error(`model must be ${MODEL}, got ${String(model)}`);
  }
}

export function listTaskCards() {
  return [loadTaskCardFromFile(TASK_FILE).instance_id];
}

export function loadTaskCard(instanceId) {
  const card = loadTaskCardFromFile(TASK_FILE);
  if (card.instance_id !== instanceId) {
    throw new Error(`unknown task card ${String(instanceId)}`);
  }
  return card;
}

export function measuredSweScores() {
  return null;
}

export function printColumnNames() {
  return [
    "host",
    "arm",
    "task",
    "turn",
    "request_bytes",
    "prompt_tokens",
    "resolution",
    "fail_to_pass",
  ];
}

export function redactSecretValue(value) {
  if (typeof value !== "string") return value;
  if (/^Bearer\s+\S+/u.test(value) || /^sk-[A-Za-z0-9]{8,}/u.test(value)) {
    return "[redacted]";
  }
  return value;
}

export function resolveRepoRoot() {
  let dir = packDir;
  for (let depth = 0; depth < 6; depth += 1) {
    if (
      existsSync(join(dir, "adapters/pi/extension.ts")) &&
      existsSync(join(dir, "adapters/hermes/bridge.mjs"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("could not resolve FreshCtx repo root from docs/lab/swe-host-trial");
}

export function hostHowTo({ host, arm }) {
  validateArm(arm);
  if (!HOSTS.includes(host)) {
    throw new Error(`host must be one of ${HOSTS.join("|")}, got ${String(host)}`);
  }
  validateModel(MODEL);
  const commands = [];
  if (host === "pi") {
    if (arm === "freshctx") {
      commands.push("Use adapters/pi/extension.ts from the FreshCtx repo root.");
    }
    commands.push(`cd docs/lab/swe-host-trial/.work/pi-${arm}`);
    commands.push("pi --provider deepseek --model deepseek-v4-flash");
  } else {
    if (arm === "freshctx") {
      commands.push(
        "node adapters/hermes/install.mjs docs/lab/swe-host-trial/.work/hermes-freshctx/hermes-home/plugins",
      );
    }
    commands.push(`cd docs/lab/swe-host-trial/.work/hermes-${arm}`);
    commands.push("hermes chat --provider openai --model deepseek-v4-flash");
  }
  return {
    host,
    arm,
    model: MODEL,
    freshCtx: freshCtxOn(arm),
    neverPasteApiKey: true,
    commands,
  };
}

function loadTaskCardFromFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
