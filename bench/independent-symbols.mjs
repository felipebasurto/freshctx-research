import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PYTHON_ORACLE = fileURLToPath(new URL("./python-ast-oracle.py", import.meta.url));

const LANGUAGE_BY_EXT = Object.freeze({
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".go": "go",
  ".rs": "rust",
});

const HEADER = Object.freeze({
  javascript: [
    { kind: "class", re: /(?:^|[\n;{}])\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/gu },
    { kind: "function", re: /(?:^|[\n;{}])\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gu },
  ],
  typescript: [
    { kind: "class", re: /(?:^|[\n;{}])\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gu },
    { kind: "function", re: /(?:^|[\n;{}])\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gu },
  ],
  go: [
    { kind: "method", re: /(?:^|[\n;])\s*func\s+\(([^)]+)\)\s+([A-Za-z_][\w]*)/gu },
    { kind: "function", re: /(?:^|[\n;])\s*func\s+([A-Za-z_][\w]*)\s*(?:\(|\[)/gu },
  ],
  rust: [
    { kind: "impl", re: /(?:^|[\n;{}])\s*impl(?:\s*<[^>]+>)?\s+(?:[A-Za-z_][\w:]*\s+for\s+)?([A-Za-z_][\w]*)/gu },
    { kind: "function", re: /(?:^|[\n;{}])\s*(?:pub(?:\s*\([^)]+\))?\s+)?(?:async\s+)?(?:const\s+)?fn\s+([A-Za-z_][\w]*)/gu },
  ],
});

export function languageForPath(path) {
  const base = String(path).split("/").at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  return LANGUAGE_BY_EXT[dot === -1 ? "" : base.slice(dot).toLowerCase()] ?? null;
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertNoEngineImport(source) {
  return !/^import\s+.*from\s+["'][^"']*treesitter/m.test(source);
}

export function qualifiedSelector(kind, name, owner) {
  if (kind === "class") return `class ${name}`;
  if (owner) return `class ${owner}::method ${name}`;
  return `function ${name}`;
}

function lineOfIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

function sliceLines(text, startLine, endLine) {
  return String(text).split("\n").slice(startLine - 1, endLine).join("\n");
}

function byteRangeForLines(text, startLine, endLine) {
  const lines = String(text).split("\n");
  const slice = lines.slice(startLine - 1, endLine).join("\n");
  const prefix = lines.slice(0, startLine - 1).join("\n");
  const startByte = prefix.length === 0 ? 0 : Buffer.byteLength(`${prefix}\n`);
  return [startByte, startByte + Buffer.byteLength(slice)];
}

function finishUnits(units) {
  if (units.length === 0) {
    return { units: [], error: "unresolved" };
  }
  const counts = new Map();
  for (const unit of units) {
    const key = unit.qualifiedSelector;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const unique = units.filter((unit) => counts.get(unit.qualifiedSelector) === 1);
  if (unique.length === 0) {
    return { units: [], error: "ambiguous" };
  }
  return { units: unique, error: null };
}

function hashUnits(text, units) {
  return units.map((unit) => {
    const slice = sliceLines(text, unit.startLine, unit.endLine);
    return {
      ...unit,
      byteRange: byteRangeForLines(text, unit.startLine, unit.endLine),
      sha256: sha256Bytes(slice),
    };
  });
}

function blankJsFamily(text) {
  let out = "";
  let state = "code";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        out += "  ";
        index += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "block";
        out += "  ";
        index += 1;
        continue;
      }
      if (char === "'" || char === "\"" || char === "`") {
        state = char;
        out += " ";
        continue;
      }
      out += char;
      continue;
    }
    if (state === "line") {
      if (char === "\n") {
        state = "code";
        out += "\n";
      } else {
        out += " ";
      }
      continue;
    }
    if (state === "block") {
      out += char === "\n" ? "\n" : " ";
      if (char === "*" && next === "/") {
        out += " ";
        index += 1;
        state = "code";
      }
      continue;
    }
    if (char === "\n") {
      out += "\n";
      if (state !== "`") state = "code";
      continue;
    }
    if (char === "\\" && next) {
      out += "  ";
      index += 1;
      continue;
    }
    if (char === state) {
      out += " ";
      state = "code";
      continue;
    }
    out += " ";
  }
  return out;
}

function blankSlashCommentsAndStrings(text) {
  return blankJsFamily(text);
}

function braceDepthAt(blanked, index) {
  let depth = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    const char = blanked[cursor];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
  }
  return depth;
}

function findBraceEnd(text, fromIndex) {
  let depth = 0;
  let seen = false;
  let state = "code";
  for (let index = fromIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        index += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "block";
        index += 1;
        continue;
      }
      if (char === "'" || char === "\"" || char === "`") {
        state = char;
        continue;
      }
      if (char === "{") {
        depth += 1;
        seen = true;
      } else if (char === "}") {
        depth -= 1;
        if (seen && depth <= 0) return index;
      }
      continue;
    }
    if (state === "line") {
      if (char === "\n") state = "code";
      continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") {
        index += 1;
        state = "code";
      }
      continue;
    }
    if (char === "\\" && next) {
      index += 1;
      continue;
    }
    if (char === state) state = "code";
  }
  return text.length - 1;
}

function goReceiverType(receiver) {
  const match = String(receiver).match(/([A-Za-z_][\w]*)\s*$/u);
  return match?.[1] ?? null;
}

function collectHeaders(blanked, language) {
  const rules = HEADER[language] ?? [];
  const hits = [];
  for (const rule of rules) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let match = re.exec(blanked);
    while (match) {
      if (rule.kind === "method" && language === "go") {
        hits.push({
          kind: "method",
          name: match[2],
          owner: goReceiverType(match[1]),
          index: match.index + match[0].length - (match[2]?.length ?? 0),
        });
      } else if (rule.kind === "impl") {
        hits.push({
          kind: "impl",
          name: match[1],
          owner: match[1],
          index: match.index + match[0].search(/impl/u),
        });
      } else {
        const name = match[1];
        hits.push({
          kind: rule.kind,
          name,
          owner: null,
          index: match.index + match[0].lastIndexOf(name),
        });
      }
      match = re.exec(blanked);
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}

function jsMethodHeaders(blanked, classStart, classEnd) {
  const body = blanked.slice(classStart, classEnd);
  const re = /(?:^|[\n;{])\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gu;
  const hits = [];
  let match = re.exec(body);
  while (match) {
    const name = match[1];
    if (name !== "constructor" && name !== "if" && name !== "for" && name !== "while" && name !== "switch" && name !== "catch") {
      hits.push({
        kind: "method",
        name,
        index: classStart + match.index + match[0].lastIndexOf(name),
      });
    }
    match = re.exec(body);
  }
  return hits;
}

function enumerateBraceLanguage({ path, text, language }) {
  const blanked = language === "go" || language === "rust" ? blankSlashCommentsAndStrings(text) : blankJsFamily(text);
  const headers = collectHeaders(blanked, language);
  const units = [];
  const implSpans = [];

  for (const header of headers) {
    const depth = braceDepthAt(blanked, header.index);
    if (header.kind === "impl") {
      if (depth !== 0) continue;
      const end = findBraceEnd(text, header.index);
      implSpans.push({ owner: header.owner, start: header.index, end });
      continue;
    }
    if (header.kind === "class" && depth !== 0) continue;
    if (header.kind === "function" && language !== "rust" && depth !== 0) continue;
    if (header.kind === "method" && language === "go" && depth !== 0) continue;
    if (header.kind === "function" && language === "go") {
      const prefix = blanked.slice(Math.max(0, header.index - 80), header.index);
      if (/\([^)]*\)\s*$/u.test(prefix.replace(/\s+/gu, " "))) continue;
    }
    const endIndex = findBraceEnd(text, header.index);
    const startLine = lineOfIndex(text, header.index);
    const endLine = lineOfIndex(text, endIndex);
    let kind = header.kind;
    let owner = header.owner;
    if (language === "rust" && header.kind === "function") {
      const impl = implSpans.find((span) => header.index > span.start && header.index < span.end);
      if (impl) {
        kind = "method";
        owner = impl.owner;
      } else if (depth !== 0) {
        continue;
      }
    }
    units.push({
      path,
      scope: "symbol",
      kind,
      selector: header.name,
      qualifiedSelector: qualifiedSelector(kind, header.name, owner),
      language,
      startLine,
      endLine,
    });
    if (kind === "class") {
      const methods = jsMethodHeaders(blanked, header.index, endIndex);
      for (const method of methods) {
        const methodEnd = findBraceEnd(text, method.index);
        units.push({
          path,
          scope: "symbol",
          kind: "method",
          selector: method.name,
          qualifiedSelector: qualifiedSelector("method", method.name, header.name),
          language,
          startLine: lineOfIndex(text, method.index),
          endLine: lineOfIndex(text, methodEnd),
        });
      }
    }
  }
  return finishUnits(hashUnits(text, units));
}

function enumeratePython({ path, bytes }) {
  const result = spawnSync(process.env.PYTHON ?? "python3", [PYTHON_ORACLE], {
    input: JSON.stringify({ path, bytes }),
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout) {
    return { units: [], error: "oracle-unavailable" };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { units: [], error: "oracle-unavailable" };
  }
  if (parsed.error) {
    return { units: [], error: parsed.error };
  }
  return finishUnits(hashUnits(bytes, parsed.units ?? []));
}

export function enumerateIndependentSymbols({ path, bytes }) {
  const text = String(bytes ?? "").replaceAll("\r\n", "\n");
  const language = languageForPath(path);
  if (!language) {
    return { units: [], error: "parser-not-implemented" };
  }
  if (language === "python") {
    return enumeratePython({ path, bytes: text });
  }
  return enumerateBraceLanguage({ path, text, language });
}
