import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildDeleteUnitFailCloseLabTraces,
  DELETE_UNIT_FAIL_CLOSE_LAB_CELLS,
  runDeleteUnitFailCloseTrace,
} from "../bench/delete-unit-fail-close-lab.mjs";
import { finalCapture } from "../bench/trace-runner.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../bench/repos/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const ORIGINAL_FIELDS_SHA = "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";
const DELETED_FIELDS = [
  "\tName              string  // benchmark name",
  "\tN                 int     // number of iterations",
  "\tNsPerOp           float64 // nanoseconds per iteration",
  "\tAllocedBytesPerOp uint64  // bytes allocated per iteration",
  "\tAllocsPerOp       uint64  // allocs per iteration",
  "\tMBPerS            float64 // MB processed per second",
  "\tMeasured          int     // which measurements were recorded",
  "\tOrd               int     // ordinal position within a benchmark run",
].join("\n");
const SHRUNK_FIELDS = [
  "\tName              string  // benchmark name",
  "\tOrd               int     // ordinal position within a benchmark run",
].join("\n");

const EXPECTED_NAMES = [
  "go-tools/delete-unit-fail-close/benchmark-fields-in-place-shrink",
  "go-tools/delete-unit-fail-close/benchmark-fields-lookalike-decoy",
];

function captureEvents(trace) {
  return trace.events.filter((event) => event.type === "capture-request");
}

function applyTraceMutations(sourceText, trace) {
  let next = String(sourceText).replaceAll("\r\n", "\n");
  for (const event of trace.events) {
    if (event.type !== "replace-exact") continue;
    next = next.replace(event.expected, event.replacement);
  }
  return next;
}

function liveMethod(result) {
  const units = decodeProjectionUnits(finalCapture(result)?.payloadText ?? "");
  if (units.length === 0) return "unresolved";
  const resolution = units[0].resolution;
  if (!resolution || resolution === "unresolved") return "unresolved";
  return resolution;
}

test(
  "delete-unit fail-close lab traces pin post-fix decoy and in-place shrink",
  { skip: existsSync(PARSE_FILE) ? false : "go-tools parse.go not fetched" },
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildDeleteUnitFailCloseLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 2);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const cellsByName = new Map(DELETE_UNIT_FAIL_CLOSE_LAB_CELLS.map((cell) => [cell.name, cell]));
    const decoy = byName.get("go-tools/delete-unit-fail-close/benchmark-fields-lookalike-decoy");
    const shrink = byName.get("go-tools/delete-unit-fail-close/benchmark-fields-in-place-shrink");

    assert.equal(captureEvents(decoy)[0].requiredUnits[0].sha256, ORIGINAL_FIELDS_SHA);
    assert.deepEqual(captureEvents(decoy).at(-1).requiredUnits, []);
    assert.equal(captureEvents(shrink).at(-1).requiredUnits[0].sha256.length, 64);

    const mutatedDecoy = applyTraceMutations(goParse, decoy);
    const mutatedShrink = applyTraceMutations(goParse, shrink);
    assert.equal(mutatedDecoy.includes(DELETED_FIELDS), false);
    assert.equal(mutatedShrink.includes(DELETED_FIELDS), false);
    assert.match(
      mutatedDecoy,
      /\tName {14}string {2}\/\/ benchmark name\n\tOrd {15}int {5}\/\/ ordinal position within a benchmark run/,
    );
    assert.match(mutatedShrink, new RegExp(`${SHRUNK_FIELDS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const decoyResult = await runDeleteUnitFailCloseTrace(decoy, cellsByName.get(decoy.name));
    const shrinkResult = await runDeleteUnitFailCloseTrace(shrink, cellsByName.get(shrink.name));
    assert.equal(liveMethod(decoyResult), "unresolved");
    assert.equal(liveMethod(shrinkResult), "boundary-anchors");

    for (const trace of traces) {
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.doesNotMatch(trace.name, /holdout/u);
      await assert.doesNotReject(() =>
        runDeleteUnitFailCloseTrace(trace, cellsByName.get(trace.name)),
      );
    }
  },
);
