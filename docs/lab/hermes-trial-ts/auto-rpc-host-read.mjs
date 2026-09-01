import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FRESHCTX_CWD_ENV, HERMES_TRIAL_WORKSPACE_ENV, TARGET_FILE, hostReadToolArgs } from "./pack.mjs";
import {
  BLOCKED_T1_TOOLS,
  FORCE_HOST_READ_ENV,
  applyForceHostReadInput,
  isHermesReadTool,
} from "./force-host-read.mjs";

const packDir = dirname(fileURLToPath(import.meta.url));

export { FORCE_HOST_READ_ENV };

export const FORCE_HOST_READ_HOOK_ENV = "HERMES_TRIAL_FORCE_HOST_READ_HOOK";
export const FORCE_HOST_READ_PLUGIN_NAME = "force-host-read";
export const FORCE_HOST_READ_TOOLS_LOG = "force-host-read.tools.jsonl";

export function envWithForceHostRead(baseEnv = {}, { workspace } = {}) {
  const env = { ...baseEnv, [FORCE_HOST_READ_ENV]: "1" };
  if (workspace) {
    env[FRESHCTX_CWD_ENV] = workspace;
    env[HERMES_TRIAL_WORKSPACE_ENV] = workspace;
  }
  return env;
}

export function forceHostReadPluginDir() {
  return join(packDir, "force-host-read-plugin");
}

export function forceHostReadHookPath() {
  return join(packDir, "force-host-read-hook.mjs");
}

export function forceHostReadPluginDest(pluginsDir) {
  return join(pluginsDir, FORCE_HOST_READ_PLUGIN_NAME);
}

export function recordedHostReadToolsPath(dumpDir) {
  return join(dumpDir, FORCE_HOST_READ_TOOLS_LOG);
}

export async function readRecordedHostReadTools(dumpDir) {
  try {
    const text = await readFile(recordedHostReadToolsPath(dumpDir), "utf8");
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export function t1ToolsForAssert({ eventTools = [], recordedTools = [] } = {}) {
  return recordedTools.length > 0 ? recordedTools : eventTools;
}

export function readToolMatchesHostArgs(tool, { workspace } = {}) {
  if (!tool || !isHermesReadTool(tool.toolName)) return false;
  const args = tool.args ?? tool.input ?? {};
  const expected = hostReadToolArgs({ workspace });
  const pathOk = args.path === expected.path || args.path === TARGET_FILE;
  return (
    pathOk &&
    args.scope === expected.scope &&
    args.selector === expected.selector &&
    args.offset === undefined &&
    args.limit === undefined
  );
}

export function t1HostReadToolsInvalidReason(tools, { workspace } = {}) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return "t1-read recorded no host tools";
  }
  for (const tool of tools) {
    if (BLOCKED_T1_TOOLS.has(tool.toolName)) {
      return `t1-read leftover ${tool.toolName} tool is invalid`;
    }
    if (!isHermesReadTool(tool.toolName)) {
      return `t1-read unexpected tool ${tool.toolName}`;
    }
    if (!readToolMatchesHostArgs(tool, { workspace })) {
      return "t1-read read tool must use scope=symbol selector settleDailyLedger with no offset/limit";
    }
  }
  return null;
}

export function t1HostReadToolsValid(tools, { workspace } = {}) {
  return t1HostReadToolsInvalidReason(tools, { workspace }) === null;
}

export function assertT1HostReadTools(tools, { arm = "unknown", workspace } = {}) {
  const reason = t1HostReadToolsInvalidReason(tools, { workspace });
  if (reason) {
    throw new Error(`${reason} (arm=${arm}): ${JSON.stringify(tools)}`);
  }
}

export function applyForceHostReadToTools(tools) {
  return tools.map((tool) => {
    if (!isHermesReadTool(tool.toolName)) return tool;
    const args = { ...(tool.args ?? tool.input ?? {}) };
    applyForceHostReadInput(args);
    return { ...tool, args };
  });
}
