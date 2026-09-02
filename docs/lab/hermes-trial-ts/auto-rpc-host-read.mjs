import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FRESHCTX_CWD_ENV,
  HERMES_TRIAL_WORKSPACE_ENV,
  hostReadToolArgs,
  isDestRootSettlementSearch,
  isWorkFixtureSettlementPath,
  wrongTreeHostReadReason,
} from "./pack.mjs";
import {
  BLOCKED_T1_TOOLS,
  FORCE_HOST_READ_ENV,
  applyForceHostReadInput,
  isHermesReadTool,
} from "./force-host-read.mjs";
import { isProviderDumpName } from "./proxy.mjs";

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

export function t1ToolsForAssert({
  eventTools = [],
  recordedTools = [],
  cliTools = [],
  dumpTools = [],
} = {}) {
  if (recordedTools.length > 0) return recordedTools;
  if (eventTools.length > 0) return eventTools;
  if (dumpTools.length > 0) return dumpTools;
  return cliTools;
}

const CLI_TOOL_LINE = /^(?:\[tool\]|●)\s+([A-Za-z_][A-Za-z0-9_]*)\b/u;

function argsFromCliToolLine(line) {
  const rest = String(line ?? "")
    .replace(/^(?:\[tool\]|●)\s+[A-Za-z_][A-Za-z0-9_]*\s*/u, "")
    .trim();
  if (!rest) return {};
  if (rest.startsWith("{")) {
    try {
      const parsed = JSON.parse(rest);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { raw: rest };
    } catch {
      return { raw: rest };
    }
  }
  return { raw: rest };
}

/**
 * Hermes CLI `-q` oneshot (non-quiet) prints `[tool] name` spinner lines.
 * Measured on NousResearch/hermes-agent quiet-mode leak (`[tool]` / `[done]`).
 * Dest leftover used `hermes chat -q` without `-Q`.
 */
export function toolsFromHermesCliStdout(stdout) {
  const tools = [];
  for (const line of String(stdout ?? "").split("\n")) {
    const trimmed = line.replace(/\r$/u, "").trim();
    const match = trimmed.match(CLI_TOOL_LINE);
    if (!match) continue;
    const toolName = match[1];
    if (toolName === "done") continue;
    tools.push({
      toolCallId: null,
      toolName,
      args: argsFromCliToolLine(trimmed),
    });
  }
  return tools;
}

function parseDumpBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body !== "string" || body.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function argsFromFunctionCall(item) {
  const raw = item?.arguments ?? item?.args ?? item?.input ?? {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { raw };
  } catch {
    return { raw };
  }
}

/**
 * Executed Responses `input` function_call items.
 * The request `tools` array is the advertised schema, not a host-read list.
 */
export function toolsFromResponsesFunctionCalls(body) {
  const parsed = parseDumpBody(body);
  if (!parsed) return [];
  const input = Array.isArray(parsed.input) ? parsed.input : [];
  const tools = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    if (item.type !== "function_call") continue;
    const toolName = item.name ?? item.toolName ?? null;
    if (!toolName) continue;
    tools.push({
      toolCallId: item.call_id ?? item.id ?? null,
      toolName,
      args: argsFromFunctionCall(item),
    });
  }
  return tools;
}

export async function readDumpFunctionCallTools(dumpDir, names) {
  let files = names;
  if (!files) {
    try {
      files = (await readdir(dumpDir))
        .filter(isProviderDumpName)
        .sort();
    } catch {
      return [];
    }
  }
  const tools = [];
  for (const name of files) {
    const file = String(name).endsWith(".scan.json")
      ? String(name).replace(/\.scan\.json$/u, ".json")
      : name;
    if (!isProviderDumpName(file)) continue;
    try {
      const text = await readFile(join(dumpDir, file), "utf8");
      tools.push(...toolsFromResponsesFunctionCalls(text));
    } catch {
      // dump body absent
    }
  }
  return tools;
}

export function readToolMatchesHostArgs(tool, { workspace } = {}) {
  if (!tool || !isHermesReadTool(tool.toolName)) return false;
  const args = tool.args ?? tool.input ?? {};
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
    const wrongTree = wrongTreeHostReadReason(tool, { workspace, destRoot });
    if (wrongTree) return wrongTree;
    if (BLOCKED_T1_TOOLS.has(tool.toolName)) {
      return `t1-read leftover ${tool.toolName} tool is invalid`;
    }
    if (!isHermesReadTool(tool.toolName)) {
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

export function applyForceHostReadToTools(tools) {
  return tools.map((tool) => {
    if (!isHermesReadTool(tool.toolName)) return tool;
    const args = { ...(tool.args ?? tool.input ?? {}) };
    applyForceHostReadInput(args);
    return { ...tool, args };
  });
}
