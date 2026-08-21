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
 */
export function resolveRegionByStructuralConsensus({
  previousContent,
  currentFileContent,
  anchors,
  minSupportingLines = 2,
}) {
  const previousLines = splitLines(previousContent);
  const currentLines = splitLines(String(currentFileContent).replaceAll("\r\n", "\n"));
  const normalizedCurrent = currentLines.map(normalizedLine);
  const lineCount = anchors?.lineCount ?? previousLines.length;
  const uniqueInCurrent = occurrenceCounts(currentLines);

  const votes = new Map();
  for (let index = 0; index < previousLines.length; index += 1) {
    const normalized = normalizedLine(previousLines[index]);
    if (normalized.length === 0 || uniqueInCurrent.get(normalized) !== 1) continue;

    const currentIndex = normalizedCurrent.indexOf(normalized);
    if (currentIndex === -1) continue;

    const inferredStart = currentIndex - index;
    if (inferredStart < 0 || inferredStart + lineCount > currentLines.length) continue;

    const bucket = votes.get(inferredStart) ?? { start: inferredStart, support: 0, lines: [] };
    bucket.support += 1;
    bucket.lines.push(normalized);
    votes.set(inferredStart, bucket);
  }

  if (votes.size === 0) {
    return { state: "unresolved", method: "structural-anchors-not-found" };
  }

  const candidates = [...votes.values()].map((candidate) => ({
    ...candidate,
    locationDelta: Math.abs(candidate.start + 1 - (anchors?.startLine ?? candidate.start + 1)),
  }));

  candidates.sort((a, b) =>
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

  const end = best.start + lineCount - 1;
  const content = currentLines.slice(best.start, end + 1).join("\n");
  const duplicateRegions = candidates.filter(
    (candidate) =>
      candidate.support >= minSupportingLines &&
      candidate.start !== best.start &&
      currentLines.slice(candidate.start, candidate.start + lineCount).join("\n") === content,
  );
  if (duplicateRegions.length > 0) {
    return { state: "unresolved", method: "duplicate-structural-candidates" };
  }

  return {
    state: "resolved",
    method: "structural-anchors",
    content,
    startLine: best.start + 1,
    endLine: end + 1,
    support: best.support,
  };
}
