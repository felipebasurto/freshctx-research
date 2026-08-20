import { sha256 } from "../src/hash.mjs";

export function unitKey({ path, selector, startLine, endLine, scope = "region" }) {
  return [path, scope, selector ?? "", startLine ?? "", endLine ?? ""].join("\u0000");
}

function extractRegionLines(content, startLine, endLine) {
  return content.split("\n").slice(startLine - 1, endLine).join("\n");
}

function extractAnchoredRegion(content, anchorLine, lineCount) {
  const lines = content.split("\n");
  const index = lines.findIndex((line) => line === anchorLine);
  if (index === -1) {
    throw new Error(`anchor line not found: ${anchorLine}`);
  }
  return lines.slice(index, index + lineCount).join("\n");
}

export async function goldBytesForRead(workspace, read) {
  let content;
  try {
    content = await workspace.read(read.path);
  } catch (error) {
    if (String(error?.message ?? error).includes("ENOENT") || error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
  if (read.scope === "file") return content;

  const lineCount = read.endLine - read.startLine + 1;
  const lineBased = extractRegionLines(content, read.startLine, read.endLine);
  const anchorLine = read.initialContent.split("\n")[0];
  if (lineBased.split("\n")[0] === anchorLine) return lineBased;

  const lines = content.split("\n");
  const anchorMatches = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line === anchorLine);
  if (anchorMatches.length === 1) {
    return lines.slice(anchorMatches[0].index, anchorMatches[0].index + lineCount).join("\n");
  }

  return lineBased;
}

export async function buildGoldMap(workspace, requiredUnits, reads = []) {
  const goldBytesByKey = {};
  for (const read of reads) {
    const key = read.key ?? unitKey(read);
    if (goldBytesByKey[key]) continue;
    goldBytesByKey[key] = await goldBytesForRead(workspace, read);
  }

  for (const unit of requiredUnits) {
    const matchedRead = reads.find(
      (read) =>
        read.path === unit.path &&
        (unit.selector ? read.selector === unit.selector : true),
    );
    const key = matchedRead?.key ??
      unitKey({
        path: unit.path,
        selector: unit.selector,
        startLine: matchedRead?.startLine,
        endLine: matchedRead?.endLine,
        scope: matchedRead?.scope ?? "file",
      });
    if (goldBytesByKey[key]) continue;
    if (matchedRead) {
      goldBytesByKey[key] = await goldBytesForRead(workspace, matchedRead);
    } else {
      goldBytesByKey[key] = await workspace.read(unit.path);
    }
  }

  return goldBytesByKey;
}

function resolveRequiredUnit(eventUnit, trackedReads, goldBytesByKey) {
  const matchedRead = trackedReads.find(
    (read) =>
      read.path === eventUnit.path &&
      (eventUnit.selector ? read.selector === eventUnit.selector : true),
  );
  const scope = matchedRead?.scope ?? (matchedRead?.startLine ? "region" : "file");
  const key = matchedRead?.key ??
    unitKey({
      path: eventUnit.path,
      selector: eventUnit.selector,
      startLine: matchedRead?.startLine,
      endLine: matchedRead?.endLine,
      scope,
    });
  const goldBytes = goldBytesByKey[key];
  if (!goldBytes) {
    throw new Error(`missing gold bytes for required unit ${eventUnit.path}`);
  }
  const digest = sha256(goldBytes);
  if (digest !== eventUnit.sha256) {
    throw new Error(
      `independent oracle mismatch for ${eventUnit.path}: trace declares ${eventUnit.sha256}, workspace has ${digest}`,
    );
  }
  return {
    ...eventUnit,
    key,
    scope,
    startLine: matchedRead?.startLine,
    endLine: matchedRead?.endLine,
  };
}

export function requiredUnitsFromCapture(event, goldBytesByKey, trackedReads) {
  return event.requiredUnits.map((unit) => resolveRequiredUnit(unit, trackedReads, goldBytesByKey));
}
