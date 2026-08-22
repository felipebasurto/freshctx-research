import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildDeleteUnitLabTraces } from "../bench/delete-unit-lab.mjs";
import { runTrace } from "../bench/trace-runner.mjs";

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

const EXPECTED_NAMES = [
  "go-tools/delete-unit/benchmark-fields",
  "go-tools/delete-unit/benchmark-fields-lookalike-decoy",
  "go-tools/delete-unit/benchmark-fields-renamed-header",
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

test(
  "delete-unit lab traces record absence gold and run without throw",
  { skip: existsSync(PARSE_FILE) ? false : "go-tools parse.go not fetched" },
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildDeleteUnitLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/delete-unit/benchmark-fields");
    const decoy = byName.get("go-tools/delete-unit/benchmark-fields-lookalike-decoy");
    const doorCaptures = captureEvents(door);
    const decoyCaptures = captureEvents(decoy);

    assert.equal(doorCaptures[0].requiredUnits[0].sha256, ORIGINAL_FIELDS_SHA);
    assert.deepEqual(doorCaptures.at(-1).requiredUnits, []);
    assert.deepEqual(decoyCaptures.at(-1).requiredUnits, []);
    assert.equal(doorCaptures.at(-1).requiredUnits.length, 0);

    const mutatedDoor = applyTraceMutations(goParse, door);
    const mutatedDecoy = applyTraceMutations(goParse, decoy);
    assert.equal(mutatedDoor.includes(DELETED_FIELDS), false);
    assert.equal(mutatedDecoy.includes(DELETED_FIELDS), false);
    assert.match(mutatedDecoy, /\tName {14}string {2}\/\/ benchmark name\n\tOrd {15}int {5}\/\/ ordinal position within a benchmark run/);

    for (const trace of traces) {
      const captures = captureEvents(trace);
      assert.equal(captures.at(-1).requiredUnits.length, 0);
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.equal(trace.source.repository, "https://go.googlesource.com/tools");
      assert.equal(trace.source.license, "BSD-3-Clause");
      assert.doesNotMatch(trace.name, /holdout/u);
      assert.equal(applyTraceMutations(goParse, trace).includes(DELETED_FIELDS), false);
      await assert.doesNotReject(() => runTrace(trace, "freshctx-region"));
    }
  },
);
