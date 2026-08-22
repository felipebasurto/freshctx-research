import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  buildReadToolCall,
  buildToolResultMessage,
  messageText,
  toProviderPayload,
} from "../adapters/hermes/replay.mjs";
import { analyzeCapture } from "./metrics.mjs";
import { buildGoldMap, requiredUnitsFromCapture, unitKey } from "./oracle.mjs";
import { Workspace } from "./workspace.mjs";
import { sha256, stableUnitId } from "../src/hash.mjs";
import { HERMES_BRIDGE_PATH } from "./hosts-path.mjs";

function parseMutationFamily(name) {
  const parts = String(name).split("/");
  return parts.length >= 2 ? parts[1] : "unknown";
}

function parseRepoId(trace) {
  const url = trace.source?.repository ?? "";
  if (url.includes("flask")) return "flask";
  if (url.includes("express")) return "express";
  return trace.name.split("/")[0] ?? "unknown";
}

let nextToolCallId = 0;
function makeToolCallId() {
  nextToolCallId += 1;
  return `hermes-native-read-${nextToolCallId}`;
}

function invokeHermesNativeBridge(payload) {
  const run = spawnSync("python3", [HERMES_BRIDGE_PATH], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (run.status !== 0) {
    throw new Error(run.stderr?.trim() || "hermes native bridge failed");
  }
  return JSON.parse(run.stdout);
}

/**
 * Hermes native context replay via frozen ContextCompressor checkout.
 * Does not call FreshCtx resolveRegion/registry or adapter bridge paths.
 */
export async function runHermesNativeTrace(trace, { workspaceRoot } = {}) {
  nextToolCallId = 0;
  const root = workspaceRoot ?? await mkdtemp(join(tmpdir(), "freshctx-hermes-native-trace-"));
  const owned = !workspaceRoot;
  const workspace = await Workspace.fromInitialFiles(root, trace.initialFiles);
  const persistedMessages = [];
  const trackedReads = [];
  const captures = [];

  try {
    for (const event of trace.events) {
      if (event.type === "read") {
        const fileContent = await workspace.read(event.path);
        let content = fileContent;
        if (event.scope === "region") {
          const lines = fileContent.split("\n");
          content = lines.slice(event.startLine - 1, event.endLine).join("\n");
        }
        const meta = {
          key: unitKey({
            path: event.path,
            scope: event.scope,
            startLine: event.startLine,
            endLine: event.endLine,
            selector: event.selector,
          }),
          path: event.path,
          scope: event.scope,
          startLine: event.startLine,
          endLine: event.endLine,
          selector: event.selector,
          fileContent,
          unitId: stableUnitId({
            path: event.path,
            scope: event.scope,
            selector: event.selector,
            startLine: event.startLine,
            endLine: event.endLine,
          }),
          initialContent: content,
        };
        trackedReads.push(meta);

        const toolCallId = makeToolCallId();
        persistedMessages.push(
          buildReadToolCall({
            toolCallId,
            path: event.path,
            scope: event.scope,
            startLine: event.startLine,
            endLine: event.endLine,
            selector: event.selector,
          }),
        );
        persistedMessages.push(buildToolResultMessage({ toolCallId, content }));
        continue;
      }

      if (event.type === "replace-exact") {
        await workspace.replaceExact(event.path, event.expected, event.replacement);
        continue;
      }

      if (event.type === "delete-file") {
        await workspace.delete(event.path);
        continue;
      }

      if (event.type === "capture-request") {
        const sessionSnapshot = structuredClone(persistedMessages);
        const captureMessages = [
          ...structuredClone(persistedMessages),
          { role: "user", content: event.task },
        ];
        const incomingMessage = { role: "user", content: event.task };

        const goldBytesByKey = await buildGoldMap(workspace, event.requiredUnits, trackedReads);
        const requiredUnits = requiredUnitsFromCapture(event, goldBytesByKey, trackedReads);
        const started = performance.now();
        const bridgeResult = invokeHermesNativeBridge({
          messages: structuredClone(captureMessages),
          conversationMessages: structuredClone(persistedMessages),
          incomingMessage,
          budgetTokens: Math.ceil((event.budgetChars ?? 12_000) / 4),
          contextLength: Math.max(32_000, Math.ceil((event.budgetChars ?? 12_000) * 8)),
        });
        const totalMs = performance.now() - started;
        const requestMessages = bridgeResult.messages ?? captureMessages;
        const payloadText = bridgeResult.payloadText ?? messageText(requestMessages);
        const projectionText = bridgeResult.projectionText ?? "";
        const baseline = bridgeResult.baseline ?? "hermes-native";

        const priorPayloadText = captures.at(-1)?.payloadText ?? "";
        const metrics = analyzeCapture({
          baseline,
          payloadText,
          payloadBytes: Buffer.byteLength(payloadText, "utf8"),
          projectionText,
          trackedReads,
          requiredUnits,
          goldBytesByKey,
          priorPayloadText,
          telemetry: { totalMs, projectionBytes: Buffer.byteLength(projectionText, "utf8") },
        });

        captures.push({
          event,
          requiredUnits,
          persistedMessages: sessionSnapshot,
          requestMessages,
          payload: toProviderPayload(requestMessages),
          payloadText,
          payloadSha256: sha256(payloadText),
          nativeApplied: Boolean(bridgeResult.nativeApplied),
          nativeMode: bridgeResult.mode ?? "native-no-op",
          baselineLabel: baseline,
          metrics,
          telemetry: { totalMs },
        });

        persistedMessages.push({ role: "user", content: event.task });
      }
    }

    return {
      traceName: trace.name,
      repo: parseRepoId(trace),
      mutationFamily: parseMutationFamily(trace.name),
      baseline: captures.at(-1)?.baselineLabel ?? "hermes-native",
      captures,
      trackedReads,
    };
  } finally {
    if (owned) await rm(root, { recursive: true, force: true });
  }
}

export function finalHermesNativeCapture(result) {
  return result.captures.at(-1) ?? null;
}
