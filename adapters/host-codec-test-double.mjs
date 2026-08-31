import { defineHostCodec } from "./host-codec.mjs";

function toolCalls(message) {
  if (message?.role !== "assistant" || !Array.isArray(message.tool_calls)) return [];
  return message.tool_calls;
}

function toolResultId(message) {
  if (message?.role !== "tool") return null;
  return typeof message.tool_call_id === "string" ? message.tool_call_id : null;
}

export function validateTestHostPairing(request) {
  if (!request || !Array.isArray(request.messages)) return false;
  const calls = new Map();
  const results = new Map();

  for (const [messageIndex, message] of request.messages.entries()) {
    for (const call of toolCalls(message)) {
      if (typeof call?.id !== "string" || calls.has(call.id)) return false;
      calls.set(call.id, messageIndex);
    }
    const resultId = toolResultId(message);
    if (!resultId) continue;
    if (results.has(resultId)) return false;
    results.set(resultId, messageIndex);
  }

  if (calls.size !== results.size) return false;
  for (const [callId, callIndex] of calls.entries()) {
    const resultIndex = results.get(callId);
    if (!Number.isInteger(resultIndex) || resultIndex <= callIndex) return false;
  }
  return true;
}

function replaceToolResultContent(message, content) {
  if (Array.isArray(message.content)) {
    return {
      ...structuredClone(message),
      content: [{ type: "text", text: content }],
    };
  }
  return { ...structuredClone(message), content };
}

export function createHostCodecTestDouble({
  failAt = null,
  corruptPairing = false,
} = {}) {
  const captures = [];
  const codec = defineHostCodec({
    name: "freshctx-test-host-v1",
    serialize: (request) => Buffer.from(JSON.stringify(request), "utf8"),
    capture: (request) => {
      if (failAt === "capture") throw new Error("forced capture failure");
      const captured = structuredClone(request);
      captures.push(captured);
      return captured;
    },
    transform: (request, { context }) => {
      if (failAt === "transform") throw new Error("forced transform failure");
      const replacements = context.replacementByCallId instanceof Map
        ? context.replacementByCallId
        : new Map(Object.entries(context.replacementByCallId ?? {}));
      const messages = request.messages.map((message) => {
        const resultId = toolResultId(message);
        if (!resultId || !replacements.has(resultId)) return structuredClone(message);
        return replaceToolResultContent(message, String(replacements.get(resultId)));
      });
      return {
        ...structuredClone(request),
        messages: corruptPairing
          ? messages.filter((message) => toolResultId(message) == null)
          : messages,
      };
    },
    validate: (request) => {
      if (failAt === "validate") throw new Error("forced validation failure");
      return validateTestHostPairing(request);
    },
  });

  return { codec, captures };
}
