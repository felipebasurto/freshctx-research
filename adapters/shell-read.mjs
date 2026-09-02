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

function splitOnUnquotedPipes(command) {
  const segments = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === "\"") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "|") {
      segments.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) segments.push(current.trim());
  return segments.filter((segment) => segment.length > 0);
}

function dumpVerbPaths(tokens) {
  if (tokens.length < 3) return [];
  const verb = tokens[0];
  if (verb !== "cat" && verb !== "nl") return [];
  const args = positionalArgs(tokens);
  return args.length >= 2 ? args : [];
}

function pythonDumpPaths(tokens) {
  const verb = tokens[0];
  if (verb !== "python" && verb !== "python3") return [];
  const scriptFlagIndex = tokens.indexOf("-c");
  if (scriptFlagIndex < 1 || scriptFlagIndex + 1 >= tokens.length) return [];
  const script = tokens[scriptFlagIndex + 1];
  if (!/(?:open\(|read_text\(|\.read\()/u.test(script)) return [];
  const args = tokens.slice(scriptFlagIndex + 2).filter((token) => !token.startsWith("-"));
  return args.length >= 2 ? args : [];
}

function printfPathsFedToXargsDump(segments) {
  if (segments.length < 2) return [];
  const producer = tokenizeShellCommand(segments[0]);
  if (producer[0] !== "printf" || producer.length < 4) return [];
  const consumer = tokenizeShellCommand(segments[1]);
  if (consumer[0] !== "xargs" || !consumer.some((token) => token === "cat" || token === "nl")) return [];
  const args = producer.slice(2).filter((token) => !token.startsWith("-"));
  return args.length >= 2 ? args : [];
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
    if (token === "-n" || token === "--lines") {
      const next = parsePositiveInt(tokens[index + 1]);
      if (next == null) return null;
      lineCount = next;
      index += 1;
      continue;
    }
    const attached = /^(?:-n|--lines=)(\d+)$/u.exec(token) ?? /^-(\d+)$/u.exec(token);
    if (attached) {
      const next = parsePositiveInt(attached[1]);
      if (next == null) return null;
      lineCount = next;
    }
  }
  return lineCount;
}

export function trackedPathsMentionedInCommand(command, trackedPaths) {
  const text = String(command ?? "");
  if (!text || !Array.isArray(trackedPaths) || trackedPaths.length === 0) return [];

  const unique = [...new Set(trackedPaths.filter((path) => typeof path === "string" && path.length > 0))];
  unique.sort((left, right) => right.length - left.length);

  const hits = [];
  let remaining = text;
  for (const path of unique) {
    if (!remaining.includes(path)) continue;
    hits.push(path);
    remaining = remaining.split(path).join("\0");
  }
  return hits;
}

export function shellDumpPathsFromCommand(command) {
  if (typeof command !== "string" || !command.trim()) return [];
  const inner = unwrapBashCommand(command);
  const segments = splitOnUnquotedPipes(inner);
  if (segments.length === 0) return [];

  const direct = dumpVerbPaths(tokenizeShellCommand(segments[0]));
  if (direct.length >= 2) return direct;

  const python = pythonDumpPaths(tokenizeShellCommand(inner));
  if (python.length >= 2) return python;

  const xargs = printfPathsFedToXargsDump(segments);
  if (xargs.length >= 2) return xargs;

  return [];
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

function splitNormalizedLines(text) {
  return String(text ?? "").replaceAll("\r\n", "\n").split("\n");
}

/**
 * Derive the 1-based inclusive span a head/tail shell read actually showed the
 * model, from the observed tool output, and verify it against the file.
 * Returns null (fail closed: no unit is tracked) when the observation does not
 * have exactly the number of lines the command must have printed
 * (min(requested, body lines) — PCR 0088 sealed this for Hermes tail reads) or
 * is not the matching slice at the expected end of the file.
 */
export function observedSpanForShellRead(parsed, fileContent, observedContent) {
  if (!parsed || parsed.scope !== "region") return null;
  const fileLines = splitNormalizedLines(fileContent);
  const observedLines = splitNormalizedLines(observedContent);
  // Tool hosts may or may not keep the final newline; compare without it.
  if (observedLines.at(-1) === "") observedLines.pop();
  if (observedLines.length === 0) return null;
  const fileBody = fileLines.at(-1) === "" ? fileLines.slice(0, -1) : fileLines;
  const fileLineCount = fileLines.length;

  let requested;
  if (Number.isInteger(parsed.tailLines) && parsed.tailLines > 0) {
    requested = parsed.tailLines;
  } else if (parsed.startLine === 1 && Number.isInteger(parsed.endLine) && parsed.endLine > 0) {
    requested = parsed.endLine;
  } else {
    return null;
  }
  // Size before content: a truncated or over-long observation must never match
  // "by accident" as a shorter or longer slice of the file.
  if (observedLines.length !== Math.min(requested, fileBody.length)) return null;

  let startLine;
  let endLine;
  if (parsed.tailLines != null) {
    startLine = fileBody.length - observedLines.length + 1;
    endLine = fileLineCount;
  } else {
    startLine = 1;
    endLine = observedLines.length === fileBody.length ? fileLineCount : observedLines.length;
  }
  const expected = fileBody.slice(startLine - 1, startLine - 1 + observedLines.length).join("\n");
  if (expected !== observedLines.join("\n")) return null;
  return { startLine, endLine };
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

    if (parsed.scope === "region") {
      const observed = observedToolContent(content);
      if (!observed) return false;
      const span = observedSpanForShellRead(parsed, file.content, observed);
      if (!span) return false;
      const unit = engine.trackRead({
        path: file.path,
        content: observed,
        scope: "region",
        startLine: span.startLine,
        endLine: span.endLine,
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
