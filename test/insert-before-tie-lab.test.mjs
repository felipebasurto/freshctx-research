import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildInsertBeforeTieLabTraces } from "../bench/insert-before-tie-lab.mjs";
import { runTrace } from "../bench/trace-runner.mjs";

const UTIL_FILE = fileURLToPath(new URL("../test/fixtures/go-tools/go/buildutil/util.go", import.meta.url));
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const ORIGINAL_BODY_SHA = "68de6d76a62dca3f0f539198117fe4188366804d3be7ec34679041cc0a62e553";
const PROBED_DOOR_SECOND_CAPTURE = "578210459dcbc03dccc9d3adac21f98a9a24beaf310019d563ae8ac842dc53de";

const EXPECTED_NAMES = [
  "go-tools/insert-before/parse-file-body-tie",
  "go-tools/insert-before/parse-file-body-tie-trailing-decoy",
  "go-tools/insert-before/parse-file-renamed-header-tie",
];

function captureShas(trace) {
  return trace.events
    .filter((event) => event.type === "capture-request")
    .map((event) => event.requiredUnits?.[0]?.sha256);
}

test(
  "insert-before-tie lab traces match probed gold and run without throw",
  async () => {
    const goUtil = await readFile(UTIL_FILE, "utf8");
    const { traces } = await buildInsertBeforeTieLabTraces({
      goUtil,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/insert-before/parse-file-body-tie");
    const decoy = byName.get("go-tools/insert-before/parse-file-body-tie-trailing-decoy");
    const doorShas = captureShas(door);
    const decoyShas = captureShas(decoy);

    assert.equal(doorShas[0], ORIGINAL_BODY_SHA);
    assert.notEqual(doorShas.at(-1), doorShas[0]);
    assert.equal(doorShas.at(-1), PROBED_DOOR_SECOND_CAPTURE);
    assert.equal(decoyShas.at(-1), doorShas.at(-1));

    for (const trace of traces) {
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.equal(trace.source.repository, "https://go.googlesource.com/tools");
      assert.equal(trace.source.license, "BSD-3-Clause");
      assert.doesNotMatch(trace.name, /holdout/u);
      await assert.doesNotReject(() => runTrace(trace, "freshctx-region"));
    }
  },
);
