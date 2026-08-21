import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildInsertBeforeInteriorLabTraces } from "../bench/insert-before-interior-lab.mjs";
import { runTrace } from "../bench/trace-runner.mjs";

const UTIL_FILE = fileURLToPath(new URL("../bench/repos/go-tools/go/buildutil/util.go", import.meta.url));
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const ORIGINAL_BODY_SHA = "68de6d76a62dca3f0f539198117fe4188366804d3be7ec34679041cc0a62e553";
const PROBED_DOOR_SECOND_CAPTURE = "bd26df43a56b95eb61ada9dfad09640886c15c2f1dbd8039af20719949c5bf0e";

const EXPECTED_NAMES = [
  "go-tools/insert-before/parse-file-body-interior",
  "go-tools/insert-before/parse-file-body-interior-trailing-decoy",
  "go-tools/insert-before/parse-file-renamed-header-interior",
];

function captureShas(trace) {
  return trace.events
    .filter((event) => event.type === "capture-request")
    .map((event) => event.requiredUnits?.[0]?.sha256);
}

test(
  "insert-before-interior lab traces match probed gold and run without throw",
  { skip: existsSync(UTIL_FILE) ? false : "go-tools util.go not fetched" },
  async () => {
    const goUtil = await readFile(UTIL_FILE, "utf8");
    const { traces } = await buildInsertBeforeInteriorLabTraces({
      goUtil,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/insert-before/parse-file-body-interior");
    const decoy = byName.get("go-tools/insert-before/parse-file-body-interior-trailing-decoy");
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
