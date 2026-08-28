#!/usr/bin/env node
import { createHash } from "node:crypto";

const LANGUAGE_BY_EXT = {
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".go": "go",
  ".rs": "rust",
};

const PATTERNS = {
  python: /^\s*(?:async\s+)?(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/u,
  javascript: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/u,
  typescript: /^\s*(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_][A-Za-z0-9_]*)/u,
  go: /^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)/u,
  rust: /^\s*(?:pub(?:\s*\([^)]+\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/u,
};

function languageFor(path) {
  const base = String(path).split("/").at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  return LANGUAGE_BY_EXT[dot === -1 ? "" : base.slice(dot).toLowerCase()] ?? null;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function braceBalance(text) {
  let round = 0;
  let curly = 0;
  for (const char of text) {
    if (char === "(") round += 1;
    if (char === ")") round -= 1;
    if (char === "{") curly += 1;
    if (char === "}") curly -= 1;
    if (round < 0 || curly < 0) return false;
  }
  return round === 0 && curly === 0;
}

export function parseSource({ path, bytes }) {
  const text = String(bytes ?? "").replaceAll("\r\n", "\n");
  const language = languageFor(path);
  if (!language) {
    return { units: [], error: "parser-not-implemented" };
  }
  if (!braceBalance(text) && language !== "python") {
    return { units: [], error: "parse-broken" };
  }

  const pattern = PATTERNS[language];
  const lines = text.split("\n");
  const units = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (!match) continue;
    let end = index;
    if (language === "python") {
      const indent = lines[index].match(/^\s*/u)?.[0].length ?? 0;
      end = index;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (lines[cursor].trim() === "") {
          end = cursor;
          continue;
        }
        const nextIndent = lines[cursor].match(/^\s*/u)?.[0].length ?? 0;
        if (nextIndent <= indent && lines[cursor].trim() !== "") break;
        end = cursor;
      }
    } else {
      let depth = 0;
      let seen = false;
      for (let cursor = index; cursor < lines.length; cursor += 1) {
        for (const char of lines[cursor]) {
          if (char === "{") {
            depth += 1;
            seen = true;
          }
          if (char === "}") depth -= 1;
        }
        end = cursor;
        if (seen && depth <= 0) break;
      }
    }
    const slice = lines.slice(index, end + 1).join("\n");
    const prefix = lines.slice(0, index).join("\n");
    const startByte = prefix.length === 0 ? 0 : Buffer.byteLength(`${prefix}\n`);
    units.push({
      path,
      selector: match[1],
      qualifiedSelector: match[1],
      language,
      startLine: index + 1,
      endLine: end + 1,
      byteRange: [startByte, startByte + Buffer.byteLength(slice)],
      sha256: sha256Bytes(slice),
    });
  }

  if (units.length === 0) {
    return { units: [], error: "unresolved" };
  }

  const names = units.map((unit) => unit.selector);
  if (new Set(names).size !== names.length) {
    return { units: [], error: "ambiguous" };
  }

  return { units, error: null };
}

export async function parseStdin(readStdin) {
  const raw = await readStdin();
  const request = JSON.parse(raw || "{}");
  return parseSource({ path: request.path, bytes: request.bytes });
}

const isMain = process.argv[1] && process.argv[1].endsWith("parse.mjs");
if (isMain) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const result = await parseStdin(async () => Buffer.concat(chunks).toString("utf8"));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
