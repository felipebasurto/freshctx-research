import { hostReadToolArgs } from "./pack.mjs";
import {
  BLOCKED_T1_TOOLS,
  FORCE_HOST_READ_ENV,
  applyForceHostReadInput,
  isHermesReadTool,
} from "./force-host-read.mjs";

export { FORCE_HOST_READ_ENV };

export function envWithForceHostRead(baseEnv = {}) {
  return { ...baseEnv, [FORCE_HOST_READ_ENV]: "1" };
}

export function readToolMatchesHostArgs(tool) {
  if (!tool || !isHermesReadTool(tool.toolName)) return false;
  const args = tool.args ?? tool.input ?? {};
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
    if (BLOCKED_T1_TOOLS.has(tool.toolName)) {
      return `t1-read leftover ${tool.toolName} tool is invalid`;
    }
    if (!isHermesReadTool(tool.toolName)) {
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

export function applyForceHostReadToTools(tools) {
  return tools.map((tool) => {
    if (!isHermesReadTool(tool.toolName)) return tool;
    const args = { ...(tool.args ?? tool.input ?? {}) };
    applyForceHostReadInput(args);
    return { ...tool, args };
  });
}
