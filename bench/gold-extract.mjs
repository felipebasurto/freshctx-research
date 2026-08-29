import { createHash } from "node:crypto";

export { enumerateIndependentSymbols } from "./independent-symbols.mjs";

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

export function extractGold({ initialText, offsets, engineUnits, sidecarUnits }) {
  void engineUnits;
  void sidecarUnits;
  const mutated = applyGeneratorMutation(initialText, offsets.mutation);
  const body = sliceUnit(mutated, offsets);
  return {
    source: "generator-offsets",
    path: offsets.path,
    scope: offsets.scope ?? "region",
    selector: offsets.selector ?? null,
    qualifiedSelector: offsets.qualifiedSelector ?? null,
    startLine: offsets.startLine,
    endLine: offsets.endLine,
    bytes: body,
    sha256: sha256Bytes(body),
    enumerator: offsets.enumerator ?? null,
  };
}

export function extractGoldFromTrace(trace, { engineUnits, sidecarUnits } = {}) {
  const offsets = trace.goldExtract;
  if (!offsets || offsets.source !== "generator-offsets") {
    throw new Error("trace is missing generator-owned goldExtract");
  }
  const initialText = trace.initialFiles[offsets.path];
  return extractGold({ initialText, offsets, engineUnits, sidecarUnits });
}

export function extractSymbolGold({ path, initialText, unit, mutation }) {
  const offsets = {
    path,
    scope: "symbol",
    selector: unit.selector,
    qualifiedSelector: unit.qualifiedSelector,
    startLine: unit.startLine,
    endLine: unit.endLine,
    mutation,
    enumerator: "independent-compiler-family",
  };
  return extractGold({ initialText, offsets });
}

export const OUT_OF_SCOPE_LANGUAGES = Object.freeze(["c", "lua", "neovim"]);
