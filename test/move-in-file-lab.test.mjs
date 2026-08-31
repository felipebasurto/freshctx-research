import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildMoveInFileLabTraces } from "../bench/move-in-file-lab.mjs";
import { runTrace } from "../bench/trace-runner.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../test/fixtures/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const ORIGINAL_FIELDS_SHA = "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";

const EXPECTED_NAMES = [
  "go-tools/move-in-file/benchmark-fields",
  "go-tools/move-in-file/benchmark-fields-duplicate-decoy",
  "go-tools/move-in-file/benchmark-fields-leftover-markers",
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
  "move-in-file lab traces record relocated gold and run without throw",
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildMoveInFileLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/move-in-file/benchmark-fields");
    const decoy = byName.get("go-tools/move-in-file/benchmark-fields-duplicate-decoy");
    const codex = byName.get("go-tools/move-in-file/benchmark-fields-leftover-markers");

    assert.equal(captureEvents(door)[0].requiredUnits[0].sha256, ORIGINAL_FIELDS_SHA);
    assert.equal(captureEvents(door).at(-1).requiredUnits[0].sha256, ORIGINAL_FIELDS_SHA);
    assert.equal(captureEvents(decoy).at(-1).requiredUnits[0].sha256, ORIGINAL_FIELDS_SHA);
    assert.notEqual(captureEvents(codex).at(-1).requiredUnits[0].sha256, ORIGINAL_FIELDS_SHA);

    const mutatedDoor = applyTraceMutations(goParse, door);
    const mutatedDecoy = applyTraceMutations(goParse, decoy);
    assert.equal((mutatedDoor.match(/\tName              string  \/\/ benchmark name/g) ?? []).length, 1);
    assert.equal((mutatedDecoy.match(/\tName              string  \/\/ benchmark name/g) ?? []).length, 2);

    for (const trace of traces) {
      const captures = captureEvents(trace);
      assert.equal(captures.at(-1).requiredUnits.length, 1);
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.equal(trace.source.repository, "https://go.googlesource.com/tools");
      assert.equal(trace.source.license, "BSD-3-Clause");
      assert.doesNotMatch(trace.name, /holdout/u);
      await assert.doesNotReject(() => runTrace(trace, "freshctx-region"));
    }
  },
);
