import { defineHostCodec } from "../host-codec.mjs";
import { createPiAdapter, readScopeFromInput } from "./replay.mjs";

export const PI_HOST_COMMIT = "c49906ec77788625aacbdc53ebca6fbe65bd20f5";

export const PI_CODEC_CAPABILITIES = Object.freeze({
  host: "pi",
  hostVersion: PI_HOST_COMMIT,
  adapter: "freshctx-pi-host-codec",
  adapterVersion: "0.1.0",
  canRewriteRequest: true,
});

function nativeToolCalls(message) {
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return [];
  return message.content.filter((part) => part?.type === "toolCall");
}

function nativeToolResult(message) {
  if (message?.role !== "toolResult") return null;
  return message;
}

function textContent(content) {
  if (!Array.isArray(content)) return null;
  const parts = content.filter(
    (part) => part?.type === "text" && typeof part.text === "string",
  );
  if (parts.length !== content.length) return null;
  return parts.map((part) => part.text).join("\n");
}

function pairingRecord(request) {
  if (!request || typeof request !== "object" || !Array.isArray(request.messages)) {
    return null;
  }

  const calls = [];
  const results = [];
  const seenCalls = new Set();
  const seenResults = new Set();

  for (const [messageIndex, message] of request.messages.entries()) {
    for (const call of nativeToolCalls(message)) {
      if (
        typeof call.id !== "string"
        || call.id.length === 0
        || seenCalls.has(call.id)
        || typeof call.name !== "string"
        || call.name.length === 0
        || !call.arguments
        || typeof call.arguments !== "object"
        || Array.isArray(call.arguments)
      ) {
        return null;
      }
      seenCalls.add(call.id);
      calls.push({ id: call.id, name: call.name, messageIndex });
    }

    const result = nativeToolResult(message);
    if (!result) continue;
    if (
      typeof result.toolCallId !== "string"
      || result.toolCallId.length === 0
      || seenResults.has(result.toolCallId)
      || typeof result.toolName !== "string"
      || result.toolName.length === 0
      || typeof result.isError !== "boolean"
      || textContent(result.content) == null
    ) {
      return null;
    }
    seenResults.add(result.toolCallId);
    results.push({
      id: result.toolCallId,
      name: result.toolName,
      messageIndex,
    });
  }

  if (calls.length !== results.length) return null;
  for (const [index, call] of calls.entries()) {
    const result = results[index];
    if (
      result.id !== call.id
      || result.name !== call.name
      || result.messageIndex <= call.messageIndex
    ) {
      return null;
    }
  }

  return {
    calls: calls.map(({ id, name }) => ({ id, name })),
    results: results.map(({ id, name }) => ({ id, name })),
  };
}

export function validatePiNativeRequest(request, capturedRequest = null) {
  const pairing = pairingRecord(request);
  if (!pairing) return false;
  if (capturedRequest == null) return true;
  const capturedPairing = pairingRecord(capturedRequest);
  return capturedPairing != null
    && JSON.stringify(pairing) === JSON.stringify(capturedPairing);
}

export function decodePiReadObservations(request, { turn = 0 } = {}) {
  if (!validatePiNativeRequest(request)) {
    throw new TypeError("Pi request has invalid native tool pairing");
  }

  const calls = new Map();
  for (const message of request.messages) {
    for (const call of nativeToolCalls(message)) calls.set(call.id, call);
  }

  const observations = [];
  for (const message of request.messages) {
    const result = nativeToolResult(message);
    if (!result || result.isError) continue;
    const call = calls.get(result.toolCallId);
    if (!call || call.name !== "read" || result.toolName !== "read") continue;

    const input = call.arguments;
    if (typeof input.path !== "string" || input.path.length === 0) continue;
    const content = textContent(result.content);
    if (content == null) continue;
    const scope = readScopeFromInput(input);
    const observation = {
      observationId: call.id,
      toolCallId: call.id,
      path: input.path,
      scope: scope.scope,
      content,
      turn,
      input: structuredClone(input),
    };
    if (scope.scope === "region") {
      if (Number.isInteger(scope.startLine)) observation.startLine = scope.startLine;
      if (Number.isInteger(scope.endLine)) observation.endLine = scope.endLine;
      if (typeof scope.selector === "string") observation.selector = scope.selector;
    } else if (scope.scope === "symbol" && typeof scope.selector === "string") {
      observation.selector = scope.selector;
    }
    observations.push(observation);
  }
  return observations;
}

function serializePiRequest(request) {
  return Buffer.from(JSON.stringify(request), "utf8");
}

export function createPiHostCodec({
  budgetChars,
  semanticEngineRunner,
} = {}) {
  return defineHostCodec({
    name: "freshctx-pi-host-codec-v1",
    capabilities: PI_CODEC_CAPABILITIES,
    serialize: serializePiRequest,
    capture: (request, context) => {
      const captured = structuredClone(request);
      return {
        request: captured,
        observations: decodePiReadObservations(captured, {
          turn: Number.isInteger(context.turnIndex) ? context.turnIndex : 0,
        }),
      };
    },
    transform: async (request, { captured, context }) => {
      if (captured.observations.length === 0) return structuredClone(request);
      if (typeof context.cwd !== "string" || context.cwd.length === 0) {
        throw new TypeError("Pi codec transform requires context.cwd");
      }

      const adapter = createPiAdapter({
        ...(budgetChars === undefined ? {} : { budgetChars }),
        ...(semanticEngineRunner === undefined ? {} : { semanticEngineRunner }),
      });
      const turnIndex = Number.isInteger(context.turnIndex) ? context.turnIndex : 1;
      await adapter.onTurnStart({ turnIndex });
      for (const observation of captured.observations) {
        await adapter.onToolResult(
          {
            toolName: "read",
            toolCallId: observation.toolCallId,
            input: structuredClone(observation.input),
            content: [{ type: "text", text: observation.content }],
            isError: false,
          },
          { cwd: context.cwd },
        );
      }

      const transformed = await adapter.onContext(
        {
          messages: request.messages,
          budgetChars: context.budgetChars ?? budgetChars,
        },
        { cwd: context.cwd },
      );
      if (!transformed) throw new Error("Pi adapter context transformation failed");
      return {
        ...structuredClone(request),
        messages: transformed.messages,
      };
    },
    validate: (request, { captured }) =>
      validatePiNativeRequest(request, captured.request),
  });
}
