import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { hostReadToolArgs } from "./pack.mjs";

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

export function envWithForceHostRead(baseEnv = {}) {
  return { ...baseEnv, [FORCE_HOST_READ_ENV]: "1" };
}

export function readToolMatchesHostArgs(tool) {
  if (!tool || tool.toolName !== "read") return false;
  const args = tool.args ?? {};
  const expected = hostReadToolArgs();
  return (
    args.path === expected.path &&
    args.scope === expected.scope &&
    args.selector === expected.selector &&
    args.offset === undefined &&
    args.limit === undefined
  );
}

export function t1HostReadToolsInvalidReason(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return "t1-read recorded no host tools";
  }
  for (const tool of tools) {
    if (BLOCKED_T1_TOOL_NAMES.has(tool.toolName)) {
      return `t1-read leftover ${tool.toolName} tool is invalid`;
    }
    if (tool.toolName !== "read") {
      return `t1-read unexpected tool ${tool.toolName}`;
    }
    if (!readToolMatchesHostArgs(tool)) {
      return "t1-read read tool must use scope=symbol selector settleDailyLedger with no offset/limit";
    }
  }
  return null;
}

export function t1HostReadToolsValid(tools) {
  return t1HostReadToolsInvalidReason(tools) === null;
}

export function assertT1HostReadTools(tools, { arm = "unknown" } = {}) {
  const reason = t1HostReadToolsInvalidReason(tools);
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
