import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { FreshCtxEngine, stableReadMarker } from "../../src/index.mjs";

const MAX_TRACKED_FILE_BYTES = 512 * 1024;
const DEFAULT_BUDGET_CHARS = 24_000;

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

export function readScopeFromInput(input) {
  if (!input || typeof input !== "object") return { scope: "file" };
  if (input.scope === "region") {
    return {
      scope: "region",
      startLine: input.startLine,
      endLine: input.endLine,
      selector: input.selector,
    };
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
      if (event.toolName !== "read" || event.isError) return;
      const requestedPath = event.input?.path;
      if (typeof requestedPath !== "string") return;

      try {
        const file = await safeWorkspaceFile(ctx.cwd, requestedPath);
        const scopeMeta = readScopeFromInput(event.input);
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
        const configured = Number(process.env.FRESHCTX_BUDGET_CHARS ?? budgetChars);
        const projection = engine.project({
          task: lastUserTask(event.messages),
          budgetChars: Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_BUDGET_CHARS,
        });
        const rewritten = replaceCapturedReads(event.messages, callToUnit, engine);
        const timestamp = event.messages.at(-1)?.timestamp ?? 0;

        return {
          messages: [
            ...rewritten,
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

export function buildReadToolCall({ toolCallId, path, scope, startLine, endLine, selector }) {
  const args = { path };
  if (scope === "region") {
    args.scope = "region";
    if (startLine != null) args.startLine = startLine;
    if (endLine != null) args.endLine = endLine;
    if (selector != null) args.selector = selector;
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
    for (const prior of persistedMessages) {
      if (prior.role !== "assistant" || !Array.isArray(prior.tool_calls)) continue;
      const call = prior.tool_calls.find((item) => item.id === toolCallId);
      if (!call) continue;
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
        toolName: "read",
        toolCallId,
        input,
        content: message.content,
        isError: false,
      },
      ctx,
    );
  }

  await adapter.onTurnStart({ turnIndex: adapter.turn + 1 });
  const contextResult = await adapter.onContext({ messages: structuredClone(persistedMessages) }, ctx);
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
