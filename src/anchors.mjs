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

function firstMatchesAtStoredStart(currentLines, anchors) {
  const expectedStartLine = anchors?.startLine;
  const first = anchors?.first ?? "";
  if (expectedStartLine == null || first.length === 0) return false;

  const storedStart = expectedStartLine - 1;
  if (storedStart < 0 || storedStart >= currentLines.length) return false;
  return normalizedLine(currentLines[storedStart]) === first;
}

function prefixStableBeforeLast(previousLines, candidateLines, expectedLineCount) {
  if (expectedLineCount <= 1 || previousLines.length === 0) return false;
  const prefixLength = expectedLineCount - 1;
  return previousLines
    .slice(0, prefixLength)
    .every((line, index) => normalizedLine(line) === normalizedLine(candidateLines[index] ?? ""));
}

function hasNonPrefixLookalikeAtStoredStart(currentLines, anchors, lineCount, previousLines) {
  const storedStart = anchors.startLine - 1;
  const last = anchors?.last ?? "";
  if (last.length === 0) return false;

  const normalized = currentLines.map(normalizedLine);
  for (
    let end = storedStart;
    end < storedStart + lineCount && end < normalized.length;
    end += 1
  ) {
    if (normalized[end] !== last) continue;
    const span = end - storedStart + 1;
    if (span >= lineCount) continue;
    const block = currentLines.slice(storedStart, end + 1);
    const isPrefix = block.every(
      (line, index) => normalizedLine(line) === normalizedLine(previousLines[index] ?? ""),
    );
    if (!isPrefix) return true;
  }

  return false;
}

function contiguousPrefixLengthAt(currentLines, storedStart, previousLines) {
  let prefixLength = 0;
  while (
    prefixLength < previousLines.length &&
    storedStart + prefixLength < currentLines.length &&
    normalizedLine(currentLines[storedStart + prefixLength]) ===
      normalizedLine(previousLines[prefixLength])
  ) {
    prefixLength += 1;
  }
  return prefixLength;
}

function inPlaceGrowAtStoredStart(currentLines, anchors, lineCount, previous) {
  const expectedStartLine = anchors?.startLine;
  const last = anchors?.last ?? "";
  if (expectedStartLine == null || last.length === 0) return false;
  if (!firstMatchesAtStoredStart(currentLines, anchors)) return false;

  const storedStart = expectedStartLine - 1;
  const oldStoredEnd = storedStart + lineCount - 1;
  const normalized = currentLines.map(normalizedLine);
  if (oldStoredEnd >= normalized.length || normalized[oldStoredEnd] === last) return false;

  const previousLines = splitLines(previous);
  const prefixLength = contiguousPrefixLengthAt(currentLines, storedStart, previousLines);
  if (prefixLength === 0) return false;

  for (let end = oldStoredEnd + 1; end < normalized.length; end += 1) {
    if (normalized[end] !== last) continue;
    const span = end - storedStart + 1;
    if (span <= lineCount) continue;
    const candidate = currentLines.slice(storedStart, end + 1).join("\n");
    if (previous.length > 0 && candidate.includes(previous)) continue;
    return true;
  }

  return false;
}

function inPlaceShrinkPrefixAtStoredStart(currentLines, anchors, lineCount, previous) {
  const expectedStartLine = anchors?.startLine;
  if (expectedStartLine == null) return false;
  if (!firstMatchesAtStoredStart(currentLines, anchors)) return false;

  const storedStart = expectedStartLine - 1;
  const previousLines = splitLines(previous);
  const prefixLength = contiguousPrefixLengthAt(currentLines, storedStart, previousLines);

  return prefixLength > 0 && prefixLength < previousLines.length;
}

function resolveInPlaceGrowAtStoredStart(currentLines, anchors, lineCount, previous) {
  if (!inPlaceGrowAtStoredStart(currentLines, anchors, lineCount, previous)) return null;

  const storedStart = anchors.startLine - 1;
  const oldStoredEnd = storedStart + lineCount - 1;
  const last = anchors?.last ?? "";
  const normalized = currentLines.map(normalizedLine);

  for (let end = oldStoredEnd + 1; end < normalized.length; end += 1) {
    if (normalized[end] !== last) continue;
    const span = end - storedStart + 1;
    if (span <= lineCount) continue;
    const candidate = currentLines.slice(storedStart, end + 1).join("\n");
    if (previous.length > 0 && candidate.includes(previous)) continue;
    return {
      state: "resolved",
      method: "boundary-anchors",
      content: candidate,
      startLine: storedStart + 1,
      endLine: end + 1,
    };
  }

  return null;
}

function resolveInPlaceShrinkPrefixAtStoredStart(currentLines, anchors, previous) {
  if (!inPlaceShrinkPrefixAtStoredStart(currentLines, anchors, anchors?.lineCount ?? 0, previous)) {
    return null;
  }

  const storedStart = anchors.startLine - 1;
  const previousLines = splitLines(previous);
  const prefixLength = contiguousPrefixLengthAt(currentLines, storedStart, previousLines);

  return {
    state: "resolved",
    method: "boundary-anchors",
    content: currentLines.slice(storedStart, storedStart + prefixLength).join("\n"),
    startLine: storedStart + 1,
    endLine: storedStart + prefixLength,
  };
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
        if (storedContent !== previous) {
          if (boundariesMatchAtStoredStart(currentLines, anchors, lineCount)) {
            preferStoredRegion = true;
          } else {
            const previousLines = splitLines(previous);
            if (
              !hasNonPrefixLookalikeAtStoredStart(currentLines, anchors, lineCount, previousLines)
            ) {
              const grown = resolveInPlaceGrowAtStoredStart(
                currentLines,
                anchors,
                lineCount,
                previous,
              );
              if (grown) return grown;
              const shrunk = resolveInPlaceShrinkPrefixAtStoredStart(
                currentLines,
                anchors,
                previous,
              );
              if (shrunk) return shrunk;
            }
          }
        }
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
  const previousLines = splitLines(previous);

  // A displaced first+last pair with missing interiors is not the deleted unit.
  if (
    span < expectedLineCount &&
    best.locationDelta > 0 &&
    anchors.startLine != null
  ) {
    return { state: "unresolved", method: "displaced-shrunk-boundary-anchors" };
  }

  // At the stored start, a shrunk span must be a contiguous prefix of previous.
  if (span < expectedLineCount && best.locationDelta === 0 && anchors.startLine != null) {
    const candidateLines = currentLines.slice(best.start, end + 1);
    const isContiguousPrefix = candidateLines.every(
      (line, index) => normalizedLine(line) === normalizedLine(previousLines[index] ?? ""),
    );
    if (!isContiguousPrefix) {
      return { state: "unresolved", method: "displaced-shrunk-boundary-anchors" };
    }
  }

  // When the first-to-last span grew but the prefix before the last anchor is
  // unchanged, treat the tail as append-inside-before-closer and crop to the
  // original lineCount (oracle: first line + lineCount). Interior edits change
  // the prefix and keep the full grown span.
  if (span > expectedLineCount && previous.length > 0 && expectedLineCount > 1) {
    const candidateLines = currentLines.slice(best.start, end + 1);
    if (prefixStableBeforeLast(previousLines, candidateLines, expectedLineCount)) {
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
