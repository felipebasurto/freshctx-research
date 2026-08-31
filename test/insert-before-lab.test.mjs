import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildInsertBeforeLabTraces } from "../bench/insert-before-lab.mjs";
import { runTrace } from "../bench/trace-runner.mjs";

const UTIL_FILE = fileURLToPath(new URL("../test/fixtures/go-tools/go/buildutil/util.go", import.meta.url));
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";

const PROBED_SECOND_CAPTURE = {
  "go-tools/insert-before/parse-file-body":
    "68de6d76a62dca3f0f539198117fe4188366804d3be7ec34679041cc0a62e553",
  "go-tools/insert-before/parse-file-body-trailing-decoy":
    "76f8970d606cf8d57d3f0f503cf7843f06b858aa2a706ab8e0b37216324c1d3b",
  "go-tools/insert-before/parse-file-renamed-header":
    "73cba8267ea358467cc3119cc7e14d71320fd2304d2cdd75a6b00ba5c5ddd7e9",
};

function secondCaptureSha(trace) {
  const captures = trace.events.filter((event) => event.type === "capture-request");
  return captures.at(-1)?.requiredUnits?.[0]?.sha256;
}

test(
  "insert-before lab traces match probed gold and run without throw",
  async () => {
    const goUtil = await readFile(UTIL_FILE, "utf8");
    const { traces } = await buildInsertBeforeLabTraces({
      goUtil,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(
      traces.map((trace) => trace.name).sort(),
      Object.keys(PROBED_SECOND_CAPTURE).sort(),
    );

    for (const trace of traces) {
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.equal(trace.source.repository, "https://go.googlesource.com/tools");
      assert.equal(trace.source.license, "BSD-3-Clause");
      assert.doesNotMatch(trace.name, /holdout/u);
      assert.equal(secondCaptureSha(trace), PROBED_SECOND_CAPTURE[trace.name]);
      await assert.doesNotReject(() => runTrace(trace, "freshctx-region"));
    }
  },
);
