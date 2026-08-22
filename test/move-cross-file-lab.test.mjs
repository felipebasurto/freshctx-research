import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildMoveCrossFileLabTraces,
  MOVE_CROSS_FILE_LAB_CELLS,
} from "../bench/move-cross-file-lab.mjs";
import { finalCapture, runTrace } from "../bench/trace-runner.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../bench/repos/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const DEST_FILE = fileURLToPath(
  new URL("../bench/repos/go-tools/benchmark/parse/parse_test.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const RELOCATED_FIELDS_SHA = "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";
const FIELDS = [
  "\tName              string  // benchmark name",
  "\tN                 int     // number of iterations",
  "\tNsPerOp           float64 // nanoseconds per iteration",
  "\tAllocedBytesPerOp uint64  // bytes allocated per iteration",
  "\tAllocsPerOp       uint64  // allocs per iteration",
  "\tMBPerS            float64 // MB processed per second",
  "\tMeasured          int     // which measurements were recorded",
  "\tOrd               int     // ordinal position within a benchmark run",
].join("\n");
const LOOKALIKE_FIELDS = [
  "\tName              string  // benchmark name",
  "\tOrd               int     // ordinal position within a benchmark run",
].join("\n");

const EXPECTED_NAMES = [
  "go-tools/move-cross-file/benchmark-fields",
  "go-tools/move-cross-file/benchmark-fields-duplicate-decoy",
  "go-tools/move-cross-file/benchmark-fields-leftover-decoy",
];

function captureEvents(trace) {
  return trace.events.filter((event) => event.type === "capture-request");
}

function applyTraceMutations(files, trace) {
  const next = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, String(content).replaceAll("\r\n", "\n")]),
  );
  for (const event of trace.events) {
    if (event.type !== "replace-exact") continue;
    next[event.path] = next[event.path].replace(event.expected, event.replacement);
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
  "move-cross-file lab traces use path-aware absence gold and run without throw",
  {
    skip:
      existsSync(PARSE_FILE) && existsSync(DEST_FILE) ? false : "go-tools parse fixtures not fetched",
  },
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const goParseTest = await readFile(DEST_FILE, "utf8");
    const { traces } = await buildMoveCrossFileLabTraces({
      goParse,
      goParseTest,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/move-cross-file/benchmark-fields");
    const decoy = byName.get("go-tools/move-cross-file/benchmark-fields-duplicate-decoy");
    const codex = byName.get("go-tools/move-cross-file/benchmark-fields-leftover-decoy");

    assert.equal(captureEvents(door)[0].requiredUnits[0].sha256, RELOCATED_FIELDS_SHA);
    assert.deepEqual(captureEvents(door).at(-1).requiredUnits, []);
    assert.deepEqual(captureEvents(codex).at(-1).requiredUnits, []);
    assert.equal(captureEvents(decoy).at(-1).requiredUnits[0].sha256, RELOCATED_FIELDS_SHA);

    const mutatedDoor = applyTraceMutations(
      { "benchmark/parse/parse.go": goParse, "benchmark/parse/parse_test.go": goParseTest },
      door,
    );
    const mutatedDecoy = applyTraceMutations(
      { "benchmark/parse/parse.go": goParse, "benchmark/parse/parse_test.go": goParseTest },
      decoy,
    );
    const mutatedCodex = applyTraceMutations(
      { "benchmark/parse/parse.go": goParse, "benchmark/parse/parse_test.go": goParseTest },
      codex,
    );

    assert.equal(mutatedDoor["benchmark/parse/parse.go"].includes(FIELDS), false);
    assert.equal(mutatedDoor["benchmark/parse/parse_test.go"].includes(FIELDS), true);
    assert.equal(mutatedDecoy["benchmark/parse/parse.go"].includes(FIELDS), true);
    assert.equal(mutatedDecoy["benchmark/parse/parse_test.go"].includes(FIELDS), true);
    assert.equal(mutatedCodex["benchmark/parse/parse.go"].includes(FIELDS), false);
    assert.match(mutatedCodex["benchmark/parse/parse_test.go"], new RegExp(LOOKALIKE_FIELDS));

    for (const trace of traces) {
      assert.equal(captureEvents(trace).at(-1).requiredUnits.length <= 1, true);
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.equal(trace.source.repository, "https://go.googlesource.com/tools");
      assert.equal(trace.source.license, "BSD-3-Clause");
      assert.doesNotMatch(trace.name, /holdout/u);
      assert.equal(Object.keys(trace.initialFiles).length, 2);
      await assert.doesNotReject(() => runTrace(trace, "freshctx-region"));
      const result = await runTrace(trace, "freshctx-region");
      assert.notEqual(liveMethod(result), "throw");
    }
  },
);
