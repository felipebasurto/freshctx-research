import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { buildRenameBoundaryLabTraces } from "../bench/rename-boundary-lab.mjs";
import { finalCapture, runTrace } from "../bench/trace-runner.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../bench/repos/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const ORIGINAL_REGION_SHA = "d53008c0b6d3d3cc9fe50138c332cbcc03ce3f4ec112db5598b4063e42d07679";
const RENAMED_UNIT_SHA = "6b48e107654ff64e09892cd2edad5a708c61af42aabc290d420d5a8b4ed28e1e";
const RENAMED_FIRST = "func ParseLineRenamed(line string) (*Benchmark, error) {";

const EXPECTED_NAMES = [
  "go-tools/rename-boundary/parse-line",
  "go-tools/rename-boundary/parse-line-renamed-lookalike",
  "go-tools/rename-boundary/parse-line-double-rename",
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
  "rename-boundary lab traces pin renamed gold and run without throw",
  { skip: existsSync(PARSE_FILE) ? false : "go-tools parse.go not fetched" },
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildRenameBoundaryLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/rename-boundary/parse-line");
    const decoy = byName.get("go-tools/rename-boundary/parse-line-renamed-lookalike");
    const doorShas = captureShas(door);
    const decoyShas = captureShas(decoy);
    const mutatedDecoy = applyTraceMutations(goParse, decoy);
    const decoyLines = mutatedDecoy.split("\n");
    const renamedAt = [];
    for (let index = 0; index < decoyLines.length; index += 1) {
      if (decoyLines[index] === RENAMED_FIRST) renamedAt.push(index);
    }
    assert.equal(renamedAt.length, 2);
    const firstRegion = decoyLines.slice(renamedAt[0], renamedAt[0] + 22).join("\n");
    const laterRegion = decoyLines.slice(renamedAt[1], renamedAt[1] + 22).join("\n");

    assert.equal(doorShas[0], ORIGINAL_REGION_SHA);
    assert.equal(doorShas.at(-1), RENAMED_UNIT_SHA);
    assert.equal(decoyShas.at(-1), doorShas.at(-1));
    assert.notEqual(doorShas.at(-1), doorShas[0]);
    assert.equal(renamedAt[0], 40);
    assert.ok(renamedAt[1] > 61);
    assert.equal(decoyShas.at(-1), sha256(firstRegion));
    assert.equal(firstRegion.split("\n").filter((line) => line === RENAMED_FIRST).length, 1);
    assert.ok(laterRegion.includes(RENAMED_FIRST));

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
    assert.equal(liveMethod(results[traces.indexOf(door)]), "structural-anchors");
    assert.equal(doorLive[0]?.content, firstRegion);

    const decoyResult = results[traces.indexOf(decoy)];
    const codex = byName.get("go-tools/rename-boundary/parse-line-double-rename");
    const codexResult = results[traces.indexOf(codex)];
    assert.equal(liveMethod(decoyResult), "unresolved");
    assert.equal(liveUnits(decoyResult)[0]?.content ?? "", "");
    assert.doesNotMatch(liveUnits(decoyResult)[0]?.content ?? "", /lab-rename-boundary unique marker/u);
    assert.ok(!(liveUnits(decoyResult)[0]?.content ?? "").includes(laterRegion));
    assert.equal(liveMethod(codexResult), "unresolved");
    assert.equal(liveUnits(codexResult)[0]?.content ?? "", "");
  },
);
