import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { buildDuplicateBoundaryLabTraces } from "../bench/duplicate-boundary-lab.mjs";
import { finalCapture, runTrace } from "../bench/trace-runner.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../bench/repos/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const ORIGINAL_REGION_SHA = "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";
const EMPTY_CAPTURE_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const EXPECTED_NAMES = [
  "go-tools/duplicate-boundary/benchmark-fields",
  "go-tools/duplicate-boundary/benchmark-fields-trailing-decoy",
  "go-tools/duplicate-boundary/benchmark-renamed-header",
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

test(
  "duplicate-boundary lab traces pin ambiguous gold and run without throw",
  { skip: existsSync(PARSE_FILE) ? false : "go-tools parse.go not fetched" },
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildDuplicateBoundaryLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/duplicate-boundary/benchmark-fields");
    const decoy = byName.get("go-tools/duplicate-boundary/benchmark-fields-trailing-decoy");
    const codex = byName.get("go-tools/duplicate-boundary/benchmark-renamed-header");
    const doorShas = captureShas(door);
    const decoyShas = captureShas(decoy);
    const codexShas = captureShas(codex);

    assert.equal(doorShas[0], ORIGINAL_REGION_SHA);
    assert.equal(doorShas.at(-1), undefined);
    assert.deepEqual(door.events.at(-1).requiredUnits, []);
    assert.equal(decoyShas[0], ORIGINAL_REGION_SHA);
    assert.deepEqual(decoy.events.at(-1).requiredUnits, []);
    assert.equal(codexShas[0], ORIGINAL_REGION_SHA);
    assert.deepEqual(codex.events.at(-1).requiredUnits, []);
    assert.equal(sha256(""), EMPTY_CAPTURE_SHA);

    const mutatedDecoy = applyTraceMutations(goParse, decoy);
    const ordLine = "\tOrd               int     // ordinal position within a benchmark run";
    const ordCount = mutatedDecoy.split("\n").filter((line) => line === ordLine).length;
    assert.ok(ordCount >= 3);

    const results = [];
    for (const trace of traces) {
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.equal(trace.source.repository, "https://go.googlesource.com/tools");
      assert.equal(trace.source.license, "BSD-3-Clause");
      assert.doesNotMatch(trace.name, /holdout/u);
      results.push(await runTrace(trace, "freshctx-region"));
    }

    const doorResult = results[traces.indexOf(door)];
    const decoyResult = results[traces.indexOf(decoy)];
    const codexResult = results[traces.indexOf(codex)];

    assert.equal(liveMethod(doorResult), "unresolved");
    assert.equal(liveUnits(doorResult)[0]?.content ?? "", "");

    assert.equal(liveMethod(decoyResult), "unresolved");
    assert.equal(liveUnits(decoyResult)[0]?.content ?? "", "");

    assert.equal(liveMethod(codexResult), "unresolved");
    assert.equal(liveUnits(codexResult)[0]?.content ?? "", "");
  },
);
