import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildStoredStartLeftoverFailCloseLabTraces,
  STORED_START_LEFTOVER_FAIL_CLOSE_LAB_CELLS,
  runStoredStartLeftoverFailCloseTrace,
} from "../bench/stored-start-leftover-fail-close-lab.mjs";
import { finalCapture } from "../bench/trace-runner.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../bench/repos/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const ORIGINAL_FIELDS_SHA = "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";
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
const PREFIX_FIELDS = FIELDS.split("\n").slice(0, 6).join("\n");
const LEFTOVER_FIELDS = [
  "\tName              string  // benchmark name",
  "\tOrd               int     // ordinal position within a benchmark run",
].join("\n");

const EXPECTED_NAMES = [
  "go-tools/stored-start-leftover/benchmark-fields-displaced-lookalike",
  "go-tools/stored-start-leftover/benchmark-fields-interior-delete",
  "go-tools/stored-start-leftover/benchmark-fields-prefix-shrink",
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

function extractRegion(content, startLine, endLine) {
  return content.split("\n").slice(startLine - 1, endLine).join("\n");
}

function liveMethod(result) {
  const units = decodeProjectionUnits(finalCapture(result)?.payloadText ?? "");
  if (units.length === 0) return "unresolved";
  const resolution = units[0].resolution;
  if (!resolution || resolution === "unresolved") return "unresolved";
  return resolution;
}

test(
  "stored-start leftover fail-close lab traces pin door, decoy, and codex cells",
  { skip: existsSync(PARSE_FILE) ? false : "go-tools parse.go not fetched" },
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildStoredStartLeftoverFailCloseLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const cellsByName = new Map(
      STORED_START_LEFTOVER_FAIL_CLOSE_LAB_CELLS.map((cell) => [cell.name, cell]),
    );
    const door = byName.get("go-tools/stored-start-leftover/benchmark-fields-interior-delete");
    const decoy = byName.get("go-tools/stored-start-leftover/benchmark-fields-prefix-shrink");
    const codex = byName.get("go-tools/stored-start-leftover/benchmark-fields-displaced-lookalike");

    assert.equal(captureEvents(door)[0].requiredUnits[0].sha256, ORIGINAL_FIELDS_SHA);
    assert.deepEqual(captureEvents(door).at(-1).requiredUnits, []);
    assert.equal(captureEvents(decoy).at(-1).requiredUnits[0].sha256.length, 64);
    assert.deepEqual(captureEvents(codex).at(-1).requiredUnits, []);

    const mutatedDoor = applyTraceMutations(goParse, door);
    const mutatedDecoy = applyTraceMutations(goParse, decoy);
    const mutatedCodex = applyTraceMutations(goParse, codex);
    assert.equal(mutatedDoor.includes(FIELDS), false);
    assert.match(mutatedDoor, new RegExp(`${LEFTOVER_FIELDS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.equal(extractRegion(mutatedDecoy, 29, 36).includes("\tOrd"), false);
    assert.match(
      mutatedDecoy,
      new RegExp(`${PREFIX_FIELDS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    assert.equal(mutatedCodex.includes(FIELDS), false);
    assert.match(
      mutatedCodex,
      /\tName {14}string {2}\/\/ benchmark name\n\tOrd {15}int {5}\/\/ ordinal position within a benchmark run/,
    );

    const doorResult = await runStoredStartLeftoverFailCloseTrace(door, cellsByName.get(door.name));
    const decoyResult = await runStoredStartLeftoverFailCloseTrace(
      decoy,
      cellsByName.get(decoy.name),
    );
    const codexResult = await runStoredStartLeftoverFailCloseTrace(
      codex,
      cellsByName.get(codex.name),
    );
    assert.equal(liveMethod(doorResult), "unresolved");
    assert.equal(liveMethod(decoyResult), "boundary-anchors");
    assert.equal(liveMethod(codexResult), "unresolved");

    for (const trace of traces) {
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.doesNotMatch(trace.name, /holdout/u);
      await assert.doesNotReject(() =>
        runStoredStartLeftoverFailCloseTrace(trace, cellsByName.get(trace.name)),
      );
    }
  },
);
