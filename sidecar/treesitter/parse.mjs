#!/usr/bin/env node
import { createHash } from "node:crypto";

import { extractTreeSitterUnits } from "./grammars.mjs";

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

const REGEX_LANGUAGES = new Set(["go", "rust"]);

const PATTERNS = {
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

function finishUnits(units) {
  if (units.length === 0) {
    return { units: [], error: "unresolved" };
  }
  const names = units.map((unit) => unit.qualifiedSelector);
  if (new Set(names).size !== names.length) {
    return { units: [], error: "ambiguous" };
  }
  return { units, error: null };
}

function parseWithRegex({ path, bytes, language }) {
  if (!braceBalance(bytes)) {
    return { units: [], error: "parse-broken" };
  }
  const pattern = PATTERNS[language];
  const lines = bytes.split("\n");
  const units = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (!match) continue;
    let depth = 0;
    let seen = false;
    let end = index;
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
  return finishUnits(units);
}

function hashExtractedUnits(text, units) {
  const lines = text.split("\n");
  return units.map((unit) => {
    const slice = lines.slice(unit.startLine - 1, unit.endLine).join("\n");
    return { ...unit, sha256: sha256Bytes(slice) };
  });
}

export async function parseSource({ path, bytes }) {
  const text = String(bytes ?? "").replaceAll("\r\n", "\n");
  const language = languageFor(path);
  if (!language) {
    return { units: [], error: "parser-not-implemented" };
  }
  if (REGEX_LANGUAGES.has(language)) {
    return parseWithRegex({ path, bytes: text, language });
  }
  try {
    const extracted = await extractTreeSitterUnits({ path, bytes: text, language });
    if (extracted.units.length === 0) {
      return { units: [], error: extracted.hasError ? "parse-broken" : "unresolved" };
    }
    return finishUnits(hashExtractedUnits(text, extracted.units));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("sidecar-missing") || message.includes("Cannot find module")) {
      return { units: [], error: "sidecar-missing" };
    }
    return { units: [], error: "sidecar-error" };
  }
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
