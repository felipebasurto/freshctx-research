import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { sha256 } from "../src/hash.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import {
  buildGrowShrinkExactDecoyLabTraces,
  runGrowShrinkExactDecoyTrace,
} from "../bench/grow-shrink-exact-decoy-lab.mjs";
import { finalCapture } from "../bench/trace-runner.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../test/fixtures/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const RELOCATED_FIELDS_SHA =
  "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";

const EXPECTED_NAMES = [
  "go-tools/grow-shrink-exact/benchmark-fields-grow-decoy",
  "go-tools/grow-shrink-exact/benchmark-fields-shrink-decoy",
  "go-tools/grow-shrink-exact/benchmark-fields-lookalike-relocated",
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
  "grow-shrink-exact-decoy lab traces pin gold and skip planted exact copies",
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildGrowShrinkExactDecoyLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/grow-shrink-exact/benchmark-fields-grow-decoy");
    const decoy = byName.get("go-tools/grow-shrink-exact/benchmark-fields-shrink-decoy");
    const codex = byName.get("go-tools/grow-shrink-exact/benchmark-fields-lookalike-relocated");

    assert.notEqual(captureShas(door).at(-1), captureShas(door)[0]);
    assert.notEqual(captureShas(decoy).at(-1), captureShas(decoy)[0]);
    assert.equal(captureShas(codex).at(-1), RELOCATED_FIELDS_SHA);

    const mutatedDoor = applyTraceMutations(goParse, door);
    const mutatedDecoy = applyTraceMutations(goParse, decoy);
    assert.ok(mutatedDoor.includes("// lab-grow-shrink-exact unique block alpha-c2af"));
    assert.equal(
      mutatedDoor.split("\tName              string  // benchmark name").length - 1,
      2,
    );

    const results = [];
    for (const trace of traces) {
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.doesNotMatch(trace.name, /holdout/u);
      results.push(await runGrowShrinkExactDecoyTrace(trace, "freshctx-region"));
    }

    const doorResult = results[traces.indexOf(door)];
    const decoyResult = results[traces.indexOf(decoy)];
    const codexResult = results[traces.indexOf(codex)];

    assert.equal(liveMethod(doorResult), "boundary-anchors");
    assert.equal(finalCapture(doorResult)?.metrics?.staleUnitRate, 0);
    assert.match(liveUnits(doorResult)[0]?.content ?? "", /lab-grow-shrink-exact unique block/u);

    assert.equal(liveMethod(decoyResult), "boundary-anchors");
    assert.equal(finalCapture(decoyResult)?.metrics?.staleUnitRate, 0);
    assert.doesNotMatch(liveUnits(decoyResult)[0]?.content ?? "", /\tOrd/u);

    assert.equal(liveMethod(codexResult), "exact");
    assert.equal(finalCapture(codexResult)?.metrics?.staleUnitRate, 0);
    assert.equal(sha256(liveUnits(codexResult)[0]?.content ?? ""), RELOCATED_FIELDS_SHA);
  },
);
