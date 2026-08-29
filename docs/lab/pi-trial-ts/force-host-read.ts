import { hostReadToolArgs } from "./pack.mjs";

const BLOCKED_T1_TOOLS = new Set(["bash", "shell", "grep", "find", "edit", "write"]);

export default function forceHostReadExtension(pi) {
  if (process.env.PI_TRIAL_FORCE_HOST_READ !== "1") return;

  let hostReadSatisfied = false;

  pi.on("session_start", () => {
    pi.setActiveTools(["read"]);
  });

  pi.on("tool_call", (event) => {
    if (hostReadSatisfied && event.toolName === "read") return;

    if (event.toolName === "read") {
      const forced = hostReadToolArgs();
      Object.assign(event.input, forced);
      delete event.input.offset;
      delete event.input.limit;
      hostReadSatisfied = true;
      return;
    }

    if (BLOCKED_T1_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: "Pi trial t1-read requires read with scope=symbol selector settleDailyLedger",
      };
    }
  });
}
