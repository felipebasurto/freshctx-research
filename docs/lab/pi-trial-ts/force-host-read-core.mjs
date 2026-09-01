import { hostReadToolArgs, isDestRootSettlementSearch, resolveHostReadWorkspace } from "./pack.mjs";

export const BLOCKED_T1_TOOLS = new Set(["bash", "shell", "grep", "find", "edit", "write"]);

export function forceHostReadEnabled() {
  return process.env.PI_TRIAL_FORCE_HOST_READ === "1";
}

export function applyForceHostReadInput(input) {
  const forced = hostReadToolArgs();
  Object.assign(input, forced);
  delete input.offset;
  delete input.limit;
  return input;
}

export function handleForceHostReadToolCall(event, state) {
  if (event.toolName === "read") {
    if (event.input && typeof event.input === "object") {
      applyForceHostReadInput(event.input);
      state.hostReadSatisfied = true;
    }
    return null;
  }

  if (BLOCKED_T1_TOOLS.has(event.toolName)) {
    return {
      block: true,
      reason: "Pi trial t1-read requires read with scope=symbol selector settleDailyLedger",
    };
  }

  const workspace = resolveHostReadWorkspace();
  if (isDestRootSettlementSearch(event, { workspace })) {
    return {
      block: true,
      reason: "Pi trial dest-root search_files of src/settlement.ts is fail-closed; fixture is .work",
    };
  }

  return null;
}

export function handleForceHostReadExecutionStart(event, state) {
  if (event.toolName === "read") {
    if (event.args && typeof event.args === "object") {
      applyForceHostReadInput(event.args);
      state.hostReadSatisfied = true;
    }
    return null;
  }

  if (BLOCKED_T1_TOOLS.has(event.toolName)) {
    return {
      block: true,
      reason: "Pi trial t1-read requires read with scope=symbol selector settleDailyLedger",
    };
  }

  const workspace = resolveHostReadWorkspace();
  if (isDestRootSettlementSearch(event, { workspace })) {
    return {
      block: true,
      reason: "Pi trial dest-root search_files of src/settlement.ts is fail-closed; fixture is .work",
    };
  }

  return null;
}

export function registerForceHostReadExtension(pi) {
  const state = { hostReadSatisfied: false };

  pi.on("session_start", () => {
    if (!forceHostReadEnabled()) return;
    pi.setActiveTools(["read"]);
  });

  pi.on("tool_execution_start", (event) => {
    if (!forceHostReadEnabled()) return;
    return handleForceHostReadExecutionStart(event, state);
  });

  pi.on("tool_call", (event) => {
    if (!forceHostReadEnabled()) return;
    return handleForceHostReadToolCall(event, state);
  });
}
