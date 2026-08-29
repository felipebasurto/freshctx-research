import { hostReadToolArgs } from "./pack.mjs";

export const BLOCKED_T1_TOOLS = new Set(["bash", "shell", "grep", "find", "edit", "write"]);

export function applyForceHostReadInput(input) {
  const forced = hostReadToolArgs();
  Object.assign(input, forced);
  delete input.offset;
  delete input.limit;
  return input;
}

export function handleForceHostReadToolCall(event, state) {
  if (state.hostReadSatisfied && event.toolName === "read") return null;

  if (event.toolName === "read") {
    applyForceHostReadInput(event.input);
    state.hostReadSatisfied = true;
    return null;
  }

  if (BLOCKED_T1_TOOLS.has(event.toolName)) {
    return {
      block: true,
      reason: "Pi trial t1-read requires read with scope=symbol selector settleDailyLedger",
    };
  }

  return null;
}

export function registerForceHostReadExtension(pi) {
  if (process.env.PI_TRIAL_FORCE_HOST_READ !== "1") return;

  const state = { hostReadSatisfied: false };

  pi.on("session_start", () => {
    pi.setActiveTools(["read"]);
  });

  pi.on("tool_call", (event) => handleForceHostReadToolCall(event, state));
}
