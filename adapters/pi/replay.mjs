import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  DEFAULT_BUDGET_CHARS,
  dropUnservedReadToolPairs,
  latestReadCallIdsByObservation,
  readToolCallIds,
  readDispositionByCallToUnit,
  replaceBudgetOmittedReadQuoteability,
  replaceHistoricalProjectionMessages,
  replaceTrackedReadToolResults,
  resolveAdapterBudgetChars,
  resolveProjectionText,
  servedReadCallIdsFromProjection,
} from "../request-prune.mjs";
import { SHELL_TOOLS, trackedReadTools, tryTrackShellRead } from "../shell-read.mjs";
import { FreshCtxEngine } from "../../src/index.mjs";

const PI_READ_TOOLS = trackedReadTools(new Set(["read"]));

const MAX_TRACKED_FILE_BYTES = 512 * 1024;

export { DEFAULT_BUDGET_CHARS };

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function lastUserTask(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return textFromContent(message.content);
  }
  return "";
}

function observedToolContent(content) {
  if (typeof content === "string") return content;
  return textFromContent(content);
}

function replaceMapContents(target, source) {
  target.clear();
  for (const [key, value] of source.entries()) target.set(key, value);
}

function selectedRevisionsFromProjection(projection) {
  const revisions = new Map();
  for (const unit of projection?.selected ?? []) {
    if (typeof unit?.id !== "string" || typeof unit?.revision !== "string") continue;
    revisions.set(unit.id, unit.revision);
  }
  return revisions;
}

function countSkipEligibleSelections(lastInjectedRevision, projection) {
  if (!(lastInjectedRevision instanceof Map)) return 0;
  let count = 0;
  for (const unit of projection?.selected ?? []) {
    if (typeof unit?.id !== "string" || typeof unit?.revision !== "string") continue;
    if (lastInjectedRevision.get(unit.id) === unit.revision) count += 1;
  }
  return count;
}

function syncRegistryToActiveCalls(engine, callToUnit, activeCallIds) {
  const activeUnits = new Set();
  const inactiveCallIds = [];
  for (const [callId, unitId] of callToUnit.entries()) {
    if (activeCallIds.has(callId)) {
      activeUnits.add(unitId);
      continue;
    }
    inactiveCallIds.push(callId);
  }
  for (const callId of inactiveCallIds) callToUnit.delete(callId);
  for (const unitId of [...engine.registry.units.keys()]) {
    if (!activeUnits.has(unitId)) engine.registry.units.delete(unitId);
  }
}

function omittedReadDispositions(readDispositionByCallId) {
  const omitted = new Map();
  for (const [callId, item] of readDispositionByCallId.entries()) {
    if (item?.disposition === "budget" || item?.disposition === "unresolved") {
      omitted.set(callId, { path: item.path, disposition: item.disposition });
    }
  }
  return omitted;
}

function projectionAppliedToMessages(messages, projectionText) {
  if (!Array.isArray(messages) || typeof projectionText !== "string" || projectionText.length === 0) {
    return false;
  }
  return messages.some(
    (message) =>
      message?.role === "user"
      && (
        message.content === projectionText
        || (
          Array.isArray(message.content)
          && message.content.some((part) => part?.type === "text" && part.text === projectionText)
        )
      ),
  );
}

function lineCount(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n").length;
}

export function normalizePiReadScope(scopeMeta, fileLineCount) {
  if (!scopeMeta || scopeMeta.scope !== "region") return scopeMeta ?? { scope: "file" };
  if (!Number.isInteger(fileLineCount) || fileLineCount < 1) return scopeMeta;
  const { startLine, endLine } = scopeMeta;
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) return scopeMeta;
  // Pi pagination that reaches EOF (0064 past-EOF, 0069 exact-EOF) promotes to whole-file
  // so interior edits on multi-line spans still project without neighbor injection.
  if (endLine >= fileLineCount) return { scope: "file" };
  return scopeMeta;
}

export function readScopeFromInput(input, fileLineCount) {
  if (!input || typeof input !== "object") return { scope: "file" };
  if (input.scope === "region") {
    return normalizePiReadScope(
      {
        scope: "region",
        startLine: input.startLine,
        endLine: input.endLine,
        selector: input.selector,
      },
      fileLineCount,
    );
  }
  const offset = input.offset;
  const limit = input.limit;
  if (Number.isFinite(offset) && Number.isFinite(limit) && offset >= 1 && limit >= 1) {
    return normalizePiReadScope(
      {
        scope: "region",
        startLine: offset,
        endLine: offset + limit - 1,
        selector: input.selector,
      },
      fileLineCount,
    );
  }
  return { scope: "file" };
}

export async function safeWorkspaceFile(rootInput, requestedPath) {
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

function replaceCapturedReads(messages, callToUnit, engine, quoteability = {}) {
  return replaceTrackedReadToolResults(messages, {
    unitForCallId: (callId) => {
      const unitId = callToUnit.get(callId);
      return unitId ? engine.registry.get(unitId) : undefined;
    },
    ...quoteability,
  });
}

export function messageText(messages) {
  return messages
    .flatMap((message) => {
      if (typeof message.content === "string") return [message.content];
      if (!Array.isArray(message.content)) return [];
      return message.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text);
    })
    .join("\n\n");
}

/**
 * Pure-Node replay of adapters/pi/extension.ts.
 *
 * Pi's `context` hook is request-only: persisted session messages stay as Pi
 * recorded them; only the returned copy is sent to the provider.
 */
export function createPiAdapter({ budgetChars = DEFAULT_BUDGET_CHARS } = {}) {
  const engine = new FreshCtxEngine();
  const callToUnit = new Map();
  const callMeta = new Map();
  const lastInjectedRevision = new Map();
  const pendingInjectedRevision = new Map();
  const appliedReadDispositionByCallId = new Map();
  const pendingReadDispositionByCallId = new Map();
  let turnIndex = 0;
  let pendingProjectionText = "";

  return {
    engine,
    callToUnit,
    callMeta,
    lastInjectedRevision,
    pendingInjectedRevision,
    appliedReadDispositionByCallId,
    pendingReadDispositionByCallId,
    get turn() {
      return turnIndex;
    },

    async onTurnStart(event = {}) {
      turnIndex = event.turnIndex ?? turnIndex + 1;
      engine.turn = turnIndex;
    },

    async onBeforeProviderRequest(event = {}) {
      const messages = event?.payload?.messages;
      if (projectionAppliedToMessages(messages, pendingProjectionText)) {
        replaceMapContents(lastInjectedRevision, pendingInjectedRevision);
        for (const [callId, item] of pendingReadDispositionByCallId.entries()) {
          appliedReadDispositionByCallId.set(callId, { ...item });
        }
      }
      pendingInjectedRevision.clear();
      pendingReadDispositionByCallId.clear();
      pendingProjectionText = "";
    },

    async onToolResult(event, ctx) {
      if (event.isError) return;

      if (SHELL_TOOLS.has(event.toolName)) {
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
          observedToolContent,
          lineCount,
        });
        return;
      }

      if (event.toolName !== "read") return;
      const requestedPath = event.input?.path;
      if (typeof requestedPath !== "string") return;

      try {
        const file = await safeWorkspaceFile(ctx.cwd, requestedPath);
        const observedFileLineCount = lineCount(file.content);
        const scopeMeta = readScopeFromInput(event.input, observedFileLineCount);
        if (scopeMeta.scope === "region") {
          const content = observedToolContent(event.content);
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
        // Unsupported reads remain ordinary Pi results.
      }
    },

    async onContext(event, ctx) {
      if (engine.registry.list().length === 0) return undefined;

      try {
        const activeOfficialCallIds = latestReadCallIdsByObservation(
          event.messages,
          callMeta,
          new Set(["read"]),
        );
        const activeCallIds = new Set();
        for (const callId of callToUnit.keys()) {
          if (!callMeta.has(callId) || activeOfficialCallIds.has(callId)) activeCallIds.add(callId);
        }
        syncRegistryToActiveCalls(engine, callToUnit, activeCallIds);
        await engine.refresh(async (filePath) =>
          (await safeWorkspaceFile(ctx.cwd, filePath)).content,
        );
        const budgetChars = resolveAdapterBudgetChars({
          budgetChars: event.budgetChars,
          budgetTokens: event.budgetTokens,
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
        replaceMapContents(
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
        const latestReadCallIds = latestReadCallIdsByObservation(
          event.messages,
          callMeta,
          PI_READ_TOOLS,
        );
        const quoteable = replaceBudgetOmittedReadQuoteability(assembled, {
          unitForCallId: (callId) => {
            const unitId = callToUnit.get(callId);
            return unitId ? engine.registry.get(unitId) : undefined;
          },
          projectionText,
          userCountMessages: event.messages,
          historicalReadDispositionByCallId: appliedReadDispositionByCallId,
          latestReadCallIds,
        });
        const timestamp = event.messages.at(-1)?.timestamp ?? 0;
        const tailMessage = projectionText.length > 0
          ? [{
              role: "user",
              content: [{ type: "text", text: projectionText }],
              timestamp,
            }]
          : [];

        return {
          messages: [
            ...quoteable,
            ...tailMessage,
          ],
          projection: { ...projection, text: projectionText },
          telemetry: {
            totalMs: 0,
            projectionBytes: Buffer.byteLength(projectionText, "utf8"),
            skipEligibleSelections,
          },
        };
      } catch {
        return undefined;
      }
    },
  };
}

export function buildShellToolCall({ toolCallId, command, toolName = "bash" }) {
  return {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: toolCallId,
        type: "function",
        function: {
          name: toolName,
          arguments: JSON.stringify({ command }),
        },
      },
    ],
  };
}

export function buildReadToolCall({
  toolCallId,
  path,
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
          name: "read",
          arguments: JSON.stringify(args),
        },
      },
    ],
  };
}

export function buildToolResultMessage({ toolCallId, content }) {
  return {
    role: "tool",
    toolCallId,
    content: typeof content === "string" ? content : [{ type: "text", text: content }],
  };
}

/**
 * Serialize the provider payload Pi would send after the `context` hook.
 * Uses OpenAI chat-completions shape so the fake capture provider can record it.
 */
export function toProviderPayload(messages, { model = "freshctx-capture" } = {}) {
  return {
    model,
    messages: messages.map((message) => structuredClone(message)),
    stream: false,
  };
}

export async function captureProviderRequest({ cwd, persistedMessages, budgetChars }) {
  const adapter = createPiAdapter({ budgetChars });
  const ctx = { cwd };

  for (const message of persistedMessages) {
    if (message.role !== "tool") continue;
    const toolCallId = message.toolCallId ?? message.tool_call_id;
    if (typeof toolCallId !== "string") continue;

    let input = {};
    let toolName = "read";
    for (const prior of persistedMessages) {
      if (prior.role !== "assistant" || !Array.isArray(prior.tool_calls)) continue;
      const call = prior.tool_calls.find((item) => item.id === toolCallId);
      if (!call) continue;
      toolName = call.function?.name ?? call.name ?? "read";
      try {
        const args = JSON.parse(call.function.arguments);
        input = args && typeof args === "object" ? args : {};
      } catch {
        input = {};
      }
      break;
    }

    await adapter.onToolResult(
      {
        toolName,
        toolCallId,
        input,
        content: message.content,
        isError: false,
      },
      ctx,
    );
  }

  await adapter.onTurnStart({ turnIndex: adapter.turn + 1 });
  const contextResult = await adapter.onContext(
    {
      messages: structuredClone(persistedMessages),
      budgetChars,
    },
    ctx,
  );
  const requestMessages = contextResult?.messages ?? persistedMessages;
  const payload = toProviderPayload(requestMessages);
  await adapter.onBeforeProviderRequest({ payload });

  return {
    persistedMessages,
    requestMessages,
    payload,
    payloadText: messageText(requestMessages),
    projectionText: contextResult?.projection?.text ?? "",
    telemetry: contextResult?.telemetry ?? { totalMs: 0, projectionBytes: 0 },
    adapterApplied: Boolean(contextResult),
  };
}
