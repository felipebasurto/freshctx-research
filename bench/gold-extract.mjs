import { createHash } from "node:crypto";

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function applyGeneratorMutation(text, mutation) {
  if (!mutation || mutation.type !== "replace-exact") {
    throw new Error("gold extract requires a generator replace-exact mutation");
  }
  return String(text).replace(mutation.expected, mutation.replacement);
}

export function sliceUnit(text, { startLine, endLine }) {
  const lines = String(text).replaceAll("\r\n", "\n").split("\n");
  return lines.slice(startLine - 1, endLine).join("\n");
}

export function extractGold({ initialText, offsets, sidecarUnits }) {
  if (sidecarUnits) {
    // Sidecar output is ignored on purpose. Gold is generator-owned.
  }
  const mutated = applyGeneratorMutation(initialText, offsets.mutation);
  const body = sliceUnit(mutated, offsets);
  return {
    source: "generator-offsets",
    path: offsets.path,
    startLine: offsets.startLine,
    endLine: offsets.endLine,
    bytes: body,
    sha256: sha256Bytes(body),
  };
}

export function extractGoldFromTrace(trace, { sidecarUnits } = {}) {
  const offsets = trace.goldExtract;
  if (!offsets || offsets.source !== "generator-offsets") {
    throw new Error("trace is missing generator-owned goldExtract");
  }
  const initialText = trace.initialFiles[offsets.path];
  return extractGold({ initialText, offsets, sidecarUnits });
}

export const OUT_OF_SCOPE_LANGUAGES = Object.freeze(["c", "lua", "neovim"]);
