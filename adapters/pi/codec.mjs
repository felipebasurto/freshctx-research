import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { defineHostCodec } from "../host-codec.mjs";
import { createPiAdapter, readScopeFromInput } from "./replay.mjs";

export const PI_HOST_COMMIT = "c49906ec77788625aacbdc53ebca6fbe65bd20f5";

const MAX_TRACKED_FILE_BYTES = 512 * 1024;

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

function validNativeContent(content) {
  if (!Array.isArray(content)) return false;
  return content.every((part) => (
    part?.type === "text"
      ? typeof part.text === "string"
      : part?.type === "image"
        && typeof part.data === "string"
        && typeof part.mimeType === "string"
  ));
}

function pairingRecord(request) {
  if (!request || typeof request !== "object" || !Array.isArray(request.messages)) {
    return null;
  }

  const events = [];
  const seenCalls = new Set();
  const seenResults = new Set();
  let pendingCalls = [];
  let pendingResultIndex = 0;

  for (const [messageIndex, message] of request.messages.entries()) {
    const calls = nativeToolCalls(message);
    const result = nativeToolResult(message);

    if (result) {
      if (pendingCalls.length === 0) return null;
      const expectedCall = pendingCalls[pendingResultIndex];
      if (
        typeof result.toolCallId !== "string"
        || result.toolCallId.length === 0
        || seenResults.has(result.toolCallId)
        || typeof result.toolName !== "string"
        || result.toolName.length === 0
        || typeof result.isError !== "boolean"
        || !validNativeContent(result.content)
        || result.toolCallId !== expectedCall.id
        || result.toolName !== expectedCall.name
        || messageIndex <= expectedCall.messageIndex
      ) {
        return null;
      }
      seenResults.add(result.toolCallId);
      events.push({ kind: "result", id: result.toolCallId, name: result.toolName });
      pendingResultIndex += 1;
      if (pendingResultIndex === pendingCalls.length) {
        pendingCalls = [];
        pendingResultIndex = 0;
      }
      continue;
    }

    if (pendingCalls.length > 0) return null;
    for (const call of calls) {
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
      pendingCalls.push({ id: call.id, name: call.name, messageIndex });
      events.push({ kind: "call", id: call.id, name: call.name });
    }
  }

  if (pendingCalls.length > 0 || seenCalls.size !== seenResults.size) return null;
  return events;
}

function isPairingSubsequence(candidate, captured) {
  let capturedIndex = 0;
  for (const event of candidate) {
    while (
      capturedIndex < captured.length
      && (
        captured[capturedIndex].kind !== event.kind
        || captured[capturedIndex].id !== event.id
        || captured[capturedIndex].name !== event.name
      )
    ) {
      capturedIndex += 1;
    }
    if (capturedIndex === captured.length) return false;
    capturedIndex += 1;
  }
  return true;
}

export function validatePiNativeRequest(request, capturedRequest = null) {
  const pairing = pairingRecord(request);
  if (!pairing) return false;
  if (capturedRequest == null) return true;
  const capturedPairing = pairingRecord(capturedRequest);
  return capturedPairing != null
    && isPairingSubsequence(pairing, capturedPairing);
}

export function decodePiReadObservations(request, { turn } = {}) {
  if (!validatePiNativeRequest(request)) {
    throw new TypeError("Pi request has invalid native tool pairing");
  }

  const calls = new Map();
  let inferredTurn = 0;
  for (const message of request.messages) {
    if (message?.role === "user") inferredTurn += 1;
    for (const call of nativeToolCalls(message)) {
      calls.set(call.id, { call, turn: Number.isInteger(turn) ? turn : inferredTurn });
    }
  }

  const observations = [];
  for (const message of request.messages) {
    const result = nativeToolResult(message);
    if (!result || result.isError) continue;
    const callRecord = calls.get(result.toolCallId);
    const call = callRecord?.call;
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
      turn: callRecord.turn,
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

function pathWithinRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

async function normalizeObservationPath(rootInput, requestedPath) {
  const root = await realpath(rootInput);
  const candidate = resolve(
    root,
    isAbsolute(requestedPath) ? relative(root, requestedPath) : requestedPath,
  );
  if (!pathWithinRoot(root, candidate)) {
    throw new Error("FreshCtx refused an observation outside the active workspace");
  }

  let canonical = candidate;
  try {
    canonical = await realpath(candidate);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (!pathWithinRoot(root, canonical)) {
    throw new Error("FreshCtx refused an observation outside the active workspace");
  }
  return relative(root, canonical).split(sep).join("/");
}

function lineCount(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n").length;
}

async function seedReadObservation(adapter, observation, cwd) {
  if (
    Buffer.byteLength(observation.content, "utf8") > MAX_TRACKED_FILE_BYTES
    || observation.content.includes("\0")
  ) {
    throw new Error("FreshCtx refused unsafe observation content");
  }

  const path = await normalizeObservationPath(cwd, observation.path);
  const tracked = {
    path,
    content: observation.content,
    scope: observation.scope,
    turn: observation.turn,
  };
  if (observation.scope === "region") {
    if (Number.isInteger(observation.startLine)) tracked.startLine = observation.startLine;
    if (Number.isInteger(observation.endLine)) tracked.endLine = observation.endLine;
    if (typeof observation.selector === "string") tracked.selector = observation.selector;
  } else if (observation.scope === "symbol") {
    tracked.startLine = 1;
    tracked.endLine = lineCount(observation.content);
    tracked.selector = observation.selector;
  }

  const unit = adapter.engine.trackRead(tracked);
  adapter.callToUnit.set(observation.toolCallId, unit.id);
  adapter.callMeta.set(observation.toolCallId, {
    path,
    scope: observation.scope,
    ...(Number.isInteger(observation.startLine)
      ? { startLine: observation.startLine }
      : {}),
    ...(Number.isInteger(observation.endLine)
      ? { endLine: observation.endLine }
      : {}),
    ...(typeof observation.selector === "string"
      ? { selector: observation.selector }
      : {}),
  });
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
        observations: decodePiReadObservations(captured),
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
        try {
          await seedReadObservation(adapter, observation, context.cwd);
        } catch {
          // Unsupported observations remain ordinary Pi results.
        }
      }
      if (adapter.engine.registry.list().length === 0) return structuredClone(request);

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
