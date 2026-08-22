import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { sha256 } from "../src/hash.mjs";
import { buildInsertBeforeUniqueLastLabTraces } from "../bench/insert-before-unique-last-lab.mjs";
import { runTrace } from "../bench/trace-runner.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../bench/repos/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const ORIGINAL_FIELDS_SHA = "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";
const PROBED_DOOR_SECOND_CAPTURE = "d0283fc145e7905617b7106684753cf9e26770aeab78be14bb34444df545c47b";

const EXPECTED_NAMES = [
  "go-tools/insert-before/benchmark-fields-unique-last",
  "go-tools/insert-before/benchmark-fields-unique-last-trailing-decoy",
  "go-tools/insert-before/benchmark-renamed-header-unique-last",
];

function captureShas(trace) {
  return trace.events
    .filter((event) => event.type === "capture-request")
    .map((event) => event.requiredUnits?.[0]?.sha256);
}

test(
  "insert-before-unique-last lab traces pin relocated gold and run without throw",
  { skip: existsSync(PARSE_FILE) ? false : "go-tools parse.go not fetched" },
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces } = await buildInsertBeforeUniqueLastLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const door = byName.get("go-tools/insert-before/benchmark-fields-unique-last");
    const decoy = byName.get("go-tools/insert-before/benchmark-fields-unique-last-trailing-decoy");
    const doorShas = captureShas(door);
    const decoyShas = captureShas(decoy);
    const mutatedDoor = applyTraceMutations(goParse, door);
    const staleWindow = mutatedDoor.replaceAll("\r\n", "\n").split("\n").slice(28, 36).join("\n");

    assert.equal(doorShas[0], ORIGINAL_FIELDS_SHA);
    assert.notEqual(doorShas.at(-1), doorShas[0]);
    assert.equal(doorShas.at(-1), PROBED_DOOR_SECOND_CAPTURE);
    assert.equal(decoyShas.at(-1), doorShas.at(-1));
    assert.notEqual(doorShas.at(-1), sha256(staleWindow));

    for (const trace of traces) {
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.equal(trace.source.repository, "https://go.googlesource.com/tools");
      assert.equal(trace.source.license, "BSD-3-Clause");
      assert.doesNotMatch(trace.name, /holdout/u);
      await assert.doesNotReject(() => runTrace(trace, "freshctx-region"));
    }
  },
);

function applyTraceMutations(sourceText, trace) {
  let next = String(sourceText).replaceAll("\r\n", "\n");
  for (const event of trace.events) {
    if (event.type !== "replace-exact") continue;
    next = next.replace(event.expected, event.replacement);
  }
  return next;
}
