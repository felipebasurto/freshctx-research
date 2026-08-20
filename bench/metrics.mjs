import { decodeProjectionUnits } from "../src/projector.mjs";
import { sha256 } from "../src/hash.mjs";

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1;
    index += Math.max(1, needle.length);
  }
  return count;
}

function commonPrefixBytes(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

export function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

export function extractCodeUnits(payloadText, baseline) {
  const units = [];

  if (baseline.startsWith("freshctx")) {
    for (const decoded of decodeProjectionUnits(payloadText)) {
      units.push({
        id: decoded.id,
        path: decoded.path,
        content: decoded.content,
        bytes: Buffer.byteLength(decoded.content, "utf8"),
      });
    }
    return units;
  }

  if (baseline === "corvus-file") {
    const markerPattern = /\[corvus-sync:([^\]]+)\] Current whole file follows\.\n?/gu;
    let match;
    while ((match = markerPattern.exec(payloadText)) !== null) {
      const path = match[1];
      const start = match.index + match[0].length;
      const next = payloadText.indexOf("[corvus-sync:", start);
      const content = payloadText.slice(start, next === -1 ? payloadText.length : next).trimEnd();
      units.push({
        id: `corvus:${path}`,
        path,
        content,
        bytes: Buffer.byteLength(content, "utf8"),
      });
    }
    return units;
  }

  if (baseline === "append-only" || baseline === "observation-mask") {
    const readPattern = /\[freshctx:([^\s]+)\s+path=([^\]]+)\]/gu;
    if (baseline === "observation-mask") return units;
    const blocks = payloadText.split(/\n\n/u);
    for (const block of blocks) {
      if (block.startsWith("TASK:")) continue;
      if (readPattern.test(block)) continue;
      if (block.includes("<freshctx")) continue;
      if (block.trim().length === 0) continue;
      units.push({
        id: sha256(block).slice(0, 16),
        path: null,
        content: block,
        bytes: Buffer.byteLength(block, "utf8"),
      });
    }
  }

  return units;
}

export function analyzeCapture({
  baseline,
  payloadText,
  payloadBytes,
  projectionText = "",
  trackedReads,
  requiredUnits,
  goldBytesByKey,
  priorPayloadText = "",
  telemetry = {},
}) {
  const projectedUnits = extractCodeUnits(payloadText, baseline);
  const requiredKeys = requiredUnits.map((unit) => unit.key);
  let requiredHits = 0;

  for (const required of requiredUnits) {
    const goldBytes = goldBytesByKey[required.key];
    const goldDigest = sha256(goldBytes);
    const matched = projectedUnits.some(
      (unit) => unit.path === required.path && sha256(unit.content) === goldDigest,
    );
    const rawMatch = goldBytes.length > 0 && countOccurrences(payloadText, goldBytes) > 0;
    if (matched || rawMatch) {
      requiredHits += 1;
    }
  }

  let staleUnits = 0;
  let staleBytes = 0;
  for (const read of trackedReads) {
    const goldBytes = goldBytesByKey[read.key];
    if (read.initialContent === goldBytes) continue;
    const staleCount = countOccurrences(payloadText, read.initialContent);
    if (staleCount > 0) {
      staleUnits += 1;
      staleBytes += staleCount * Buffer.byteLength(read.initialContent, "utf8");
    }
  }

  let duplicateUnits = 0;
  let duplicateBytes = 0;
  for (const required of requiredUnits) {
    const goldBytes = goldBytesByKey[required.key];
    const copies = countOccurrences(payloadText, goldBytes);
    if (copies > 1) {
      duplicateUnits += copies - 1;
      duplicateBytes += (copies - 1) * Buffer.byteLength(goldBytes, "utf8");
    }
  }

  const exactCurrentUnits = projectedUnits.filter((unit) => {
    const required = requiredUnits.find((item) => item.path === unit.path);
    if (!required) return false;
    return sha256(unit.content) === sha256(goldBytesByKey[required.key]);
  }).length;

  const requiredRecall = requiredUnits.length === 0
    ? 1
    : requiredHits / requiredUnits.length;

  return {
    exactCurrentRate: exactCurrentUnits / Math.max(1, projectedUnits.length),
    requiredRecall,
    staleUnitRate: staleUnits / Math.max(1, trackedReads.length),
    staleBytes,
    duplicateUnits,
    duplicateBytes,
    projectionBytes: Buffer.byteLength(projectionText || payloadText, "utf8"),
    payloadBytes,
    cachePrefixReuse: priorPayloadText
      ? commonPrefixBytes(priorPayloadText, payloadText) / Math.max(1, Buffer.byteLength(priorPayloadText, "utf8"))
      : 1,
    transformP50Ms: telemetry.totalMs ?? 0,
    transformP95Ms: telemetry.totalMs ?? 0,
    trackedCount: trackedReads.length,
    requiredCount: requiredUnits.length,
    requiredKeys,
    projectedCount: projectedUnits.length,
  };
}
