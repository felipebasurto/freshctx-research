import { makeAnchors, resolveRegion } from "./anchors.mjs";
import { normalizePath, revisionFor, stableUnitId } from "./hash.mjs";

function lineCount(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n").length;
}

function splitLines(value) {
  return String(value).replaceAll("\r\n", "\n").split("\n");
}

function resolveStoredLineSpan(normalizedFile, startLine, endLine, observedFileLineCount) {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) return null;
  if (startLine < 1 || endLine < startLine) return null;
  // Honor explicit line-addressed single-line reads when content anchors are gone.
  if (startLine !== endLine) return null;
  if (!Number.isInteger(observedFileLineCount)) return null;

  const lines = splitLines(normalizedFile);
  if (lineCount(normalizedFile) !== observedFileLineCount) return null;
  if (endLine > lines.length) return null;

  return {
    state: "resolved",
    method: "stored-line-span",
    content: lines.slice(startLine - 1, endLine).join("\n"),
    startLine,
    endLine,
  };
}

async function readSource(provider, filePath) {
  if (typeof provider === "function") return provider(filePath);
  if (provider instanceof Map) return provider.get(filePath);
  if (provider && typeof provider === "object") return provider[filePath];
  throw new TypeError("source provider must be a function, Map, or object");
}

/**
 * File/region units on these extensions refresh through the Isolated Semantic
 * Engine when a runner is injected (PCR 0114). Go and Rust parse in the engine
 * but are intentionally excluded here until plans/008 Part B measures the
 * effect on the go-tools apex pack; they use anchor relocation meanwhile.
 * Symbol units are language-agnostic and do not consult this set.
 */
export const FILE_REGION_ISE_EXTENSIONS = new Set([".py", ".js", ".mjs", ".cjs", ".ts", ".tsx"]);

function semanticEngineTreeSitterLanguage(path) {
  const base = String(path).split("/").at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  const extension = dot === -1 ? "" : base.slice(dot).toLowerCase();
  return FILE_REGION_ISE_EXTENSIONS.has(extension);
}

function sliceFileLines(normalizedFile, startLine, endLine) {
  const lines = normalizedFile.split("\n");
  return lines.slice(startLine - 1, endLine).join("\n");
}

function semanticEngineFailureMethod(parsed) {
  if (parsed?.error === "ambiguous") return "isolated-semantic-engine-ambiguous";
  if (parsed?.error === "parse-broken") return "isolated-semantic-engine-unresolved";
  return "isolated-semantic-engine-unresolved";
}

function semanticEngineRefreshBlocked(parsed) {
  return parsed?.error === "parse-broken";
}

async function runIsolatedSemanticEngine(semanticEngineRunner, path, normalizedFile) {
  if (!semanticEngineRunner) {
    return { state: "unresolved", method: "isolated-semantic-engine-missing" };
  }
  let parsed;
  try {
    parsed = await semanticEngineRunner({ path, bytes: normalizedFile });
  } catch {
    return { state: "unresolved", method: "isolated-semantic-engine-error" };
  }
  if (!parsed) {
    return { state: "unresolved", method: "isolated-semantic-engine-unresolved" };
  }
  return { state: "parsed", parsed };
}

async function invokeIsolatedSemanticEngine(semanticEngineRunner, path, normalizedFile) {
  const invoked = await runIsolatedSemanticEngine(semanticEngineRunner, path, normalizedFile);
  if (invoked.state !== "parsed") return invoked;
  if (semanticEngineRefreshBlocked(invoked.parsed)) {
    return { state: "unresolved", method: semanticEngineFailureMethod(invoked.parsed) };
  }
  if (invoked.parsed.error === "unresolved" || (invoked.parsed.units ?? []).length === 0) {
    return { state: "unresolved", method: "isolated-semantic-engine-unresolved" };
  }
  return invoked;
}

function semanticEngineUnitsForSelector(units, selector) {
  if (!selector) return [];
  return (units ?? []).filter(
    (candidate) => candidate.selector === selector || candidate.qualifiedSelector === selector,
  );
}

function resolveIsolatedSemanticEngineUnitSpan(normalizedFile, match) {
  return {
    state: "resolved",
    method: "isolated-semantic-engine",
    content: sliceFileLines(normalizedFile, match.startLine, match.endLine),
    startLine: match.startLine,
    endLine: match.endLine,
  };
}

async function resolveSymbolUnit(unit, normalizedFile, semanticEngineRunner) {
  const invoked = await invokeIsolatedSemanticEngine(semanticEngineRunner, unit.path, normalizedFile);
  if (invoked.state !== "parsed") return invoked;
  const matches = (invoked.parsed.units ?? []).filter(
    (candidate) => candidate.selector === unit.selector || candidate.qualifiedSelector === unit.selector,
  );
  if (matches.length === 0) {
    return { state: "unresolved", method: "isolated-semantic-engine-unresolved" };
  }
  if (matches.length > 1) {
    return { state: "unresolved", method: "isolated-semantic-engine-ambiguous" };
  }
  return resolveIsolatedSemanticEngineUnitSpan(normalizedFile, matches[0]);
}

async function resolveFileViaIsolatedSemanticEngine(path, normalizedFile, semanticEngineRunner) {
  const invoked = await runIsolatedSemanticEngine(semanticEngineRunner, path, normalizedFile);
  if (invoked.state !== "parsed") return invoked;
  if (semanticEngineRefreshBlocked(invoked.parsed)) {
    return { state: "unresolved", method: semanticEngineFailureMethod(invoked.parsed) };
  }
  return {
    state: "resolved",
    method: "isolated-semantic-engine",
    content: normalizedFile,
    startLine: 1,
    endLine: lineCount(normalizedFile),
  };
}

async function resolveRegionViaIsolatedSemanticEngine(unit, normalizedFile, semanticEngineRunner) {
  const invoked = await runIsolatedSemanticEngine(semanticEngineRunner, unit.path, normalizedFile);
  if (invoked.state !== "parsed") return invoked;
  if (semanticEngineRefreshBlocked(invoked.parsed)) {
    return {
      state: "unresolved",
      method: semanticEngineFailureMethod(invoked.parsed),
      parseBroken: true,
    };
  }
  if (!unit.selector) {
    return { state: "pending" };
  }
  const matches = semanticEngineUnitsForSelector(invoked.parsed.units, unit.selector);
  if (matches.length === 0) {
    return { state: "pending" };
  }
  if (matches.length > 1) {
    return { state: "unresolved", method: "isolated-semantic-engine-ambiguous" };
  }
  return resolveIsolatedSemanticEngineUnitSpan(normalizedFile, matches[0]);
}

export class FreshRegistry {
  constructor({ semanticEngineRunner = null } = {}) {
    this.units = new Map();
    this.semanticEngineRunner = semanticEngineRunner;
  }

  trackRead({
    path,
    content,
    startLine = 1,
    endLine,
    turn = 0,
    selector,
    scope = "region",
    pinned = false,
    observedFileLineCount,
  }) {
    const filePath = normalizePath(path);
    const normalizedContent = String(content).replaceAll("\r\n", "\n");
    const finalEndLine = endLine ?? startLine + lineCount(normalizedContent) - 1;
    const id = stableUnitId({
      path: filePath,
      scope,
      selector,
      startLine,
      endLine: finalEndLine,
    });
    const revision = revisionFor(normalizedContent);
    const existing = this.units.get(id);

    if (existing) {
      const changed = existing.revision !== revision;
      existing.content = normalizedContent;
      existing.revision = revision;
      existing.startLine = startLine;
      existing.endLine = finalEndLine;
      existing.observedAt = turn;
      existing.lastUsedAt = turn;
      existing.state = "resolved";
      existing.resolutionMethod = "observed";
      existing.anchors = makeAnchors(normalizedContent, { startLine });
      existing.pinned ||= pinned;
      if (Number.isInteger(observedFileLineCount)) {
        existing.observedFileLineCount = observedFileLineCount;
      }
      if (changed) {
        existing.changedAt = turn;
        existing.changeCount += 1;
      }
      existing.versions.set(revision, {
        content: normalizedContent,
        startLine,
        endLine: finalEndLine,
        observedAt: turn,
      });
      return existing;
    }

    const unit = {
      id,
      path: filePath,
      scope,
      selector: selector ?? null,
      content: normalizedContent,
      revision,
      startLine,
      endLine: finalEndLine,
      observedAt: turn,
      lastUsedAt: turn,
      changedAt: turn,
      changeCount: 0,
      pinned,
      observedFileLineCount: Number.isInteger(observedFileLineCount)
        ? observedFileLineCount
        : undefined,
      state: "resolved",
      resolutionMethod: "observed",
      anchors: makeAnchors(normalizedContent, { startLine }),
      versions: new Map(),
    };
    unit.versions.set(revision, {
      content: normalizedContent,
      startLine,
      endLine: finalEndLine,
      observedAt: turn,
    });
    this.units.set(id, unit);
    return unit;
  }

  async refresh(provider, turn = 0) {
    const results = [];

    for (const unit of [...this.units.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      let currentFileContent;
      try {
        currentFileContent = await readSource(provider, unit.path);
      } catch (error) {
        unit.state = "unresolved";
        unit.resolutionMethod = "source-error";
        unit.resolutionError = error instanceof Error ? error.message : String(error);
        results.push(unit);
        continue;
      }

      if (typeof currentFileContent !== "string") {
        unit.state = "unresolved";
        unit.resolutionMethod = "source-missing";
        results.push(unit);
        continue;
      }

      const normalizedFile = currentFileContent.replaceAll("\r\n", "\n");
      const semanticEngineLanguage = semanticEngineTreeSitterLanguage(unit.path);
      const semanticEngineInjected = Boolean(this.semanticEngineRunner);
      let resolved;
      if (unit.scope === "symbol") {
        resolved = await resolveSymbolUnit(unit, normalizedFile, this.semanticEngineRunner);
      } else if (semanticEngineInjected && semanticEngineLanguage && unit.scope === "file") {
        resolved = await resolveFileViaIsolatedSemanticEngine(unit.path, normalizedFile, this.semanticEngineRunner);
      } else if (semanticEngineInjected && semanticEngineLanguage && unit.scope === "region") {
        resolved = await resolveRegionViaIsolatedSemanticEngine(unit, normalizedFile, this.semanticEngineRunner);
        if (resolved.state === "pending") {
          resolved = resolveRegion({
            previousContent: unit.content,
            currentFileContent: normalizedFile,
            anchors: unit.anchors,
          });
        }
      } else if (unit.scope === "file") {
        resolved = {
          state: "resolved",
          method: "whole-file",
          content: normalizedFile,
          startLine: 1,
          endLine: lineCount(normalizedFile),
        };
      } else {
        resolved = resolveRegion({
          previousContent: unit.content,
          currentFileContent: normalizedFile,
          anchors: unit.anchors,
        });
      }

      if (resolved.state !== "resolved" && unit.scope === "region") {
        const skipStoredLineSpan =
          semanticEngineInjected && semanticEngineLanguage && resolved.parseBroken === true;
        if (!skipStoredLineSpan) {
          const span = resolveStoredLineSpan(
            normalizedFile,
            unit.startLine,
            unit.endLine,
            unit.observedFileLineCount,
          );
          if (span) resolved = span;
        }
      }

      if (resolved.state !== "resolved") {
        unit.state = "unresolved";
        unit.resolutionMethod = resolved.method;
        results.push(unit);
        continue;
      }

      const nextRevision = revisionFor(resolved.content);
      const changed = nextRevision !== unit.revision;
      unit.content = resolved.content;
      unit.revision = nextRevision;
      unit.startLine = resolved.startLine;
      unit.endLine = resolved.endLine;
      unit.state = "resolved";
      unit.resolutionMethod = resolved.method;
      unit.anchors = makeAnchors(resolved.content, { startLine: resolved.startLine });
      delete unit.resolutionError;

      if (changed) {
        unit.changedAt = turn;
        unit.changeCount += 1;
      }

      unit.versions.set(nextRevision, {
        content: resolved.content,
        startLine: resolved.startLine,
        endLine: resolved.endLine,
        observedAt: turn,
      });
      results.push(unit);
    }

    return results;
  }

  list() {
    return [...this.units.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id) {
    return this.units.get(id);
  }

  markUsed(ids, turn) {
    for (const id of ids) {
      const unit = this.units.get(id);
      if (unit) unit.lastUsedAt = turn;
    }
  }

  recover(unitId, revision) {
    const unit = this.units.get(unitId);
    if (!unit) return undefined;
    return unit.versions.get(revision ?? unit.revision);
  }
}
