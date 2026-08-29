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

const SIDECAR_TREE_SITTER_EXTENSIONS = new Set([".py", ".js", ".mjs", ".cjs", ".ts", ".tsx"]);

function sidecarTreeSitterLanguage(path) {
  const base = String(path).split("/").at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  const extension = dot === -1 ? "" : base.slice(dot).toLowerCase();
  return SIDECAR_TREE_SITTER_EXTENSIONS.has(extension);
}

function sliceFileLines(normalizedFile, startLine, endLine) {
  const lines = normalizedFile.split("\n");
  return lines.slice(startLine - 1, endLine).join("\n");
}

function sidecarFailureMethod(parsed) {
  if (parsed?.error === "ambiguous") return "sidecar-ambiguous";
  if (parsed?.error === "parse-broken") return "sidecar-unresolved";
  return "sidecar-unresolved";
}

function sidecarRefreshBlocked(parsed) {
  return parsed?.error === "parse-broken";
}

async function runSidecar(sidecarRunner, path, normalizedFile) {
  if (!sidecarRunner) {
    return { state: "unresolved", method: "sidecar-missing" };
  }
  let parsed;
  try {
    parsed = await sidecarRunner({ path, bytes: normalizedFile });
  } catch {
    return { state: "unresolved", method: "sidecar-error" };
  }
  if (!parsed) {
    return { state: "unresolved", method: "sidecar-unresolved" };
  }
  return { state: "parsed", parsed };
}

async function invokeSidecar(sidecarRunner, path, normalizedFile) {
  const invoked = await runSidecar(sidecarRunner, path, normalizedFile);
  if (invoked.state !== "parsed") return invoked;
  if (sidecarRefreshBlocked(invoked.parsed)) {
    return { state: "unresolved", method: sidecarFailureMethod(invoked.parsed) };
  }
  if (invoked.parsed.error === "unresolved" || (invoked.parsed.units ?? []).length === 0) {
    return { state: "unresolved", method: "sidecar-unresolved" };
  }
  return invoked;
}

function sidecarUnitsForSelector(units, selector) {
  if (!selector) return [];
  return (units ?? []).filter(
    (candidate) => candidate.selector === selector || candidate.qualifiedSelector === selector,
  );
}

function sidecarUnitsOverlappingRead(units, startLine, endLine) {
  return (units ?? [])
    .filter((candidate) => candidate.endLine >= startLine && candidate.startLine <= endLine)
    .sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
}

function sidecarUnitsChangedInRead(units, normalizedFile, readContent, startLine, endLine) {
  const overlapping = sidecarUnitsOverlappingRead(units, startLine, endLine);
  const previous = String(readContent);
  return overlapping.filter((match) => {
    const currentSlice = sliceFileLines(normalizedFile, match.startLine, match.endLine);
    const previousSlice = sliceFileLines(previous, match.startLine, match.endLine);
    return currentSlice !== previousSlice;
  });
}

function resolveSidecarUnitsProjection(normalizedFile, units) {
  if (units.length === 0) return null;
  const content = units
    .map((match) => sliceFileLines(normalizedFile, match.startLine, match.endLine))
    .join("\n");
  return {
    state: "resolved",
    method: "sidecar",
    content,
    startLine: units[0].startLine,
    endLine: units[units.length - 1].endLine,
  };
}

function resolveSidecarUnitSpan(normalizedFile, match) {
  return {
    state: "resolved",
    method: "sidecar",
    content: sliceFileLines(normalizedFile, match.startLine, match.endLine),
    startLine: match.startLine,
    endLine: match.endLine,
  };
}

async function resolveSymbolUnit(unit, normalizedFile, sidecarRunner) {
  const invoked = await invokeSidecar(sidecarRunner, unit.path, normalizedFile);
  if (invoked.state !== "parsed") return invoked;
  const matches = (invoked.parsed.units ?? []).filter(
    (candidate) => candidate.selector === unit.selector || candidate.qualifiedSelector === unit.selector,
  );
  if (matches.length === 0) {
    return { state: "unresolved", method: "sidecar-unresolved" };
  }
  if (matches.length > 1) {
    return { state: "unresolved", method: "sidecar-ambiguous" };
  }
  return resolveSidecarUnitSpan(normalizedFile, matches[0]);
}

async function resolveFileViaSidecar(path, normalizedFile, sidecarRunner, unit) {
  const invoked = await runSidecar(sidecarRunner, path, normalizedFile);
  if (invoked.state !== "parsed") return invoked;
  if (sidecarRefreshBlocked(invoked.parsed)) {
    return { state: "unresolved", method: sidecarFailureMethod(invoked.parsed) };
  }
  const parseError = invoked.parsed.error;
  if (parseError === "sidecar-missing" || parseError === "sidecar-error") {
    return { state: "unresolved", method: "sidecar-error" };
  }
  const parsedUnits = invoked.parsed.units ?? [];
  if (parseError === "ambiguous" || ((parseError === null || parseError === "unresolved") && parsedUnits.length === 0)) {
    return {
      state: "resolved",
      method: "sidecar",
      content: normalizedFile,
      startLine: 1,
      endLine: lineCount(normalizedFile),
    };
  }
  if (parseError !== null) {
    return { state: "unresolved", method: "sidecar-unresolved" };
  }
  const changedUnits = sidecarUnitsChangedInRead(
    parsedUnits,
    normalizedFile,
    unit.content,
    unit.startLine,
    unit.endLine,
  );
  const unitsToProject =
    changedUnits.length > 0
      ? changedUnits
      : sidecarUnitsOverlappingRead(parsedUnits, unit.startLine, unit.endLine);
  const projected = resolveSidecarUnitsProjection(normalizedFile, unitsToProject);
  if (!projected) {
    return { state: "unresolved", method: "sidecar-unresolved" };
  }
  return projected;
}

async function resolveRegionViaSidecar(unit, normalizedFile, sidecarRunner) {
  const invoked = await runSidecar(sidecarRunner, unit.path, normalizedFile);
  if (invoked.state !== "parsed") return invoked;
  if (sidecarRefreshBlocked(invoked.parsed)) {
    return {
      state: "unresolved",
      method: sidecarFailureMethod(invoked.parsed),
      parseBroken: true,
    };
  }
  if (!unit.selector) {
    return { state: "pending" };
  }
  const matches = sidecarUnitsForSelector(invoked.parsed.units, unit.selector);
  if (matches.length === 0) {
    return { state: "pending" };
  }
  if (matches.length > 1) {
    return { state: "unresolved", method: "sidecar-ambiguous" };
  }
  return resolveSidecarUnitSpan(normalizedFile, matches[0]);
}

export class FreshRegistry {
  constructor({ sidecarRunner = null } = {}) {
    this.units = new Map();
    this.sidecarRunner = sidecarRunner;
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
      const sidecarLanguage = sidecarTreeSitterLanguage(unit.path);
      const sidecarInjected = Boolean(this.sidecarRunner);
      let resolved;
      if (unit.scope === "symbol") {
        resolved = await resolveSymbolUnit(unit, normalizedFile, this.sidecarRunner);
      } else if (sidecarInjected && sidecarLanguage && unit.scope === "file") {
        resolved = await resolveFileViaSidecar(unit.path, normalizedFile, this.sidecarRunner, unit);
      } else if (sidecarInjected && sidecarLanguage && unit.scope === "region") {
        resolved = await resolveRegionViaSidecar(unit, normalizedFile, this.sidecarRunner);
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
          sidecarInjected && sidecarLanguage && resolved.parseBroken === true;
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
