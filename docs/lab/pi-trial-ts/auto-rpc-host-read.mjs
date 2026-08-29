import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { hostReadToolArgs } from "./pack.mjs";

const packDir = fileURLToPath(new URL(".", import.meta.url));

export const FORCE_HOST_READ_ENV = "PI_TRIAL_FORCE_HOST_READ";

export function forceHostReadExtensionPath() {
  return join(packDir, "force-host-read.ts");
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

export function t1HostReadToolsValid(tools) {
  const reads = tools.filter((tool) => tool.toolName === "read");
  if (reads.length === 0) return false;
  return reads.some((tool) => readToolMatchesHostArgs(tool));
}

export function rejectNonHostT1Tools(tools) {
  for (const tool of tools) {
    if (tool.toolName === "bash" || tool.toolName === "shell" || tool.toolName === "grep") {
      return true;
    }
    if (tool.toolName === "read" && !readToolMatchesHostArgs(tool)) {
      return true;
    }
  }
  return false;
}

export function piArgsForArm({ arm, repoRoot, dumpExt, freshCtxExtension, forceHostRead = true }) {
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
