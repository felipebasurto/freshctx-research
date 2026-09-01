import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FRESHCTX_CWD_ENV,
  PI_TRIAL_WORKSPACE_ENV,
  hostReadToolArgs,
  isDestRootSettlementSearch,
  isWorkFixtureSettlementPath,
} from "./pack.mjs";

const packDir = fileURLToPath(new URL(".", import.meta.url));

export const FORCE_HOST_READ_ENV = "PI_TRIAL_FORCE_HOST_READ";

const BLOCKED_T1_TOOL_NAMES = new Set(["bash", "shell", "grep", "find", "edit", "write"]);

export function forceHostReadExtensionPath() {
  return join(packDir, "force-host-read.ts");
}

export function toolsFromExecutionStartEvents(events) {
  return events
    .filter((event) => event.type === "tool_execution_start")
    .map((event) => ({
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: event.args ?? null,
    }));
}

export function envWithForceHostRead(baseEnv = {}, { workspace } = {}) {
  const env = { ...baseEnv, [FORCE_HOST_READ_ENV]: "1" };
  if (workspace) {
    env[FRESHCTX_CWD_ENV] = workspace;
    env[PI_TRIAL_WORKSPACE_ENV] = workspace;
  }
  return env;
}

export function readToolMatchesHostArgs(tool, { workspace } = {}) {
  if (!tool || tool.toolName !== "read") return false;
  const args = tool.args ?? {};
  const expected = hostReadToolArgs({ workspace });
  const pathOk = args.path === expected.path || isWorkFixtureSettlementPath(args.path);
  return (
    pathOk &&
    args.scope === expected.scope &&
    args.selector === expected.selector &&
    args.offset === undefined &&
    args.limit === undefined
  );
}

export function t1HostReadToolsInvalidReason(tools, { workspace, destRoot } = {}) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return "t1-read recorded no host tools";
  }
  let sawMatch = false;
  for (const tool of tools) {
    if (isDestRootSettlementSearch(tool, { workspace, destRoot })) {
      continue;
    }
    if (BLOCKED_T1_TOOL_NAMES.has(tool.toolName)) {
      return `t1-read leftover ${tool.toolName} tool is invalid`;
    }
    if (tool.toolName !== "read") {
      return `t1-read unexpected tool ${tool.toolName}`;
    }
    if (!readToolMatchesHostArgs(tool, { workspace })) {
      return "t1-read read tool must use scope=symbol selector settleDailyLedger with no offset/limit";
    }
    sawMatch = true;
  }
  if (!sawMatch) {
    return "t1-read dest-root search_files is not a fixture match";
  }
  return null;
}

export function t1HostReadToolsValid(tools, { workspace, destRoot } = {}) {
  return t1HostReadToolsInvalidReason(tools, { workspace, destRoot }) === null;
}

export function assertT1HostReadTools(tools, { arm = "unknown", workspace, destRoot } = {}) {
  const reason = t1HostReadToolsInvalidReason(tools, { workspace, destRoot });
  if (reason) {
    throw new Error(`${reason} (arm=${arm}): ${JSON.stringify(tools)}`);
  }
}

export function piArgsForArm({ dumpExt, freshCtxExtension, forceHostRead = true }) {
  const args = [
    "--mode",
    "rpc",
    "--no-session",
    "--no-context-files",
    "--no-extensions",
    "--provider",
    "deepseek",
    "--model",
    "deepseek-v4-flash",
  ];
  if (freshCtxExtension) args.push("-e", freshCtxExtension);
  args.push("-e", dumpExt);
  if (forceHostRead) args.push("-e", forceHostReadExtensionPath());
  return args;
}
