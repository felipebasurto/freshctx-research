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

function languageFor(path) {
  const base = String(path).split("/").at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  return LANGUAGE_BY_EXT[dot === -1 ? "" : base.slice(dot).toLowerCase()] ?? null;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
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
  try {
    const extracted = await extractTreeSitterUnits({ path, bytes: text, language });
    if (extracted.hasError) {
      return { units: [], error: "parse-broken" };
    }
    if (extracted.units.length === 0) {
      return { units: [], error: "unresolved" };
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
