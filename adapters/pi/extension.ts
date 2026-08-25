import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { FreshCtxEngine, stableReadMarker } from "../../src/index.mjs";
import {
  dropUnservedReadToolPairs,
  resolveAdapterBudgetChars,
  servedReadCallIdsFromProjection,
} from "../request-prune.mjs";
import { trackedReadTools, tryTrackShellRead } from "../shell-read.mjs";
import { DEFAULT_BUDGET_CHARS, readScopeFromInput } from "./replay.mjs";

const PI_READ_TOOLS = trackedReadTools(new Set(["read"]));

const MAX_TRACKED_FILE_BYTES = 512 * 1024;

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: string }).type === "text"),
    )
    .map((part) => part.text)
    .join("\n");
}

function lastUserTask(messages: readonly unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: string; content?: unknown };
    if (message?.role === "user") return textFromContent(message.content);
  }
  return "";
}

async function safeWorkspaceFile(rootInput: string, requestedPath: string) {
  const root = await realpath(rootInput);
  const candidate = resolve(root, isAbsolute(requestedPath) ? relative(root, requestedPath) : requestedPath);
  const canonical = await realpath(candidate);
  if (canonical !== root && !canonical.startsWith(`${root}${sep}`)) {
    throw new Error("FreshCtx refused a path outside the active workspace");
  }

  const bytes = await readFile(canonical);
  if (bytes.length > MAX_TRACKED_FILE_BYTES) {
    throw new Error(`FreshCtx file limit exceeded (${MAX_TRACKED_FILE_BYTES} bytes)`);
  }
  if (bytes.includes(0)) throw new Error("FreshCtx skipped a binary file");

  return {
    content: bytes.toString("utf8").replaceAll("\r\n", "\n"),
    path: relative(root, canonical).split(sep).join("/"),
  };
}

function replaceCapturedReads(
  messages: readonly unknown[],
  callToUnit: Map<string, string>,
  engine: FreshCtxEngine,
) {
  return messages.map((raw) => {
    const message = raw as {
      content?: unknown;
      toolCallId?: string;
      tool_call_id?: string;
    };
    const callId = message.toolCallId ?? message.tool_call_id;
    const unitId = callId ? callToUnit.get(callId) : undefined;
    const unit = unitId ? engine.registry.get(unitId) : undefined;
    if (!unit) return structuredClone(raw);

    const marker = stableReadMarker(unit);
    return {
      ...structuredClone(message),
      content: Array.isArray(message.content)
        ? [{ type: "text", text: marker }]
        : marker,
    };
  });
}

/**
 * Pi reference adapter.
 *
 * It is deliberately request-only: persisted tool results remain untouched.
 * If this extension fails, returning undefined makes Pi use its original
 * context. This adapter synchronizes whole text files or region-scoped reads
 * when the read tool arguments include `scope: "region"` plus line metadata,
 * or finite `offset`/`limit` pagination mapped to line ranges with the same
 * EOF promotion rule as Hermes; the core and benchmark already exercise finer
 * region synchronization.
 */
export default function freshCtxExtension(pi: ExtensionAPI) {
  const engine = new FreshCtxEngine();
  const callToUnit = new Map<string, string>();

  pi.on("turn_start", async (event) => {
    engine.turn = event.turnIndex;
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.isError) return;

    if (event.toolName === "bash" || event.toolName === "shell") {
      await tryTrackShellRead({
        toolName: event.toolName,
        input: event.input,
        content: event.content,
        isError: event.isError,
        cwd: ctx.cwd,
        engine,
        callToUnit,
        toolCallId: event.toolCallId,
        safeWorkspaceFile,
        observedToolContent: textFromContent,
        lineCount: (content) => content.split("\n").length,
      });
      return;
    }

    if (event.toolName !== "read") return;
    const requestedPath = event.input.path;
    if (typeof requestedPath !== "string") return;

    try {
      const file = await safeWorkspaceFile(ctx.cwd, requestedPath);
      const input = event.input as {
        path: string;
        scope?: string;
        startLine?: number;
        endLine?: number;
        selector?: string;
        offset?: number;
        limit?: number;
      };
      const observedFileLineCount = file.content.split("\n").length;
      const scopeMeta = readScopeFromInput(input, observedFileLineCount);
      if (scopeMeta.scope === "region") {
        const content = textFromContent(event.content);
        if (!content) return;
        const unit = engine.trackRead({
          path: file.path,
          content,
          scope: "region",
          startLine: scopeMeta.startLine,
          endLine: scopeMeta.endLine,
          selector: scopeMeta.selector,
          observedFileLineCount,
        });
        callToUnit.set(event.toolCallId, unit.id);
        return;
      }

      const unit = engine.trackRead({
        path: file.path,
        content: file.content,
        scope: "file",
      });
      callToUnit.set(event.toolCallId, unit.id);
    } catch {
      // Unsupported, binary, oversized, missing, or out-of-root reads remain
      // ordinary Pi results. FreshCtx never masks a result it cannot refresh.
    }
  });

  pi.on("context", async (event, ctx) => {
    if (engine.registry.list().length === 0) return;

    try {
      await engine.refresh(async (filePath) =>
        (await safeWorkspaceFile(ctx.cwd, filePath)).content,
      );
      const budgetChars = resolveAdapterBudgetChars({
        budgetChars: (event as { budgetChars?: number }).budgetChars,
        budgetTokens: (event as { budgetTokens?: number }).budgetTokens,
        defaultBudget: DEFAULT_BUDGET_CHARS,
      });
      const projection = engine.project({
        task: lastUserTask(event.messages),
        budgetChars,
      });
      const rewritten = replaceCapturedReads(event.messages, callToUnit, engine);
      const servedCallIds = servedReadCallIdsFromProjection(callToUnit, projection);
      const assembled = dropUnservedReadToolPairs(rewritten, {
        readTools: PI_READ_TOOLS,
        servedCallIds,
        observedCallIds: new Set(callToUnit.keys()),
        trackedPaths: engine.registry.list().map((unit) => unit.path),
      });
      const timestamp = (event.messages.at(-1) as { timestamp?: number } | undefined)?.timestamp ?? 0;

      return {
        messages: [
          ...assembled,
          {
            role: "user",
            content: [{ type: "text", text: projection.text }],
            timestamp,
          },
        ],
      };
    } catch {
      return undefined;
    }
  });
}
