import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBaseline } from "./baselines.mjs";
import { analyzeCapture } from "./metrics.mjs";
import { buildGoldMap, requiredUnitsFromCapture, unitKey } from "./oracle.mjs";
import { Workspace } from "./workspace.mjs";
import { sha256, stableUnitId } from "../src/hash.mjs";

function parseMutationFamily(name) {
  const parts = String(name).split("/");
  return parts.length >= 2 ? parts[1] : "unknown";
}

function parseRepoId(trace) {
  const url = trace.source?.repository ?? "";
  if (url.includes("flask")) return "flask";
  if (url.includes("express")) return "express";
  if (url.includes("googlesource.com/tools") || url.includes("go-tools")) return "go-tools";
  if (url.includes("ripgrep") || url.includes("BurntSushi/ripgrep")) return "ripgrep";
  if (url.includes("neovim")) return "neovim";
  return trace.name.split("/")[0] ?? "unknown";
}

export async function runTrace(trace, baselineName, { workspaceRoot, baseline } = {}) {
  const active = baseline ?? createBaseline(baselineName);
  const root = workspaceRoot ?? await mkdtemp(join(tmpdir(), "freshctx-trace-"));
  const owned = !workspaceRoot;
  const workspace = await Workspace.fromInitialFiles(root, trace.initialFiles);
  const trackedReads = [];
  const captures = [];

  try {
    for (const event of trace.events) {
      if (event.type === "read") {
        const fileContent = await workspace.read(event.path);
        let content = fileContent;
        if (event.scope === "region" || event.scope === "symbol") {
          const lines = fileContent.split("\n");
          content = lines.slice(event.startLine - 1, event.endLine).join("\n");
        }
        const meta = {
          key: unitKey({
            path: event.path,
            scope: event.scope,
            startLine: event.startLine,
            endLine: event.endLine,
            selector: event.selector,
          }),
          path: event.path,
          scope: event.scope,
          startLine: event.startLine,
          endLine: event.endLine,
          selector: event.selector,
          fileContent,
          unitId: stableUnitId({
            path: event.path,
            scope: event.scope,
            selector: event.selector,
            startLine: event.startLine,
            endLine: event.endLine,
          }),
          initialContent: content,
        };
        trackedReads.push(meta);
        await active.read(event, content, meta);
        continue;
      }

      if (event.type === "replace-exact") {
        await workspace.replaceExact(event.path, event.expected, event.replacement);
        continue;
      }

      if (event.type === "delete-file") {
        await workspace.delete(event.path);
        continue;
      }

      if (event.type === "capture-request") {
        const goldBytesByKey = await buildGoldMap(workspace, event.requiredUnits, trackedReads);
        const requiredUnits = requiredUnitsFromCapture(event, goldBytesByKey, trackedReads);
        const result = await active.capture(event, workspace);
        const priorPayloadText = captures.at(-1)?.payloadText ?? "";
        const metrics = analyzeCapture({
          baseline: active.name ?? baselineName,
          payloadText: result.payloadText,
          payloadBytes: Buffer.byteLength(result.payloadText, "utf8"),
          projectionText: result.projectionText,
          trackedReads,
          requiredUnits,
          goldBytesByKey,
          priorPayloadText,
          telemetry: result.telemetry,
        });
        captures.push({
          event,
          requiredUnits,
          payloadText: result.payloadText,
          payloadSha256: sha256(result.payloadText),
          metrics,
          telemetry: result.telemetry,
        });
      }
    }

    return {
      traceName: trace.name,
      repo: parseRepoId(trace),
      mutationFamily: parseMutationFamily(trace.name),
      baseline: baselineName,
      captures,
      trackedReads,
    };
  } finally {
    if (owned) await rm(root, { recursive: true, force: true });
  }
}

export function finalCapture(result) {
  return result.captures.at(-1) ?? null;
}
