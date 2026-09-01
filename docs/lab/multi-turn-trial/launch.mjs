import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  envWithForceHostRead,
  forceHostReadExtensionPath,
  piArgsForArm,
} from "../pi-trial-ts/auto-rpc-host-read.mjs";
import { freshCtxExtensionForArm as piExtensionForArm } from "../pi-trial-ts/pack.mjs";
import {
  hermesEnvForArm,
  launchHermes,
  prepareHermesHome,
} from "../hermes-trial-ts/launch-hermes.mjs";
import { MODEL as HERMES_MODEL } from "../hermes-trial-ts/pack.mjs";
import {
  MODEL,
  freshCtxEnvForArm,
  resolveRepoRoot,
  validateArm,
  validateHost,
} from "./pack.mjs";

const PI_DUMP_EXT = fileURLToPath(new URL("../pi-trial-ts/dump-request.ts", import.meta.url));

export function assertFlashOnlyModel(model = MODEL) {
  if (model !== "deepseek-v4-flash") {
    throw new Error(`host trial model must be deepseek-v4-flash, got ${String(model)}`);
  }
  if (model !== HERMES_MODEL) {
    throw new Error(`host trial model must match hermes-trial-ts (${HERMES_MODEL})`);
  }
}

export function piDumpExtensionPath() {
  return PI_DUMP_EXT;
}

export function piLaunchSpec(arm, { dumpDir } = {}) {
  validateArm(arm);
  assertFlashOnlyModel();
  const repoRoot = resolveRepoRoot();
  const env = envWithForceHostRead({
    ...freshCtxEnvForArm(arm),
    PI_TRIAL_DUMP_DIR: dumpDir,
  });
  delete env.FRESHCTX_BUDGET_CHARS;
  return {
    host: "pi",
    arm,
    model: MODEL,
    args: piArgsForArm({
      dumpExt: PI_DUMP_EXT,
      freshCtxExtension: piExtensionForArm(arm, repoRoot),
      forceHostRead: true,
    }),
    env,
    forceHostReadExtension: forceHostReadExtensionPath(),
  };
}

export function hermesLaunchSpec(arm, { proxyBaseUrl, dumpDir, hermesHome } = {}) {
  validateArm(arm);
  assertFlashOnlyModel();
  const env = hermesEnvForArm({
    arm,
    proxyBaseUrl,
    dumpDir,
    hermesHome,
  });
  return {
    host: "hermes",
    arm,
    model: MODEL,
    env,
    prepare: () => prepareHermesHome({ arm, hermesHome, repoRoot: resolveRepoRoot() }),
    launch: (opts) => launchHermes({ arm, ...opts }),
  };
}

export function launchSpecForHost(host, arm, opts = {}) {
  validateHost(host);
  if (host === "pi") return piLaunchSpec(arm, opts);
  if (host === "hermes") return hermesLaunchSpec(arm, opts);
  const _exhaustive = host;
  throw new Error(`unhandled host ${String(_exhaustive)}`);
}

export function workCwd(workRoot, host, arm) {
  return join(workRoot, host, arm);
}

export function hermesHomeForArm(cwd) {
  return join(cwd, "hermes-home");
}
