import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { messageText, observeTurn, selectContext, toProviderPayload } from "./bridge.mjs";
import { DEFAULT_BUDGET_CHARS, resolveAdapterBudgetChars } from "../request-prune.mjs";

export { DEFAULT_BUDGET_CHARS };

export { messageText, toProviderPayload } from "./bridge.mjs";

export async function createHermesStateFile(prefix = "freshctx-hermes-state-") {
  return join(await mkdtemp(join(tmpdir(), prefix)), "session.json");
}

/**
 * Pure-Node replay of adapters/hermes/__init__.py + bridge.mjs.
 *
 * Hermes `select_context()` is request-only: persisted conversation messages
 * stay as Hermes recorded them; only the returned copy goes to the provider.
 */
export function createHermesAdapter({ stateFile, budgetChars = DEFAULT_BUDGET_CHARS } = {}) {
  if (!stateFile) throw new Error("Hermes adapter requires a stateFile path");

  return {
    stateFile,

    async onTurnComplete(messages, ctx) {
      return observeTurn({
        stateFile,
        messages,
        cwd: ctx.cwd,
      });
    },

    async onSelectContext(
      messages,
      ctx,
      { budgetTokens = 0, budgetChars: eventBudgetChars, incomingMessage, conversationMessages } = {},
    ) {
      const budget = resolveAdapterBudgetChars({
        budgetChars: eventBudgetChars,
        budgetTokens,
        defaultBudget: budgetChars,
      });
      return selectContext({
        stateFile,
        messages,
        cwd: ctx.cwd,
        budgetTokens,
        budgetChars: budget,
        incomingMessage,
        conversationMessages,
      });
    },
  };
}

export function buildReadToolCall({
  toolCallId,
  path,
  toolName = "read_file",
  scope,
  startLine,
  endLine,
  selector,
  offset,
  limit,
}) {
  const args = { path };
  if (scope === "region") {
    args.scope = "region";
    if (startLine != null) args.startLine = startLine;
    if (endLine != null) args.endLine = endLine;
    if (selector != null) args.selector = selector;
  } else if (offset != null && limit != null) {
    args.offset = offset;
    args.limit = limit;
  }
  return {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: toolCallId,
        type: "function",
        function: {
          name: toolName,
          arguments: JSON.stringify(args),
        },
      },
    ],
  };
}

export function buildToolResultMessage({ toolCallId, content }) {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: typeof content === "string" ? content : [{ type: "text", text: content }],
  };
}

export async function captureProviderRequest({
  cwd,
  persistedMessages,
  stateFile,
  budgetChars,
  budgetTokens = 0,
  incomingMessage,
}) {
  const adapter = createHermesAdapter({ stateFile, budgetChars });
  const ctx = { cwd };

  await adapter.onTurnComplete(structuredClone(persistedMessages), ctx);
  const selectResult = await adapter.onSelectContext(structuredClone(persistedMessages), ctx, {
    budgetTokens,
    incomingMessage,
  });
  const requestMessages = selectResult?.messages ?? persistedMessages;
  const payload = toProviderPayload(requestMessages);

  return {
    persistedMessages,
    requestMessages,
    payload,
    payloadText: messageText(requestMessages),
    projectionText: selectResult?.projectionText ?? "",
    telemetry: selectResult?.telemetry ?? { totalMs: 0, projectionBytes: 0 },
    adapterApplied: Boolean(selectResult?.applied),
  };
}
