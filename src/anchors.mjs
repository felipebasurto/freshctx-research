import { resolveRegionByStructuralConsensus } from "./structural-consensus.mjs";

function splitLines(value) {
  return String(value).replaceAll("\r\n", "\n").split("\n");
}

function normalizedLine(value) {
  return value.trim().replace(/\s+/gu, " ");
}

function meaningfulLines(lines) {
  return lines
    .map((text, index) => ({ text: normalizedLine(text), index }))
    .filter((line) => line.text.length > 0);
}

function allSubstringIndexes(haystack, needle) {
  if (needle.length === 0) return [];
  const indexes = [];
  let cursor = 0;

  while (cursor <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index === -1) break;
    indexes.push(index);
    cursor = index + Math.max(1, needle.length);
  }

  return indexes;
}

function lineForOffset(value, offset) {
  return value.slice(0, offset).split("\n").length;
}

export function makeAnchors(content, { startLine = 1 } = {}) {
  const lines = splitLines(content);
  const meaningful = meaningfulLines(lines);

  return {
    first: meaningful.at(0)?.text ?? "",
    last: meaningful.at(-1)?.text ?? "",
    lineCount: lines.length,
    startLine,
  };
}

/**
 * Resolve an observed region against the current full file.
 *
 * Resolution is intentionally conservative. Exact content wins. Otherwise we
 * use the first and last meaningful boundary lines and require a unique best
 * candidate by expected span and previous location. A tie is unresolved.
 */
function boundariesMatchAtStoredStart(currentLines, anchors, lineCount) {
  const expectedStartLine = anchors?.startLine;
  const first = anchors?.first ?? "";
  const last = anchors?.last ?? "";
  if (expectedStartLine == null || first.length === 0 || last.length === 0) {
    return false;
  }

  const normalized = currentLines.map(normalizedLine);
  const storedStart = expectedStartLine - 1;
  const storedEnd = storedStart + lineCount - 1;
  if (storedEnd >= normalized.length) return false;
  return normalized[storedStart] === first && normalized[storedEnd] === last;
}

export function resolveRegion({ previousContent, currentFileContent, anchors }) {
  const previous = String(previousContent);
  const current = String(currentFileContent).replaceAll("\r\n", "\n");
  const exactIndexes = allSubstringIndexes(current, previous);

  if (previous.length > 0 && exactIndexes.length === 1) {
    const exactIndex = exactIndexes[0];
    const exactStartLine = lineForOffset(current, exactIndex);
    const lineCount = splitLines(previous).length;
    const expectedStartLine = anchors?.startLine;
    let preferStoredRegion = false;

    if (expectedStartLine != null && exactStartLine !== expectedStartLine) {
      const currentLines = splitLines(current);
      const storedStart = expectedStartLine - 1;
      const storedEnd = storedStart + lineCount - 1;
      if (storedEnd < currentLines.length) {
        const storedContent = currentLines.slice(storedStart, storedEnd + 1).join("\n");
        preferStoredRegion =
          storedContent !== previous &&
          boundariesMatchAtStoredStart(currentLines, anchors, lineCount);
      }
    }

    if (!preferStoredRegion) {
      return {
        state: "resolved",
        method: "exact",
        content: previous,
        startLine: exactStartLine,
        endLine: exactStartLine + lineCount - 1,
      };
    }
  }

  const first = anchors?.first ?? "";
  const last = anchors?.last ?? "";
  if (first.length === 0 || last.length === 0) {
    return { state: "unresolved", method: "missing-boundary-anchor" };
  }

  const currentLines = splitLines(current);
  const normalized = currentLines.map(normalizedLine);
  const starts = [];
  const ends = [];

  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === first) starts.push(index);
    if (normalized[index] === last) ends.push(index);
  }

  const candidates = [];
  for (const start of starts) {
    for (const end of ends) {
      if (end < start) continue;
      const span = end - start + 1;
      candidates.push({
        start,
        end,
        spanDelta: Math.abs(span - (anchors.lineCount ?? span)),
        locationDelta: Math.abs(start + 1 - (anchors.startLine ?? start + 1)),
      });
    }
  }

  if (candidates.length === 0) {
    const structural = resolveRegionByStructuralConsensus({
      previousContent: previous,
      currentFileContent: current,
      anchors,
    });
    if (structural.state === "resolved") return structural;
    return { state: "unresolved", method: "anchors-not-found" };
  }

  candidates.sort((a, b) =>
    a.spanDelta - b.spanDelta ||
    a.locationDelta - b.locationDelta ||
    a.start - b.start ||
    a.end - b.end,
  );

  const best = candidates[0];
  const second = candidates[1];
  if (
    second &&
    best.spanDelta === second.spanDelta &&
    best.locationDelta === second.locationDelta
  ) {
    const structural = resolveRegionByStructuralConsensus({
      previousContent: previous,
      currentFileContent: current,
      anchors,
      currentBoundaryPairs: candidates,
    });
    if (structural.state === "resolved") return structural;
    return { state: "unresolved", method: "ambiguous-boundary-anchors" };
  }

  const expectedLineCount = anchors.lineCount ?? best.end - best.start + 1;
  let end = best.end;
  const span = end - best.start + 1;

  // A displaced first+last pair with missing interiors is not the deleted unit.
  if (
    span < expectedLineCount &&
    best.locationDelta > 0 &&
    anchors.startLine != null
  ) {
    return { state: "unresolved", method: "displaced-shrunk-boundary-anchors" };
  }

  // When the first-to-last span grew but the prefix before the last anchor is
  // unchanged, treat the tail as append-inside-before-closer and crop to the
  // original lineCount (oracle: first line + lineCount). Interior edits change
  // the prefix and keep the full grown span.
  if (span > expectedLineCount && previous.length > 0 && expectedLineCount > 1) {
    const previousLines = splitLines(previous);
    const candidateLines = currentLines.slice(best.start, end + 1);
    const prefixLength = expectedLineCount - 1;
    const prefixStable = previousLines
      .slice(0, prefixLength)
      .every((line, index) => normalizedLine(line) === normalizedLine(candidateLines[index] ?? ""));
    if (prefixStable) {
      end = best.start + expectedLineCount - 1;
    }
  }

  return {
    state: "resolved",
    method: "boundary-anchors",
    content: currentLines.slice(best.start, end + 1).join("\n"),
    startLine: best.start + 1,
    endLine: end + 1,
  };
}
