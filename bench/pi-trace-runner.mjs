import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildReadToolCall,
  buildToolResultMessage,
  createPiAdapter,
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
  return `pi-read-${nextToolCallId}`;
}

export async function runPiTrace(trace, { workspaceRoot } = {}) {
  nextToolCallId = 0;
  const root = workspaceRoot ?? await mkdtemp(join(tmpdir(), "freshctx-pi-trace-"));
  const owned = !workspaceRoot;
  const workspace = await Workspace.fromInitialFiles(root, trace.initialFiles);
  const persistedMessages = [];
  const trackedReads = [];
  const captures = [];
  const adapter = createPiAdapter();
  const ctx = { cwd: root };

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
        await adapter.onToolResult(
          {
            toolName: "read",
            toolCallId,
            input: {
              path: event.path,
              scope: event.scope,
              startLine: event.startLine,
              endLine: event.endLine,
              selector: event.selector,
            },
            content,
            isError: false,
          },
          ctx,
        );
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
        await adapter.onTurnStart({ turnIndex: adapter.turn + 1 });
        const contextResult = await adapter.onContext(
          { messages: structuredClone(captureMessages) },
          ctx,
        );
        const totalMs = performance.now() - started;
        const requestMessages = contextResult?.messages ?? captureMessages;
        const payloadText = messageText(requestMessages);
        const projectionText = contextResult?.projection?.text ?? "";

        const priorPayloadText = captures.at(-1)?.payloadText ?? "";
        const metrics = analyzeCapture({
          baseline: "freshctx-region",
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
          adapterApplied: Boolean(contextResult),
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
      baseline: "pi-adapter",
      captures,
      trackedReads,
    };
  } finally {
    if (owned) await rm(root, { recursive: true, force: true });
  }
}

export function finalPiCapture(result) {
  return result.captures.at(-1) ?? null;
}
