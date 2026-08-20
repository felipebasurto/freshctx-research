import { createHash } from "node:crypto";
import path from "node:path";

export function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function shortHash(value, length = 12) {
  return sha256(value).slice(0, length);
}

export function normalizePath(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new TypeError("path must be a non-empty string");
  }

  const portable = input.replaceAll("\\", "/");
  const normalized = path.posix.normalize(portable);
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

export function revisionFor(content) {
  return `sha256:${sha256(content)}`;
}

export function stableUnitId({ path: filePath, scope, selector, startLine, endLine }) {
  const identity = [
    normalizePath(filePath),
    scope ?? "region",
    selector ?? `${startLine ?? 1}:${endLine ?? "?"}`,
  ].join("\u0000");

  return `fc_${shortHash(identity, 16)}`;
}
