import { pathToFileURL } from "node:url";

import { FreshCtxEngine } from "../src/engine.mjs";
import { annotateReadMessage, stableReadMarker } from "../src/transcript.mjs";
import { fixture } from "./fixture.mjs";

function count(value, needle) {
  return needle.length === 0 ? 0 : value.split(needle).length - 1;
}

function commonPrefixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

function metrics(name, beforePrompt, prompt, trackedCount = 1) {
  const staleCopies = count(prompt, fixture.initialRegion);
  const currentCopies = count(prompt, fixture.currentRegion);
  const snapshotBytes =
    staleCopies * fixture.initialRegion.length + currentCopies * fixture.currentRegion.length;
  const staleBytes = staleCopies * fixture.initialRegion.length;
  const duplicateBytes = Math.max(0, staleCopies + currentCopies - 1) * fixture.currentRegion.length;
  const commonPrefix = commonPrefixLength(beforePrompt, prompt);

  return {
    name,
    promptChars: prompt.length,
    estimatedTokens: Math.ceil(prompt.length / 4),
    staleBytes,
    staleRate: snapshotBytes === 0 ? 0 : staleBytes / snapshotBytes,
    duplicateBytes,
    duplicateRate: snapshotBytes === 0 ? 0 : duplicateBytes / snapshotBytes,
    currentCopies,
    goldRecall: currentCopies > 0 ? 1 : 0,
    unresolvedRate: trackedCount === 0 ? 0 : 0,
    cacheChurnProxy: 1 - commonPrefix / Math.max(1, beforePrompt.length, prompt.length),
  };
}

function prompt(...parts) {
  return [`TASK: ${fixture.task}`, ...parts].join("\n\n");
}

export async function runBenchmark() {
  const appendOnlyBefore = prompt(fixture.initialRegion, fixture.initialRegion);
  const appendOnlyAfter = appendOnlyBefore;
  const rereadAfter = prompt(
    fixture.initialRegion,
    fixture.initialRegion,
    fixture.currentRegion,
  );

  const fileMarker = "[file-sync:src/auth.ts] Current file follows.";
  const fileSyncBefore = prompt(fileMarker, fileMarker, fixture.initialFile);
  const fileSyncAfter = prompt(fileMarker, fileMarker, fixture.currentFile);

  const engine = new FreshCtxEngine();
  const unit = engine.trackRead({
    path: fixture.path,
    content: fixture.initialRegion,
    startLine: 7,
    scope: "region",
  });
  const historical = annotateReadMessage(
    { role: "tool", content: fixture.initialRegion },
    unit,
  );
  const marker = stableReadMarker(unit);
  const freshBeforeProjection = engine.project({ task: fixture.task, budgetChars: 4_000 });
  const freshBefore = prompt(marker, marker, freshBeforeProjection.text);

  engine.advanceTurn();
  const request = await engine.buildRequest([historical, historical], {
    sourceProvider: { [fixture.path]: fixture.currentFile },
    task: fixture.task,
    budgetChars: 4_000,
  });
  const freshAfter = prompt(
    ...request.messages.map((message) =>
      typeof message.content === "string" ? message.content : JSON.stringify(message.content),
    ),
  );
  const unresolved = request.projection.omitted.filter((item) => item.reason === "unresolved").length;

  const runs = [
    metrics("append-only/no-reread", appendOnlyBefore, appendOnlyAfter),
    metrics("append-only/with-reread", appendOnlyBefore, rereadAfter),
    metrics("whole-file-sync", fileSyncBefore, fileSyncAfter),
    {
      ...metrics("freshctx-region-sync", freshBefore, freshAfter),
      unresolvedRate: unresolved,
    },
  ];
  const baseline = runs.find((run) => run.name === "whole-file-sync");
  const candidate = runs.find((run) => run.name === "freshctx-region-sync");
  const tokenReductionVsFileSync =
    1 - candidate.estimatedTokens / Math.max(1, baseline.estimatedTokens);

  return {
    label: "synthetic",
    fixture: fixture.name,
    runs,
    comparison: {
      baseline: baseline.name,
      candidate: candidate.name,
      tokenReductionVsFileSync,
    },
    hardGates: {
      noStaleBytes: candidate.staleBytes === 0,
      exactlyOneCurrentCopy: candidate.currentCopies === 1,
      fullGoldRecall: candidate.goldRecall === 1,
      fullyResolved: candidate.unresolvedRate === 0,
    },
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const result = await runBenchmark();
  console.log(JSON.stringify(result, null, 2));
}
