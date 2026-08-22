#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { makeAnchors, resolveRegion } from "../src/anchors.mjs";
import { resolveRegionByStructuralConsensus } from "../src/structural-consensus.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const NEOVIM_LOCKED_COMMIT = "2dd6e9d6a2482069cfe9d12a09f761c5713f246b";
const COMMON_LAST = new Set(["}", "end", ")", "];", "},", "};"]);
const INTERIOR_TAG = "// lab-unique-last-interior-7cdc";

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

function extractRegion(content, startLine, endLine) {
  return splitLines(content).slice(startLine - 1, endLine).join("\n");
}

function applyInsert(content, startLine, inserted) {
  const lines = splitLines(content);
  lines.splice(startLine - 1, 0, ...splitLines(inserted));
  return lines.join("\n");
}

function replaceExact(content, expected, replacement) {
  if (!content.includes(expected)) return null;
  return content.replace(expected, replacement);
}

function boundaryPairs(current, anchors) {
  const currentLines = splitLines(current);
  const normalized = currentLines.map(normalizedLine);
  const starts = [];
  const ends = [];
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === anchors.first) starts.push(index);
    if (normalized[index] === anchors.last) ends.push(index);
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
  candidates.sort(
    (a, b) =>
      a.spanDelta - b.spanDelta ||
      a.locationDelta - b.locationDelta ||
      a.start - b.start ||
      a.end - b.end,
  );
  return candidates;
}

function uniqueLastAfter(lines, last, startIndex) {
  const needle = normalizedLine(last);
  let count = 0;
  for (let index = startIndex; index < lines.length; index += 1) {
    if (normalizedLine(lines[index]) === needle) count += 1;
  }
  return count === 1;
}

function competingPair(firstLine, lastLine, lineCount) {
  const lines = [firstLine];
  for (let index = 1; index < lineCount - 1; index += 1) {
    lines.push(`\t// lab-unique-last competing interior ${index}`);
  }
  lines.push(lastLine);
  return lines.join("\n");
}

function firstMeaningfulLine(previous) {
  return splitLines(previous).find((line) => normalizedLine(line).length > 0) ?? "";
}

function interiorEdit(previous) {
  const lines = splitLines(previous);
  const counts = occurrenceCounts(lines);
  const first = normalizedLine(lines[0] ?? "");
  const last = normalizedLine(lines.at(-1) ?? "");
  const uniqueInteriors = [];
  const commonInteriors = [];
  for (let index = 1; index < lines.length - 1; index += 1) {
    const normalized = normalizedLine(lines[index]);
    if (normalized.length === 0) continue;
    if (normalized === first || normalized === last) continue;
    if (counts.get(normalized) === 1) uniqueInteriors.push(index);
    else commonInteriors.push(index);
  }
  if (commonInteriors.length > 0) {
    const index = commonInteriors[0];
    const next = [...lines];
    next[index] = `${next[index]} ${INTERIOR_TAG}`;
    return { next: next.join("\n"), uniqueInteriorCount: uniqueInteriors.length };
  }
  if (uniqueInteriors.length >= 3) {
    const index = uniqueInteriors[0];
    const next = [...lines];
    next[index] = `${next[index]} ${INTERIOR_TAG}`;
    return { next: next.join("\n"), uniqueInteriorCount: uniqueInteriors.length - 1 };
  }
  return null;
}

function evaluateMutation(previous, current, anchors) {
  const production = resolveRegion({
    previousContent: previous,
    currentFileContent: current,
    anchors,
  });
  const pairs = boundaryPairs(current, anchors);
  const structural = resolveRegionByStructuralConsensus({
    previousContent: previous,
    currentFileContent: current,
    anchors,
    currentBoundaryPairs: pairs,
  });
  const best = pairs[0];
  const second = pairs[1];
  const tied =
    Boolean(second) &&
    best.spanDelta === second.spanDelta &&
    best.locationDelta === second.locationDelta;
  return { production, structural, pairs, tied };
}

function probeRegion(fileContent, unit) {
  const previous = extractRegion(fileContent, unit.startLine, unit.endLine);
  const anchors = makeAnchors(previous, { startLine: unit.startLine });
  if (!anchors.first || !anchors.last) return { reject: "missing-boundary" };
  if (COMMON_LAST.has(anchors.last)) return { reject: "common-closer" };
  const originalLines = splitLines(fileContent);
  if (!uniqueLastAfter(originalLines, anchors.last, unit.startLine - 1)) {
    return { reject: "last-not-unique-after-start" };
  }
  const lineCount = splitLines(previous).length;
  if (lineCount < 5) return { reject: "too-small" };
  if (unit.startLine <= lineCount) return { reject: "no-room-for-competing-pair" };
  const edited = interiorEdit(previous);
  if (!edited || edited.uniqueInteriorCount < 2) return { reject: "insufficient-unique-interiors" };

  const insertAt = unit.startLine - lineCount;
  const lastRaw = splitLines(previous).findLast((line) => normalizedLine(line).length > 0);
  const inserted = competingPair(firstMeaningfulLine(previous), lastRaw, lineCount);
  let mutated = applyInsert(fileContent, insertAt, inserted);
  mutated = replaceExact(mutated, previous, edited.next);
  if (!mutated) return { reject: "interior-replace-failed" };

  const currentLines = splitLines(mutated);
  const relocatedStart = unit.startLine + lineCount;
  if (!uniqueLastAfter(currentLines, anchors.last, relocatedStart - 1)) {
    return { reject: "last-not-unique-after-inferred-start" };
  }

  const result = evaluateMutation(previous, mutated, anchors);
  if (!result.tied) {
    return {
      reject: "no-first-last-tie",
      debug: {
        last: anchors.last,
        first: anchors.first,
        lineCount,
        insertAt,
        top: result.pairs.slice(0, 4),
        production: result.production.method,
        structural: result.structural.method,
      },
      ...result,
    };
  }
  if (result.production.method === "exact") return { reject: "exact-short-circuit", ...result };
  if (result.production.method === "boundary-anchors") {
    return { reject: "boundary-anchors-won", ...result };
  }

  const gold = extractRegion(mutated, relocatedStart, relocatedStart + lineCount - 1);
  return {
    accept: true,
    unit,
    relocatedStart,
    relocatedEnd: relocatedStart + lineCount - 1,
    gold,
    productionMethod: result.production.method,
    structuralMethod: result.structural.method,
    structuralState: result.structural.state,
    pairCount: result.pairs.length,
    uniqueInteriorCount: edited.uniqueInteriorCount,
  };
}

function matchBraces(lines, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < lines.length; index += 1) {
    for (const char of lines[index]) {
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
  }
  return -1;
}

function goUnits(path, content) {
  const lines = splitLines(content);
  const units = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(?:func\b|type\s+\w+\s+struct\b)/u.exec(lines[index]);
    if (!match) continue;
    const openIndex = lines.slice(index).findIndex((line) => line.includes("{"));
    if (openIndex === -1) continue;
    const absoluteOpen = index + openIndex;
    const closeIndex = matchBraces(lines, absoluteOpen);
    if (closeIndex === -1) continue;
    const name = lines[index].replace(/\s+/gu, " ").slice(0, 80);
    units.push({
      path,
      selector: `${name}.fn`,
      startLine: index + 1,
      endLine: closeIndex + 1,
      kind: "function-or-struct",
    });
    if (closeIndex - absoluteOpen >= 6) {
      units.push({
        path,
        selector: `${name}.body`,
        startLine: absoluteOpen + 2,
        endLine: closeIndex,
        kind: "body-without-outer-braces",
      });
    }
  }
  return units;
}

function luaUnits(path, content) {
  const lines = splitLines(content);
  const units = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*function\b/u.test(lines[index])) continue;
    let depth = 0;
    let end = -1;
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      const text = lines[cursor];
      if (/\bfunction\b/u.test(text)) depth += 1;
      if (/\bend\b/u.test(text)) {
        depth -= 1;
        if (depth === 0) {
          end = cursor;
          break;
        }
      }
    }
    if (end === -1) continue;
    const name = lines[index].replace(/\s+/gu, " ").slice(0, 80);
    units.push({
      path,
      selector: `${name}.fn`,
      startLine: index + 1,
      endLine: end + 1,
      kind: "lua-function",
    });
    if (end - index >= 6) {
      units.push({
        path,
        selector: `${name}.body`,
        startLine: index + 2,
        endLine: end,
        kind: "lua-body",
      });
    }
  }
  return units;
}

function cUnits(path, content) {
  const lines = splitLines(content);
  const units = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^[a-zA-Z_].*\([^;]*$/.test(lines[index])) continue;
    if (/\b(if|for|while|switch|return|sizeof)\b/.test(lines[index])) continue;
    const openIndex = lines.slice(index, index + 4).findIndex((line) => line.trim() === "{");
    if (openIndex === -1) continue;
    const absoluteOpen = index + openIndex;
    const closeIndex = matchBraces(lines, absoluteOpen);
    if (closeIndex === -1 || closeIndex - index < 5) continue;
    const name = lines[index].replace(/\s+/gu, " ").slice(0, 80);
    units.push({
      path,
      selector: `${name}.fn`,
      startLine: index + 1,
      endLine: closeIndex + 1,
      kind: "c-function",
    });
    if (closeIndex - absoluteOpen >= 6) {
      units.push({
        path,
        selector: `${name}.body`,
        startLine: absoluteOpen + 2,
        endLine: closeIndex,
        kind: "c-body",
      });
    }
  }
  return units;
}

async function walkFiles(root, predicate) {
  const out = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "testdata" || entry.name === "node_modules") continue;
        await visit(full);
        continue;
      }
      if (entry.isFile() && predicate(full)) out.push(full);
    }
  }
  await visit(root);
  return out;
}

async function probeRepo({ repoId, commit, extensions, unitFn, limitHits = 5 }) {
  const repoRoot = join(ROOT, "bench/repos", repoId);
  try {
    await stat(repoRoot);
  } catch {
    return { repoId, missing: true, hits: [], rejects: {} };
  }
  const files = await walkFiles(repoRoot, (full) => extensions.some((ext) => full.endsWith(ext)));
  const rejects = {};
  const hits = [];
  const nearMisses = [];
  for (const file of files) {
    const content = String(await readFile(file, "utf8")).replaceAll("\r\n", "\n");
    const rel = relative(repoRoot, file);
    for (const unit of unitFn(rel, content)) {
      const result = probeRegion(content, unit);
      if (result.reject) {
        rejects[result.reject] = (rejects[result.reject] ?? 0) + 1;
        if (
          nearMisses.length < 8 &&
          (result.reject === "no-first-last-tie" ||
            result.reject === "last-not-unique-after-inferred-start" ||
            result.reject === "boundary-anchors-won")
        ) {
          nearMisses.push({
            path: unit.path,
            selector: unit.selector,
            startLine: unit.startLine,
            endLine: unit.endLine,
            reject: result.reject,
            debug: result.debug ?? null,
            productionMethod: result.production?.method,
            structuralMethod: result.structural?.method,
          });
        }
        continue;
      }
      hits.push({
        repoId,
        commit,
        path: unit.path,
        selector: unit.selector,
        kind: unit.kind,
        startLine: unit.startLine,
        endLine: unit.endLine,
        relocatedStart: result.relocatedStart,
        relocatedEnd: result.relocatedEnd,
        productionMethod: result.productionMethod,
        structuralMethod: result.structuralMethod,
        structuralState: result.structuralState,
        pairCount: result.pairCount,
        uniqueInteriorCount: result.uniqueInteriorCount,
      });
      if (hits.length >= limitHits) {
        return { repoId, missing: false, files: files.length, hits, rejects, nearMisses };
      }
    }
  }
  return { repoId, missing: false, files: files.length, hits, rejects, nearMisses };
}

const reports = [];
reports.push(
  await probeRepo({
    repoId: "go-tools",
    commit: GO_TOOLS_LOCKED_COMMIT,
    extensions: [".go"],
    unitFn: goUnits,
  }),
);
if (reports[0].hits.length === 0) {
  reports.push(
    await probeRepo({
      repoId: "neovim",
      commit: NEOVIM_LOCKED_COMMIT,
      extensions: [".c", ".h", ".lua"],
      unitFn: (path, content) =>
        path.endsWith(".lua") ? luaUnits(path, content) : cUnits(path, content),
    }),
  );
}

process.stdout.write(`${JSON.stringify({ reports }, null, 2)}\n`);
