import { makeAnchors, resolveRegion } from "./anchors.mjs";
import { normalizePath, revisionFor, stableUnitId } from "./hash.mjs";

function lineCount(content) {
  return String(content).replaceAll("\r\n", "\n").split("\n").length;
}

async function readSource(provider, filePath) {
  if (typeof provider === "function") return provider(filePath);
  if (provider instanceof Map) return provider.get(filePath);
  if (provider && typeof provider === "object") return provider[filePath];
  throw new TypeError("source provider must be a function, Map, or object");
}

export class FreshRegistry {
  constructor() {
    this.units = new Map();
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
      const resolved = unit.scope === "file"
        ? {
            state: "resolved",
            method: "whole-file",
            content: normalizedFile,
            startLine: 1,
            endLine: lineCount(normalizedFile),
          }
        : resolveRegion({
            previousContent: unit.content,
            currentFileContent: normalizedFile,
            anchors: unit.anchors,
          });

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
