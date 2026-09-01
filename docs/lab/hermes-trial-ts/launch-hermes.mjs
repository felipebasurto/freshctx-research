import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { spawn } from "node:child_process";

import { installHermesPlugin } from "../../../adapters/hermes/install.mjs";
import {
  MODEL,
  freshCtxEnvForArm,
  freshCtxHermesInstallScript,
  hermesContextEngineForArm,
  resolveRepoRoot,
  validateArm,
} from "./pack.mjs";
import { envWithForceHostRead } from "./auto-rpc-host-read.mjs";
import { launchChild } from "./launch-child.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export function hermesBin() {
  return process.env.HERMES_BIN ?? "hermes";
}

export function hermesConfigYaml({ engine } = {}) {
  const lines = [
    "model:",
    `  default: ${MODEL}`,
    "provider: openai",
  ];
  if (engine === "freshctx") {
    lines.push("context:", "  engine: freshctx");
  }
  return `${lines.join("\n")}\n`;
}

export function pluginsDirForHome(hermesHome) {
  return join(hermesHome, "plugins");
}

export function hermesEnvForArm({
  arm,
  proxyBaseUrl,
  dumpDir,
  hermesHome,
  extra = {},
} = {}) {
  validateArm(arm);
  const env = envWithForceHostRead({
    ...freshCtxEnvForArm(arm),
    HERMES_HOME: hermesHome,
    HERMES_MODEL: MODEL,
    OPENAI_MODEL: MODEL,
    OPENAI_BASE_URL: proxyBaseUrl,
    HERMES_TRIAL_DUMP_DIR: dumpDir,
    ...extra,
  });
  delete env.FRESHCTX_BUDGET_CHARS;
  return env;
}

export function detectHermesProtocol(helpText) {
  const text = String(helpText ?? "");
  if (/\bacp\b/iu.test(text)) return "acp";
  if (/tui-gateway|tui_gateway|--tui/iu.test(text)) return "tui-gateway";
  return "cli";
}

export function hermesLaunchArgs(protocol) {
  if (protocol === "acp") return ["acp"];
  if (protocol === "tui-gateway") return ["--tui"];
  return ["chat", "-q"];
}

function runHelp(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ["--help"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out));
  });
}

export async function prepareHermesHome({ arm, hermesHome, repoRoot = resolveRepoRoot() }) {
  validateArm(arm);
  await mkdir(hermesHome, { recursive: true });
  const engine = hermesContextEngineForArm(arm);
  await writeFile(join(hermesHome, "config.yaml"), hermesConfigYaml({ engine }));
  if (engine === "freshctx") {
    await installHermesPlugin(pluginsDirForHome(hermesHome));
  }
  return {
    hermesHome,
    engine,
    pluginsDir: pluginsDirForHome(hermesHome),
    installScript: freshCtxHermesInstallScript(repoRoot),
  };
}

export async function launchHermes({
  arm,
  cwd,
  hermesHome,
  proxyBaseUrl,
  dumpDir,
  logPath,
  protocol,
} = {}) {
  validateArm(arm);
  const bin = hermesBin();
  const detected = protocol ?? detectHermesProtocol(await runHelp(bin));
  const prepared = await prepareHermesHome({ arm, hermesHome });
  const env = hermesEnvForArm({
    arm,
    proxyBaseUrl,
    dumpDir,
    hermesHome: prepared.hermesHome,
    extra: { PATH: `${dirname(bin)}:${process.env.PATH ?? ""}` },
  });
  const args = hermesLaunchArgs(detected);
  const child = launchChild({
    command: bin,
    args,
    cwd,
    env,
    logPath,
  });
  return { ...child, protocol: detected, env, args, prepared };
}

const invoked = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invoked) {
  process.stdout.write(`launch-hermes helpers loaded from ${here}\n`);
}
