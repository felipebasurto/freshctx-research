import { defineHostCodec } from "./host-codec.mjs";

function toolCalls(message) {
  if (message?.role !== "assistant" || !Array.isArray(message.tool_calls)) return [];
  return message.tool_calls;
}

function toolResultId(message) {
  if (message?.role !== "tool") return null;
  return typeof message.tool_call_id === "string" ? message.tool_call_id : null;
}

function textContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function toolArguments(call) {
  const raw = call?.function?.arguments ?? {};
  if (typeof raw !== "string") return raw && typeof raw === "object" ? raw : {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function captureReadObservations(request) {
  const reads = new Map();
  for (const message of request.messages) {
    for (const call of toolCalls(message)) {
      if (call?.function?.name !== "read" || typeof call.id !== "string") continue;
      const args = toolArguments(call);
      if (typeof args.path !== "string" || args.path.length === 0) continue;
      reads.set(call.id, args);
    }
  }

  const observations = [];
  for (const message of request.messages) {
    const callId = toolResultId(message);
    const args = callId ? reads.get(callId) : null;
    if (!args || message.is_error === true || message.isError === true) continue;
    const observation = {
      toolCallId: callId,
      path: args.path,
      scope: args.scope === "region" || args.scope === "symbol" ? args.scope : "file",
      content: textContent(message.content),
    };
    if (observation.scope === "symbol" && typeof args.selector === "string") {
      observation.selector = args.selector;
    }
    if (observation.scope === "region") {
      if (Number.isInteger(args.startLine)) observation.startLine = args.startLine;
      if (Number.isInteger(args.endLine)) observation.endLine = args.endLine;
    }
    observations.push(observation);
  }
  return observations;
}

function pairingOrder(request) {
  const calls = [];
  const results = [];
  for (const message of request.messages) {
    for (const call of toolCalls(message)) calls.push(call.id);
    const resultId = toolResultId(message);
    if (resultId) results.push(resultId);
  }
  return { calls, results };
}

export function validateTestHostPairing(request, capturedRequest = null) {
  if (!request || !Array.isArray(request.messages)) return false;
  const calls = new Map();
  const results = new Map();

  for (const [messageIndex, message] of request.messages.entries()) {
    for (const call of toolCalls(message)) {
      if (typeof call?.id !== "string" || calls.has(call.id)) return false;
      calls.set(call.id, messageIndex);
    }
    if (message?.role === "tool" && toolResultId(message) == null) return false;
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
  if (capturedRequest != null) {
    if (!capturedRequest || !Array.isArray(capturedRequest.messages)) return false;
    if (JSON.stringify(pairingOrder(request)) !== JSON.stringify(pairingOrder(capturedRequest))) {
      return false;
    }
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
    capabilities: {
      host: "freshctx-test-host",
      hostVersion: "1.0",
      adapter: "host-codec-test-double",
      adapterVersion: "1.0",
      canRewriteRequest: true,
    },
    serialize: (request) => Buffer.from(JSON.stringify(request), "utf8"),
    capture: (request) => {
      if (failAt === "capture") throw new Error("forced capture failure");
      const captured = structuredClone(request);
      captures.push(captured);
      return {
        request: captured,
        observations: captureReadObservations(captured),
      };
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
      const corruptedMessages = corruptPairing === "drop-all"
        ? messages
          .filter((message) => message.role !== "tool")
          .map((message) => (
            Array.isArray(message.tool_calls)
              ? { ...message, tool_calls: [] }
              : message
          ))
        : messages.filter((message) => (
          corruptPairing === "drop-result" || corruptPairing === true
            ? toolResultId(message) == null
            : true
        ));
      return {
        ...structuredClone(request),
        messages: corruptedMessages,
      };
    },
    validate: (request, { captured }) => {
      if (failAt === "validate") throw new Error("forced validation failure");
      return validateTestHostPairing(request, captured.request);
    },
  });

  return { codec, captures };
}
