import { pathToFileURL } from "node:url";

import { FreshCtxEngine } from "../src/engine.mjs";
import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { annotateReadMessage } from "../src/transcript.mjs";
import { fixture } from "./fixture.mjs";

function count(value, needle) {
  return needle.length === 0 ? 0 : value.split(needle).length - 1;
}

function messageText(messages) {
  return messages
    .flatMap((message) => {
      if (typeof message.content === "string") return [message.content];
      if (!Array.isArray(message.content)) return [];
      return message.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text);
    })
    .join("\n");
}

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function distribution(values) {
  return {
    min: Math.min(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: Math.max(...values),
  };
}

function commonPrefixBytes(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function changedBytes(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  let prefix = 0;
  while (prefix < Math.min(left.length, right.length) && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < Math.min(left.length - prefix, right.length - prefix) &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) suffix += 1;
  return Math.max(0, right.length - prefix - suffix);
}

async function runOne() {
  const engine = new FreshCtxEngine();
  const unit = engine.trackRead({
    path: fixture.path,
    content: fixture.initialRegion,
    startLine: 7,
    scope: "region",
  });
  const historical = annotateReadMessage({ role: "tool", content: fixture.initialRegion }, unit);
  const before = JSON.stringify((await engine.buildRequest([historical, historical], {
    sourceProvider: { [fixture.path]: fixture.initialFile },
    task: fixture.task,
    budgetChars: 4_000,
  })).messages);

  engine.advanceTurn();
  const request = await engine.buildRequest([historical, historical], {
    sourceProvider: { [fixture.path]: fixture.currentFile },
    task: fixture.task,
    budgetChars: 4_000,
  });
  const payload = JSON.stringify(request.messages);
  const visibleText = messageText(request.messages);
  const currentCopies = count(visibleText, fixture.currentRegion);
  const staleCopies = count(visibleText, fixture.initialRegion);
  const exactUnits = decodeProjectionUnits(request.projection.text).filter(
    (decoded) => decoded.content === fixture.currentRegion,
  ).length;
  const workspaceChangedBytes = changedBytes(fixture.initialFile, fixture.currentFile);
  const payloadChangedBytes = changedBytes(before, payload);

  return {
    hash: sha256(payload),
    telemetry: request.telemetry,
    correctness: {
      exactCurrentRate: exactUnits / Math.max(1, request.projection.selected.length),
      requiredRecall: currentCopies > 0 ? 1 : 0,
      staleUnitRate: staleCopies > 0 ? 1 : 0,
      staleBytes: staleCopies * Buffer.byteLength(fixture.initialRegion),
      duplicateCurrentUnits: Math.max(0, currentCopies - 1),
      currentCopies,
      unresolvedUnits: request.projection.omitted.filter((item) => item.reason === "unresolved").length,
    },
    layout: {
      cachePrefixReuse: commonPrefixBytes(before, payload) / Math.max(1, Buffer.byteLength(before)),
      workspaceChangedBytes,
      payloadChangedBytes,
      contextDeltaAmplification: payloadChangedBytes / Math.max(1, workspaceChangedBytes),
    },
  };
}

export async function runCtxBench({ warmups = 10, repetitions = 100 } = {}) {
  for (let index = 0; index < warmups; index += 1) await runOne();
  const runs = [];
  for (let index = 0; index < repetitions; index += 1) runs.push(await runOne());
  const first = runs[0];
  const hashes = new Set(runs.map((run) => run.hash));
  const hashCounts = new Map();
  for (const run of runs) hashCounts.set(run.hash, (hashCounts.get(run.hash) ?? 0) + 1);
  const dominantHashCount = Math.max(...hashCounts.values());
  const stages = ["refreshMs", "rewriteMs", "projectMs", "serializeMs", "totalMs"];
  const latencyMs = Object.fromEntries(
    stages.map((stage) => [stage, distribution(runs.map((run) => run.telemetry[stage]))]),
  );

  return {
    schemaVersion: 1,
    label: "synthetic",
    fixture: fixture.name,
    warmups,
    repetitions,
    correctness: first.correctness,
    layout: first.layout,
    payload: {
      bytes: first.telemetry.payloadBytes,
      projectionBytes: first.telemetry.projectionBytes,
      sha256: first.hash,
      deterministicHashAgreement: dominantHashCount / repetitions,
    },
    latencyMs,
    hardGates: {
      exactCurrent: first.correctness.exactCurrentRate === 1,
      requiredRecall: first.correctness.requiredRecall === 1,
      zeroStale: first.correctness.staleBytes === 0,
      uniqueCurrent: first.correctness.currentCopies === 1,
      fullyResolved: first.correctness.unresolvedUnits === 0,
      deterministic: hashes.size === 1,
    },
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  console.log(JSON.stringify(await runCtxBench(), null, 2));
}
