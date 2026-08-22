import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildMoveLookalikeLabTraces,
  MOVE_LOOKALIKE_LAB_CELLS,
  runMoveLookalikeTrace,
} from "../bench/move-lookalike-lab.mjs";
import { runTrace } from "../bench/trace-runner.mjs";
import { decodeProjectionUnits } from "../src/projector.mjs";
import { finalCapture } from "../bench/trace-runner.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../bench/repos/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const RELOCATED_FIELDS_SHA = "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";
const LOOKALIKE_FIELDS = [
  "\tName              string  // benchmark name",
  "\tOrd               int     // ordinal position within a benchmark run",
].join("\n");

const EXPECTED_NAMES = [
  "go-tools/move-lookalike/benchmark-fields",
  "go-tools/move-lookalike/benchmark-fields-lookalike-decoy",
  "go-tools/move-lookalike/benchmark-fields-leftover-markers",
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
  "move-lookalike lab traces pin relocated decoy gold and run without throw",
  { skip: existsSync(PARSE_FILE) ? false : "go-tools parse.go not fetched" },
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildMoveLookalikeLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const cellsByName = new Map(MOVE_LOOKALIKE_LAB_CELLS.map((cell) => [cell.name, cell]));
    const door = byName.get("go-tools/move-lookalike/benchmark-fields");
    const decoy = byName.get("go-tools/move-lookalike/benchmark-fields-lookalike-decoy");
    const codex = byName.get("go-tools/move-lookalike/benchmark-fields-leftover-markers");

    assert.equal(captureEvents(door)[0].requiredUnits[0].sha256, RELOCATED_FIELDS_SHA);
    assert.equal(captureEvents(door).at(-1).requiredUnits[0].sha256, RELOCATED_FIELDS_SHA);
    assert.equal(captureEvents(decoy).at(-1).requiredUnits[0].sha256, RELOCATED_FIELDS_SHA);
    assert.notEqual(captureEvents(codex).at(-1).requiredUnits[0].sha256, RELOCATED_FIELDS_SHA);

    const mutatedDoor = applyTraceMutations(goParse, door);
    const mutatedDecoy = applyTraceMutations(goParse, decoy);
    assert.equal((mutatedDoor.match(/\tName              string  \/\/ benchmark name/g) ?? []).length, 1);
    assert.equal((mutatedDecoy.match(/\tName              string  \/\/ benchmark name/g) ?? []).length, 2);
    assert.match(
      mutatedDecoy,
      new RegExp(`${LOOKALIKE_FIELDS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    assert.equal(mutatedDecoy.includes("\tN                 int     // number of iterations"), true);

    const decoyResult = await runMoveLookalikeTrace(decoy, cellsByName.get(decoy.name));
    assert.notEqual(liveMethod(decoyResult), "throw");

    for (const trace of traces) {
      const captures = captureEvents(trace);
      assert.equal(captures.at(-1).requiredUnits.length, 1);
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.equal(trace.source.repository, "https://go.googlesource.com/tools");
      assert.equal(trace.source.license, "BSD-3-Clause");
      assert.doesNotMatch(trace.name, /holdout/u);
      if (trace.name.includes("lookalike-decoy")) {
        await assert.doesNotReject(() =>
          runMoveLookalikeTrace(trace, cellsByName.get(trace.name)),
        );
      } else {
        await assert.doesNotReject(() => runTrace(trace, "freshctx-region"));
      }
    }
  },
);
