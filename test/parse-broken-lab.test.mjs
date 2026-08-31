import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { buildParseBrokenLabTraces } from "../bench/parse-broken-lab.mjs";
import { finalCapture, runTrace } from "../bench/trace-runner.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../test/fixtures/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const ORIGINAL_REGION_SHA = "d53008c0b6d3d3cc9fe50138c332cbcc03ce3f4ec112db5598b4063e42d07679";
const BROKEN_UNIT_SHA = "2f236abb697ca13c1a5dee84a5b27960ed0754f4308482c4ed25b5df0eb7770b";
const ORIGINAL_FIRST = "func ParseLine(line string) (*Benchmark, error) {";

const EXPECTED_NAMES = [
  "go-tools/parse-broken/parse-line",
  "go-tools/parse-broken/parse-line-lookalike-decoy",
  "go-tools/parse-broken/parse-line-markers-shift",
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
  "parse-broken lab traces pin broken gold and run without throw",
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildParseBrokenLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/parse-broken/parse-line");
    const decoy = byName.get("go-tools/parse-broken/parse-line-lookalike-decoy");
    const doorShas = captureShas(door);
    const decoyShas = captureShas(decoy);
    const mutatedDecoy = applyTraceMutations(goParse, decoy);
    const decoyLines = mutatedDecoy.split("\n");
    const originalAt = [];
    for (let index = 0; index < decoyLines.length; index += 1) {
      if (decoyLines[index] === ORIGINAL_FIRST) originalAt.push(index);
    }
    assert.equal(originalAt.length, 2);
    const brokenRegion = decoyLines.slice(originalAt[0], originalAt[0] + 22).join("\n");
    const lookalikeRegion = decoyLines.slice(originalAt[1], originalAt[1] + 22).join("\n");

    assert.equal(doorShas[0], ORIGINAL_REGION_SHA);
    assert.equal(doorShas.at(-1), BROKEN_UNIT_SHA);
    assert.equal(decoyShas.at(-1), doorShas.at(-1));
    assert.notEqual(doorShas.at(-1), doorShas[0]);
    assert.equal(originalAt[0], 40);
    assert.ok(originalAt[1] > 61);
    assert.match(brokenRegion, /lab-parse-broken unclosed/u);
    assert.doesNotMatch(lookalikeRegion, /lab-parse-broken unclosed/u);

    const results = [];
    for (const trace of traces) {
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.equal(trace.source.repository, "https://go.googlesource.com/tools");
      assert.equal(trace.source.license, "BSD-3-Clause");
      assert.doesNotMatch(trace.name, /holdout/u);
      const result = await runTrace(trace, "freshctx-region");
      results.push(result);
    }

    const doorLive = liveUnits(results[traces.indexOf(door)]);
    assert.equal(liveMethod(results[traces.indexOf(door)]), "boundary-anchors");
    assert.equal(doorLive[0]?.content, brokenRegion);

    const decoyResult = results[traces.indexOf(decoy)];
    const codex = byName.get("go-tools/parse-broken/parse-line-markers-shift");
    const codexResult = results[traces.indexOf(codex)];
    assert.equal(liveMethod(decoyResult), "boundary-anchors");
    assert.equal(finalCapture(decoyResult)?.metrics?.staleUnitRate, 0);
    assert.equal(liveUnits(decoyResult)[0]?.content, brokenRegion);
    assert.notEqual(liveUnits(decoyResult)[0]?.content, lookalikeRegion);
    assert.equal(liveMethod(codexResult), "unresolved");
    assert.equal(liveUnits(codexResult)[0]?.content ?? "", "");
    assert.doesNotMatch(liveUnits(codexResult)[0]?.content ?? "", /lab-parse-broken unique marker/u);
  },
);
