import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildReadToolCall,
  buildToolResultMessage,
  messageText,
  toProviderPayload,
} from "../adapters/pi/replay.mjs";
import { analyzeCapture } from "./metrics.mjs";
import { buildGoldMap, requiredUnitsFromCapture, unitKey } from "./oracle.mjs";
import { Workspace } from "./workspace.mjs";
import { sha256, stableUnitId } from "../src/hash.mjs";

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
  return `pi-native-read-${nextToolCallId}`;
}

/**
 * Pi native context replay: default request assembly without FreshCtx extension.
 *
 * Mirrors packages/coding-agent public `context` event semantics with zero
 * handlers registered — persisted tool results are sent verbatim to the provider.
 */
export async function runPiNativeTrace(trace, { workspaceRoot } = {}) {
  nextToolCallId = 0;
  const root = workspaceRoot ?? await mkdtemp(join(tmpdir(), "freshctx-pi-native-trace-"));
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

        const goldBytesByKey = await buildGoldMap(workspace, event.requiredUnits, trackedReads);
        const requiredUnits = requiredUnitsFromCapture(event, goldBytesByKey, trackedReads);
        const started = performance.now();
        const requestMessages = captureMessages;
        const payloadText = messageText(requestMessages);
        const projectionText = "";
        const totalMs = performance.now() - started;

        const priorPayloadText = captures.at(-1)?.payloadText ?? "";
        const metrics = analyzeCapture({
          baseline: "pi-native",
          payloadText,
          payloadBytes: Buffer.byteLength(payloadText, "utf8"),
          projectionText,
          trackedReads,
          requiredUnits,
          goldBytesByKey,
          priorPayloadText,
          telemetry: { totalMs, projectionBytes: 0 },
        });

        captures.push({
          event,
          requiredUnits,
          persistedMessages: sessionSnapshot,
          requestMessages,
          payload: toProviderPayload(requestMessages),
          payloadText,
          payloadSha256: sha256(payloadText),
          nativeApplied: false,
          nativeMode: "native-no-op",
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
      baseline: "pi-native",
      captures,
      trackedReads,
    };
  } finally {
    if (owned) await rm(root, { recursive: true, force: true });
  }
}

export function finalPiNativeCapture(result) {
  return result.captures.at(-1) ?? null;
}
