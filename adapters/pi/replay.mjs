import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  DEFAULT_BUDGET_CHARS,
  dropUnservedReadToolPairs,
  resolveAdapterBudgetChars,
  servedReadCallIdsFromProjection,
} from "../request-prune.mjs";
import { SHELL_TOOLS, trackedReadTools, tryTrackShellRead } from "../shell-read.mjs";
import { FreshCtxEngine, stableReadMarker } from "../../src/index.mjs";

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

function replaceCapturedReads(messages, callToUnit, engine) {
  return messages.map((message) => {
    const callId = message.toolCallId ?? message.tool_call_id;
    const unitId = callId ? callToUnit.get(callId) : undefined;
    const unit = unitId ? engine.registry.get(unitId) : undefined;
    if (!unit) return structuredClone(message);

    const marker = stableReadMarker(unit);
    return {
      ...structuredClone(message),
      content: Array.isArray(message.content)
        ? [{ type: "text", text: marker }]
        : marker,
    };
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
  let turnIndex = 0;

  return {
    engine,
    callToUnit,
    get turn() {
      return turnIndex;
    },

    async onTurnStart(event = {}) {
      turnIndex = event.turnIndex ?? turnIndex + 1;
      engine.turn = turnIndex;
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
          return;
        }

        const unit = engine.trackRead({
          path: file.path,
          content: file.content,
          scope: "file",
        });
        callToUnit.set(event.toolCallId, unit.id);
      } catch {
        // Unsupported reads remain ordinary Pi results.
      }
    },

    async onContext(event, ctx) {
      if (engine.registry.list().length === 0) return undefined;

      try {
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
        const rewritten = replaceCapturedReads(event.messages, callToUnit, engine);
        const servedCallIds = servedReadCallIdsFromProjection(callToUnit, projection);
        const assembled = dropUnservedReadToolPairs(rewritten, {
          readTools: PI_READ_TOOLS,
          servedCallIds,
        });
        const timestamp = event.messages.at(-1)?.timestamp ?? 0;

        return {
          messages: [
            ...assembled,
            {
              role: "user",
              content: [{ type: "text", text: projection.text }],
              timestamp,
            },
          ],
          projection,
          telemetry: {
            totalMs: 0,
            projectionBytes: Buffer.byteLength(projection.text, "utf8"),
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
