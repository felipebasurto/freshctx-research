import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { FreshCtxEngine } from "../../src/index.mjs";
import {
  dropUnservedReadToolPairs,
  latestReadCallIdsByObservation,
  readToolCallIds,
  readDispositionByCallToUnit,
  replaceHistoricalProjectionMessages,
  replaceTrackedReadToolResults,
  resolveAdapterBudgetChars,
  resolveProjectionText,
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

function replaceMapContents(target: Map<string, string>, source: Map<string, string>) {
  target.clear();
  for (const [key, value] of source.entries()) target.set(key, value);
}

function replaceDispositionMapContents(
  target: Map<string, { path: string; disposition: string }>,
  source: Map<string, { path: string; disposition: string }>,
) {
  target.clear();
  for (const [key, value] of source.entries()) target.set(key, { ...value });
}

function selectedRevisionsFromProjection(
  projection: { selected?: Array<{ id?: string; revision?: string }> } | undefined,
): Map<string, string> {
  const revisions = new Map<string, string>();
  for (const unit of projection?.selected ?? []) {
    if (typeof unit?.id !== "string" || typeof unit?.revision !== "string") continue;
    revisions.set(unit.id, unit.revision);
  }
  return revisions;
}

function countSkipEligibleSelections(
  lastInjectedRevision: Map<string, string>,
  projection: { selected?: Array<{ id?: string; revision?: string }> } | undefined,
): number {
  let count = 0;
  for (const unit of projection?.selected ?? []) {
    if (typeof unit?.id !== "string" || typeof unit?.revision !== "string") continue;
    if (lastInjectedRevision.get(unit.id) === unit.revision) count += 1;
  }
  return count;
}

function syncRegistryToActiveCalls(
  engine: FreshCtxEngine,
  callToUnit: Map<string, string>,
  activeCallIds: Set<string>,
) {
  const activeUnits = new Set<string>();
  const inactiveCallIds: string[] = [];
  for (const [callId, unitId] of callToUnit.entries()) {
    if (activeCallIds.has(callId)) {
      activeUnits.add(unitId);
      continue;
    }
    inactiveCallIds.push(callId);
  }
  for (const callId of inactiveCallIds) callToUnit.delete(callId);
  for (const unitId of Array.from((engine.registry as { units: Map<string, unknown> }).units.keys())) {
    if (!activeUnits.has(unitId)) (engine.registry as { units: Map<string, unknown> }).units.delete(unitId);
  }
}

function omittedReadDispositions(
  readDispositionByCallId: Map<string, { path: string; disposition: string }>,
): Map<string, { path: string; disposition: string }> {
  const omitted = new Map<string, { path: string; disposition: string }>();
  for (const [callId, item] of readDispositionByCallId.entries()) {
    if (item.disposition === "budget" || item.disposition === "unresolved") {
      omitted.set(callId, { path: item.path, disposition: item.disposition });
    }
  }
  return omitted;
}

function projectionAppliedToMessages(messages: readonly unknown[] | undefined, projectionText: string): boolean {
  if (!Array.isArray(messages) || projectionText.length === 0) return false;
  return messages.some((raw) => {
    const message = raw as { role?: string; content?: unknown };
    if (message.role !== "user") return false;
    if (message.content === projectionText) return true;
    if (!Array.isArray(message.content)) return false;
    return message.content.some(
      (part) => Boolean(part && typeof part === "object"
        && (part as { type?: string }).type === "text"
        && (part as { text?: string }).text === projectionText),
    );
  });
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
  quoteability: {
    projection?: { selected?: Array<{ id?: string }>; omitted?: unknown[] };
    skipEligibleSelections?: number;
    projectionText?: string;
    lastInjectedRevision?: Map<string, string>;
  } = {},
) {
  return replaceTrackedReadToolResults(messages, {
    unitForCallId: (callId) => {
      const unitId = callToUnit.get(callId);
      return unitId ? engine.registry.get(unitId) : undefined;
    },
    ...quoteability,
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
  const callMeta = new Map<string, {
    path: string;
    scope: "file" | "region";
    startLine?: number;
    endLine?: number;
    selector?: string;
  }>();
  const lastInjectedRevision = new Map<string, string>();
  const pendingInjectedRevision = new Map<string, string>();
  const appliedReadDispositionByCallId = new Map<string, { path: string; disposition: string }>();
  const pendingReadDispositionByCallId = new Map<string, { path: string; disposition: string }>();
  let pendingProjectionText = "";

  pi.on("turn_start", async (event) => {
    engine.turn = event.turnIndex;
  });

  pi.on("before_provider_request", async (event) => {
    const payload = (event as { payload?: { messages?: readonly unknown[] } }).payload;
    if (projectionAppliedToMessages(payload?.messages, pendingProjectionText)) {
      replaceMapContents(lastInjectedRevision, pendingInjectedRevision);
      for (const [callId, item] of pendingReadDispositionByCallId.entries()) {
        appliedReadDispositionByCallId.set(callId, { ...item });
      }
    }
    pendingInjectedRevision.clear();
    pendingReadDispositionByCallId.clear();
    pendingProjectionText = "";
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
        callMeta.set(event.toolCallId, {
          path: file.path,
          scope: "region",
          startLine: scopeMeta.startLine,
          endLine: scopeMeta.endLine,
          selector: scopeMeta.selector,
        });
        return;
      }

      const unit = engine.trackRead({
        path: file.path,
        content: file.content,
        scope: "file",
      });
      callToUnit.set(event.toolCallId, unit.id);
      callMeta.set(event.toolCallId, {
        path: file.path,
        scope: "file",
      });
    } catch {
      // Unsupported, binary, oversized, missing, or out-of-root reads remain
      // ordinary Pi results. FreshCtx never masks a result it cannot refresh.
    }
  });

  pi.on("context", async (event, ctx) => {
    if (engine.registry.list().length === 0) return;

    try {
      const activeOfficialCallIds = latestReadCallIdsByObservation(
        event.messages,
        callMeta,
        new Set(["read"]),
      );
      const activeCallIds = new Set<string>();
      for (const callId of callToUnit.keys()) {
        if (!callMeta.has(callId) || activeOfficialCallIds.has(callId)) activeCallIds.add(callId);
      }
      syncRegistryToActiveCalls(engine, callToUnit, activeCallIds);
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
      const skipEligibleSelections = countSkipEligibleSelections(lastInjectedRevision, projection);
      replaceMapContents(pendingInjectedRevision, selectedRevisionsFromProjection(projection));
      const projectionText = resolveProjectionText({
        messages: event.messages,
        projection,
        skipEligibleSelections,
      });
      pendingProjectionText = projectionText;
      const rewritten = replaceHistoricalProjectionMessages(
        replaceCapturedReads(event.messages, callToUnit, engine, {
          projection,
          skipEligibleSelections,
          projectionText,
          lastInjectedRevision,
        }),
      );
      const servedCallIds = servedReadCallIdsFromProjection(callToUnit, projection);
      const readDispositionByCallId = readDispositionByCallToUnit(
        callToUnit,
        engine.registry,
        projection,
      );
      replaceDispositionMapContents(
        pendingReadDispositionByCallId,
        omittedReadDispositions(readDispositionByCallId),
      );
      const assembled = dropUnservedReadToolPairs(rewritten, {
        readTools: PI_READ_TOOLS,
        servedCallIds,
        observedCallIds: readToolCallIds(event.messages, PI_READ_TOOLS),
        trackedPaths: engine.registry.list().map((unit) => unit.path),
        projection,
        readDispositionByCallId,
        historicalReadDispositionByCallId: appliedReadDispositionByCallId,
      });
      const timestamp = (event.messages.at(-1) as { timestamp?: number } | undefined)?.timestamp ?? 0;
      const tailMessage = projectionText.length > 0
        ? [{
            role: "user",
            content: [{ type: "text", text: projectionText }],
            timestamp,
          }]
        : [];

      return {
        messages: [
          ...assembled,
          ...tailMessage,
        ],
          telemetry: {
            totalMs: 0,
            projectionBytes: Buffer.byteLength(projectionText, "utf8"),
            skipEligibleSelections,
          },
      };
    } catch {
      return undefined;
    }
  });
}
