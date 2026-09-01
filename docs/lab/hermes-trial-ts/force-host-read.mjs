import { hostReadToolArgs } from "./pack.mjs";

export const HERMES_READ_TOOLS = new Set(["read", "read_file", "read_text_file"]);
export const BLOCKED_T1_TOOLS = new Set(["bash", "shell", "grep", "find", "edit", "write"]);
export const FORCE_HOST_READ_ENV = "HERMES_TRIAL_FORCE_HOST_READ";

export function forceHostReadEnabled(env = process.env) {
  return env[FORCE_HOST_READ_ENV] === "1";
}

export function applyForceHostReadInput(input) {
  const forced = hostReadToolArgs();
  Object.assign(input, forced);
  delete input.offset;
  delete input.limit;
  delete input.startLine;
  delete input.endLine;
  return input;
}

export function isHermesReadTool(toolName) {
  return HERMES_READ_TOOLS.has(toolName);
}

export function handleForceHostReadToolCall(event, state) {
  if (isHermesReadTool(event.toolName)) {
    const target = event.input && typeof event.input === "object"
      ? event.input
      : event.args && typeof event.args === "object"
        ? event.args
        : null;
    if (target) {
      applyForceHostReadInput(target);
      state.hostReadSatisfied = true;
    }
    return null;
  }

  if (BLOCKED_T1_TOOLS.has(event.toolName)) {
    return {
      block: true,
      reason: "Hermes trial t1-read requires read_file with scope=symbol selector settleDailyLedger",
    };
  }

  return null;
}

export function forcedArgsFromEvent(event) {
  if (event.input && typeof event.input === "object") return event.input;
  if (event.args && typeof event.args === "object") return event.args;
  return {};
}

export function hermesPreToolCallDirective(event, state) {
  const result = handleForceHostReadToolCall(event, state);
  if (result?.block) {
    return { action: "block", message: result.reason };
  }
  if (isHermesReadTool(event.toolName)) {
    return { action: "modify", args: { ...forcedArgsFromEvent(event) } };
  }
  return null;
}

export function registerForceHostReadHermesPlugin(ctx, { env = process.env, record } = {}) {
  const state = { hostReadSatisfied: false };
  ctx.register_hook("pre_tool_call", (toolName, args, taskId, extra = {}) => {
    if (!forceHostReadEnabled(env)) return null;
    const target = args && typeof args === "object" ? args : {};
    const event = {
      toolName,
      args: target,
      input: target,
      toolCallId: extra.tool_call_id ?? extra.toolCallId ?? taskId ?? null,
    };
    const directive = hermesPreToolCallDirective(event, state);
    if (typeof record === "function") {
      record({
        toolCallId: event.toolCallId,
        toolName,
        args: { ...forcedArgsFromEvent(event) },
      });
    }
    return directive;
  });
  return state;
}
