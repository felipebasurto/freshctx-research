import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import {
  ORIGINAL_REGION_SHA,
  buildDuplicateBoundaryMarkersLabTraces,
  runDuplicateBoundaryMarkersTrace,
} from "../bench/duplicate-boundary-markers-lab.mjs";
import { finalCapture } from "../bench/trace-runner.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../bench/repos/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const EMPTY_CAPTURE_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const EXPECTED_NAMES = [
  "go-tools/duplicate-boundary/benchmark-fields",
  "go-tools/duplicate-boundary/benchmark-fields-gap-markers",
  "go-tools/duplicate-boundary/benchmark-fields-markers-rename",
];

function captureShas(trace) {
  return trace.events
    .filter((event) => event.type === "capture-request")
    .map((event) => event.requiredUnits?.[0]?.sha256);
}

function applyTraceMutations(sourceText, trace) {
  let next = String(sourceText).replaceAll("\r\n", "\n");
  for (const event of trace.events) {
    if (event.type !== "replace-exact") continue;
    next = next.replace(event.expected, event.replacement);
  }
  return next;
}

function liveUnits(result) {
  return decodeProjectionUnits(finalCapture(result)?.payloadText ?? "");
}

function liveMethod(result) {
  const units = liveUnits(result);
  if (units.length === 0) return "unresolved";
  const resolution = units[0].resolution;
  if (!resolution || resolution === "unresolved") return "unresolved";
  return resolution;
}

function acceptedCopyStartLine(mutatedContent, result) {
  const content = liveUnits(result)[0]?.content ?? "";
  if (!content) return null;
  const firstLine = content.split("\n")[0];
  const lineIndex = mutatedContent.split("\n").findIndex((line) => line === firstLine);
  return lineIndex >= 0 ? lineIndex + 1 : null;
}

test(
  "duplicate-boundary-markers lab traces pin gold and measure marker tie-break",
  { skip: existsSync(PARSE_FILE) ? false : "go-tools parse.go not fetched" },
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildDuplicateBoundaryMarkersLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/duplicate-boundary/benchmark-fields");
    const decoy = byName.get(
      "go-tools/duplicate-boundary/benchmark-fields-gap-markers",
    );
    const codex = byName.get(
      "go-tools/duplicate-boundary/benchmark-fields-markers-rename",
    );

    assert.equal(captureShas(door)[0], ORIGINAL_REGION_SHA);
    assert.equal(captureShas(door).at(-1), undefined);
    assert.deepEqual(door.events.at(-1).requiredUnits, []);

    assert.equal(captureShas(decoy)[0], ORIGINAL_REGION_SHA);
    assert.equal(captureShas(decoy).at(-1), ORIGINAL_REGION_SHA);

    assert.equal(captureShas(codex)[0], ORIGINAL_REGION_SHA);
    assert.equal(captureShas(codex).at(-1), ORIGINAL_REGION_SHA);
    assert.equal(sha256(""), EMPTY_CAPTURE_SHA);

    const mutatedDecoy = applyTraceMutations(goParse, decoy);
    assert.ok(mutatedDecoy.includes("// lab-dup-boundary unique marker alpha-0118"));
    assert.ok(mutatedDecoy.includes("// lab-dup-boundary unique marker beta-0118"));

    const mutatedCodex = applyTraceMutations(goParse, codex);
    assert.ok(mutatedCodex.includes("type BenchmarkSnapshot struct {"));

    const results = [];
    for (const trace of traces) {
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.doesNotMatch(trace.name, /holdout/u);
      results.push(await runDuplicateBoundaryMarkersTrace(trace, "freshctx-region"));
    }

    const doorResult = results[traces.indexOf(door)];
    const decoyResult = results[traces.indexOf(decoy)];
    const codexResult = results[traces.indexOf(codex)];

    assert.equal(liveMethod(doorResult), "unresolved");
    assert.equal(liveUnits(doorResult)[0]?.content ?? "", "");

    assert.equal(liveMethod(decoyResult), "boundary-anchors");
    assert.equal(acceptedCopyStartLine(mutatedDecoy, decoyResult), 20);

    assert.equal(liveMethod(codexResult), "boundary-anchors");
    assert.equal(acceptedCopyStartLine(mutatedCodex, codexResult), 20);
  },
);
