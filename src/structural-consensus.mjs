function splitLines(value) {
  return String(value).replaceAll("\r\n", "\n").split("\n");
}

function normalizedLine(value) {
  return value.trim().replace(/\s+/gu, " ");
}

function occurrenceCounts(lines) {
  const counts = new Map();
  for (const line of lines) {
    const normalized = normalizedLine(line);
    if (normalized.length === 0) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return counts;
}

/**
 * Structural-consensus relocation decision procedure.
 *
 * Used by production `resolveRegion` when boundary anchors fail or tie, and by
 * contract tests for interior-line consensus acceptance criteria.
 *
 * Offset-shifted consensus additionally requires a unique surviving
 * first/last boundary pair at the inferred start.
 */
export function resolveRegionByStructuralConsensus({
  previousContent,
  currentFileContent,
  anchors,
  minSupportingLines = 2,
  currentBoundaryPairs = [],
}) {
  const previousLines = splitLines(previousContent);
  const currentLines = splitLines(String(currentFileContent).replaceAll("\r\n", "\n"));
  const normalizedCurrent = currentLines.map(normalizedLine);
  const meaningfulPreviousIndexes = previousLines
    .map((line, index) => ({ index, normalized: normalizedLine(line) }))
    .filter((line) => line.normalized.length > 0)
    .map((line) => line.index);
  const lastBoundaryOffset = meaningfulPreviousIndexes.at(-1);
  const boundaryIndexes = new Set([
    meaningfulPreviousIndexes.at(0),
    meaningfulPreviousIndexes.at(-1),
  ]);
  const lineCount = anchors?.lineCount ?? previousLines.length;
  const uniqueInCurrent = occurrenceCounts(currentLines);
  const storedStartLine = anchors?.startLine ?? null;

  const votes = new Map();
  for (let index = 0; index < previousLines.length; index += 1) {
    const normalized = normalizedLine(previousLines[index]);
    if (normalized.length === 0 || uniqueInCurrent.get(normalized) !== 1) continue;

    const currentIndex = normalizedCurrent.indexOf(normalized);
    if (currentIndex === -1) continue;

    const inferredStart = currentIndex - index;
    if (inferredStart < 0 || inferredStart + lineCount > currentLines.length) continue;

    const bucket = votes.get(inferredStart) ?? {
      start: inferredStart,
      support: 0,
      interiorSupport: 0,
      interiorCurrentIndexes: [],
      lines: [],
    };
    bucket.support += 1;
    if (!boundaryIndexes.has(index)) {
      bucket.interiorSupport += 1;
      bucket.interiorCurrentIndexes.push(currentIndex);
    }
    bucket.lines.push(normalized);
    votes.set(inferredStart, bucket);
  }

  if (votes.size === 0) {
    return { state: "unresolved", method: "structural-anchors-not-found" };
  }

  const candidates = [...votes.values()].map((candidate) => ({
    ...candidate,
    locationDelta:
      storedStartLine === null
        ? 0
        : Math.abs(candidate.start + 1 - storedStartLine),
  }));

  candidates.sort(
    (a, b) =>
      b.support - a.support ||
      a.locationDelta - b.locationDelta ||
      a.start - b.start,
  );

  const best = candidates[0];
  const second = candidates[1];

  if (best.support < minSupportingLines) {
    return { state: "unresolved", method: "insufficient-structural-consensus" };
  }

  if (
    second &&
    best.support === second.support &&
    best.locationDelta === second.locationDelta
  ) {
    return { state: "unresolved", method: "ambiguous-structural-anchors" };
  }

  const shifted = storedStartLine !== null && best.start + 1 !== storedStartLine;
  let corroboratingBoundary = null;
  if (shifted) {
    const firstBoundary = normalizedLine(anchors?.first ?? "");
    const lastBoundary = normalizedLine(anchors?.last ?? "");
    const matchingBoundaries = currentBoundaryPairs.filter((candidate) =>
      Number.isInteger(candidate.start) &&
      Number.isInteger(candidate.end) &&
      candidate.start === best.start &&
      candidate.end >= candidate.start &&
      candidate.end < normalizedCurrent.length &&
      normalizedCurrent[candidate.start] === firstBoundary &&
      normalizedCurrent[candidate.end] === lastBoundary
    );
    if (matchingBoundaries.length !== 1) {
      return { state: "unresolved", method: "offset-shift-without-boundaries" };
    }
    const [matchingBoundary] = matchingBoundaries;
    if (
      matchingBoundary.end !== best.start + lastBoundaryOffset ||
      !best.interiorCurrentIndexes.every(
        (index) => index > matchingBoundary.start && index < matchingBoundary.end,
      )
    ) {
      return { state: "unresolved", method: "offset-shift-without-boundaries" };
    }

    const hasCompetingInteriorConsensus = candidates.some(
      (candidate) =>
        candidate.start !== best.start &&
        candidate.interiorSupport >= best.interiorSupport,
    );
    if (
      best.interiorSupport < minSupportingLines ||
      hasCompetingInteriorConsensus
    ) {
      return { state: "unresolved", method: "ambiguous-structural-anchors" };
    }
    corroboratingBoundary = matchingBoundary;
  }

  const start = best.start;
  const end = corroboratingBoundary?.end ?? best.start + lineCount - 1;
  const content = currentLines.slice(start, end + 1).join("\n");
  const resolvedLineCount = end - start + 1;
  const duplicateRegions = candidates.filter(
    (candidate) =>
      candidate.support >= minSupportingLines &&
      candidate.start !== start &&
      currentLines.slice(candidate.start, candidate.start + resolvedLineCount).join("\n") === content,
  );
  if (duplicateRegions.length > 0) {
    return { state: "unresolved", method: "duplicate-structural-candidates" };
  }

  return {
    state: "resolved",
    method: corroboratingBoundary
      ? "structural-anchors-with-boundaries"
      : "structural-anchors",
    content,
    startLine: start + 1,
    endLine: end + 1,
    support: best.support,
  };
}
