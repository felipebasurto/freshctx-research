/**
 * Recognize single-file workspace text reads issued via shell tools (cat-class).
 * Does not execute commands; pattern-match only. Ambiguous input returns null.
 */

export const SHELL_TOOLS = new Set(["bash", "shell"]);

export function trackedReadTools(baseReadTools) {
  return new Set([...baseReadTools, ...SHELL_TOOLS]);
}

export function shellCommandFromInput(input) {
  if (!input || typeof input !== "object") return null;
  const command = input.command ?? input.cmd ?? input.script;
  return typeof command === "string" ? command.trim() : null;
}

function unwrapBashCommand(command) {
  const trimmed = command.trim();
  const singleQuoted = /^bash\s+(?:-lc\s+|-c\s+)'([^']*)'\s*$/u.exec(trimmed);
  if (singleQuoted) return singleQuoted[1].trim();
  const doubleQuoted = /^bash\s+(?:-lc\s+|-c\s+)"([^"]*)"\s*$/u.exec(trimmed);
  if (doubleQuoted) return doubleQuoted[1].trim();
  return trimmed;
}

function rejectUnsafeShell(command) {
  if (!command || command.includes("\n")) return true;
  return /[|;&><`$()]|\|\||&&/u.test(command);
}

export function tokenizeShellCommand(command) {
  const tokens = [];
  let index = 0;
  while (index < command.length) {
    const ch = command[index];
    if (ch === " " || ch === "\t") {
      index += 1;
      continue;
    }
    if (ch === "'" || ch === "\"") {
      const quote = ch;
      index += 1;
      let token = "";
      while (index < command.length && command[index] !== quote) {
        token += command[index];
        index += 1;
      }
      if (command[index] === quote) index += 1;
      tokens.push(token);
      continue;
    }
    let token = "";
    while (index < command.length && command[index] !== " " && command[index] !== "\t") {
      token += command[index];
      index += 1;
    }
    tokens.push(token);
  }
  return tokens;
}

function positionalArgs(tokens) {
  const args = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "-n") {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    args.push(token);
  }
  return args;
}

function singlePathFromTokens(tokens) {
  const args = positionalArgs(tokens);
  if (args.length !== 1) return null;
  return args[0];
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

function parseSedLineRange(script) {
  const range = /^(\d+),(\d+)p$/u.exec(script)
    ?? /^'(\d+),(\d+)p'$/u.exec(script)
    ?? /^"(\d+),(\d+)p"$/u.exec(script);
  if (range) {
    const startLine = parsePositiveInt(range[1]);
    const endLine = parsePositiveInt(range[2]);
    if (startLine != null && endLine != null && endLine >= startLine) {
      return { startLine, endLine };
    }
  }
  const single = /^(\d+)p$/u.exec(script)
    ?? /^'(\d+)p'$/u.exec(script)
    ?? /^"(\d+)p"$/u.exec(script);
  if (single) {
    const line = parsePositiveInt(single[1]);
    if (line != null) return { startLine: line, endLine: line };
  }
  return null;
}

function lineCountFlag(tokens) {
  let lineCount = 10;
  for (let index = 1; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token === "-n") {
      const next = parsePositiveInt(tokens[index + 1]);
      if (next == null) return null;
      lineCount = next;
      index += 1;
      continue;
    }
    const shortFlag = /^-(\d+)$/u.exec(token);
    if (shortFlag) {
      const next = parsePositiveInt(shortFlag[1]);
      if (next == null) return null;
      lineCount = next;
    }
  }
  return lineCount;
}

/**
 * @returns {{ path: string, scope: "file" | "region", startLine?: number, endLine?: number } | null}
 */
export function parseShellFileRead(command) {
  if (typeof command !== "string" || !command.trim()) return null;
  const inner = unwrapBashCommand(command);
  if (rejectUnsafeShell(inner)) return null;

  const tokens = tokenizeShellCommand(inner);
  if (tokens.length < 2) return null;

  const verb = tokens[0];
  if (verb === "cat" || verb === "nl") {
    const path = singlePathFromTokens(tokens);
    return path ? { path, scope: "file" } : null;
  }

  if (verb === "head") {
    const path = singlePathFromTokens(tokens);
    if (!path) return null;
    const lineCount = lineCountFlag(tokens);
    if (lineCount == null) return null;
    return { path, scope: "region", startLine: 1, endLine: lineCount };
  }

  if (verb === "tail") {
    const path = singlePathFromTokens(tokens);
    if (!path) return null;
    const lineCount = lineCountFlag(tokens);
    if (lineCount == null) return null;
    return { path, scope: "region", tailLines: lineCount };
  }

  if (verb === "sed") {
    if (tokens.length < 4) return null;
    if (tokens[1] !== "-n") return null;
    const script = tokens[2];
    const path = tokens[3];
    if (tokens.length !== 4 || path.startsWith("-")) return null;
    const range = parseSedLineRange(script);
    if (!range) return null;
    return { path, scope: "region", startLine: range.startLine, endLine: range.endLine };
  }

  return null;
}

function normalizeTailRegion(parsed, fileLineCount) {
  if (parsed.scope !== "region" || parsed.tailLines == null) return parsed;
  const tailLines = parsed.tailLines;
  const startLine = Math.max(1, fileLineCount - tailLines + 1);
  return {
    path: parsed.path,
    scope: "region",
    startLine,
    endLine: fileLineCount,
  };
}

/**
 * Track a shell tool_result when it is a recognized single-file workspace read.
 * @returns {boolean} true when tracked
 */
export async function tryTrackShellRead({
  toolName,
  input,
  content,
  isError,
  cwd,
  engine,
  callToUnit,
  toolCallId,
  safeWorkspaceFile,
  observedToolContent,
  lineCount,
}) {
  if (isError || !SHELL_TOOLS.has(toolName)) return false;

  const command = shellCommandFromInput(input);
  if (!command) return false;

  const parsed = parseShellFileRead(command);
  if (!parsed) return false;

  try {
    const file = await safeWorkspaceFile(cwd, parsed.path);
    const observedFileLineCount = lineCount(file.content);
    const scopeMeta = parsed.scope === "region"
      ? normalizeTailRegion(parsed, observedFileLineCount)
      : parsed;

    if (scopeMeta.scope === "region") {
      const observed = observedToolContent(content);
      if (!observed) return false;
      const unit = engine.trackRead({
        path: file.path,
        content: observed,
        scope: "region",
        startLine: scopeMeta.startLine,
        endLine: scopeMeta.endLine,
        observedFileLineCount,
      });
      callToUnit.set(toolCallId, unit.id);
      return true;
    }

    const unit = engine.trackRead({
      path: file.path,
      content: file.content,
      scope: "file",
    });
    callToUnit.set(toolCallId, unit.id);
    return true;
  } catch {
    return false;
  }
}

export function shellCallsFromMessages(messages) {
  const candidates = new Map();
  const completed = new Set();

  for (const message of messages) {
    if (message?.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        const name = call?.function?.name ?? call?.name;
        if (!SHELL_TOOLS.has(name) || typeof call?.id !== "string") continue;
        const args = typeof call?.function?.arguments === "string"
          ? (() => {
            try {
              const parsed = JSON.parse(call.function.arguments);
              return parsed && typeof parsed === "object" ? parsed : {};
            } catch {
              return {};
            }
          })()
          : (call?.function?.arguments ?? call?.arguments ?? {});
        const command = shellCommandFromInput(args);
        if (!command) continue;
        const parsed = parseShellFileRead(command);
        if (!parsed) continue;
        candidates.set(call.id, parsed);
      }
    }

    if (message?.role === "tool") {
      const id = message.tool_call_id ?? message.toolCallId;
      if (typeof id === "string") completed.add(id);
    }
  }

  return Object.fromEntries([...candidates].filter(([id]) => completed.has(id)));
}
