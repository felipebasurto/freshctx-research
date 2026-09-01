import { access, lstat, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { spawn } from "node:child_process";

import { installHermesPlugin } from "../../../adapters/hermes/install.mjs";
import {
  FORCE_HOST_READ_HOOK_ENV,
  FORCE_HOST_READ_PLUGIN_NAME,
  envWithForceHostRead,
  forceHostReadHookPath,
  forceHostReadPluginDest,
  forceHostReadPluginDir,
} from "./auto-rpc-host-read.mjs";
import { launchChild } from "./launch-child.mjs";
import { cliQueryArgvInvalidReason } from "./hermes-queries.mjs";
import {
  MODEL,
  freshCtxEnvForArm,
  freshCtxHermesInstallScript,
  hermesContextEngineForArm,
  resolveRepoRoot,
  validateArm,
} from "./pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export function hermesBin() {
  return process.env.HERMES_BIN ?? "hermes";
}

export function hermesConfigYaml({ engine } = {}) {
  const enabled = [FORCE_HOST_READ_PLUGIN_NAME];
  if (engine === "freshctx") enabled.push("freshctx");
  const lines = [
    "model:",
    `  default: ${MODEL}`,
    "provider: openai",
    "plugins:",
    "  enabled:",
    ...enabled.map((name) => `    - ${name}`),
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
  workspace,
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
    [FORCE_HOST_READ_HOOK_ENV]: forceHostReadHookPath(),
    ...extra,
  }, { workspace });
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
  return ["chat"];
}

/** CLI prompts go through `runCliQuery`. A persistent `hermes chat` sibling shares HERMES_HOME. */
export const CLI_PROTOCOL_SPAWNS_PERSISTENT_CHILD = false;

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

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureSymlink(target, linkPath) {
  if (await pathExists(linkPath)) {
    const stat = await lstat(linkPath);
    if (stat.isSymbolicLink()) {
      await rm(linkPath);
    } else {
      throw new Error(`refusing to replace non-symlink: ${linkPath}`);
    }
  }
  await mkdir(dirname(linkPath), { recursive: true });
  await symlink(target, linkPath);
}

export async function installForceHostReadPlugin(pluginsDir) {
  const dest = forceHostReadPluginDest(pluginsDir);
  await ensureSymlink(forceHostReadPluginDir(), dest);
  return dest;
}

export async function prepareHermesHome({ arm, hermesHome, repoRoot = resolveRepoRoot() }) {
  validateArm(arm);
  await mkdir(hermesHome, { recursive: true });
  const engine = hermesContextEngineForArm(arm);
  const pluginsDir = pluginsDirForHome(hermesHome);
  await writeFile(join(hermesHome, "config.yaml"), hermesConfigYaml({ engine }));
  await installForceHostReadPlugin(pluginsDir);
  if (engine === "freshctx") {
    await installHermesPlugin(pluginsDir);
  }
  return {
    hermesHome,
    engine,
    pluginsDir,
    forceHostReadPlugin: forceHostReadPluginDest(pluginsDir),
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
    workspace: cwd,
    extra: { PATH: `${dirname(bin)}:${process.env.PATH ?? ""}` },
  });
  const args = hermesLaunchArgs(detected);
  const argvReason = cliQueryArgvInvalidReason(args);
  if (argvReason) throw new Error(argvReason);
  if (detected === "cli" && !CLI_PROTOCOL_SPAWNS_PERSISTENT_CHILD) {
    return {
      proc: null,
      protocol: detected,
      env,
      args,
      prepared,
      exit: Promise.resolve({ code: 0, signal: null, stdout: "", stderr: "" }),
      async stop() {
        return { code: 0, signal: null, stdout: "", stderr: "" };
      },
      getStdout: () => "",
      getStderr: () => "",
    };
  }
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
