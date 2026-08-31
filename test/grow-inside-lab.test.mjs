import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildGrowInsideLabTraces,
  runGrowInsideTrace,
} from "../bench/grow-inside-lab.mjs";
import { goldBytesForRead } from "../bench/oracle.mjs";
import { sha256 } from "../src/hash.mjs";

const PARSE_FILE = fileURLToPath(
  new URL("../test/fixtures/go-tools/benchmark/parse/parse.go", import.meta.url),
);
const GO_TOOLS_LOCKED_COMMIT = "ed9ed918a1e0aad1ed54642e4a8f1c90b34b6b49";
const ORIGINAL_FIELDS_SHA = "4e8c2b5c87f6c314493c32b1385e3b8f8846119ad8f2da863c98dcaafef142d7";
const PROBED_DOOR_SECOND_CAPTURE = "84b4a53a65d26bb3699a3a35964caf1f6540c85c63da2816a6af23a1e3b2a3d3";
const BODY_FIRST = "\tName              string  // benchmark name";

const EXPECTED_NAMES = [
  "go-tools/grow-inside/benchmark-fields",
  "go-tools/grow-inside/benchmark-fields-trailing-decoy",
  "go-tools/grow-inside/benchmark-renamed-header",
];

function captureShas(trace) {
  return trace.events
    .filter((event) => event.type === "capture-request")
    .map((event) => event.requiredUnits?.[0]?.sha256);
}

function applyTraceMutations(sourceText, trace) {
  let next = String(sourceText).replaceAll("\r\n", "\n");
  for (const event of trace.events) {
    if (event.type !== "replace-exact") continue;
    next = next.replace(event.expected, event.replacement);
  }
  return next;
}

function uniqueFirstCrop(content, first, lineCount) {
  const lines = content.split("\n");
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === first) matches.push(index);
  }
  if (matches.length !== 1) return null;
  return lines.slice(matches[0], matches[0] + lineCount).join("\n");
}

test(
  "grow-inside lab traces pin grown gold and run without throw",
  async () => {
    const goParse = await readFile(PARSE_FILE, "utf8");
    const { traces, cells } = await buildGrowInsideLabTraces({
      goParse,
      goCommit: GO_TOOLS_LOCKED_COMMIT,
    });

    assert.equal(traces.length, 3);
    assert.deepEqual(traces.map((trace) => trace.name).sort(), [...EXPECTED_NAMES].sort());

    const byName = new Map(traces.map((trace) => [trace.name, trace]));
    const cellsByName = new Map(cells.map((cell) => [cell.name, cell]));
    const door = byName.get("go-tools/grow-inside/benchmark-fields");
    const decoy = byName.get("go-tools/grow-inside/benchmark-fields-trailing-decoy");
    const doorShas = captureShas(door);
    const decoyShas = captureShas(decoy);
    const mutatedDoor = applyTraceMutations(goParse, door);
    const staleWindow = mutatedDoor.split("\n").slice(28, 36).join("\n");
    const uniqueFirst = uniqueFirstCrop(mutatedDoor, BODY_FIRST, 8);
    const oracle = await goldBytesForRead(
      { async read() { return mutatedDoor; } },
      {
        path: "benchmark/parse/parse.go",
        scope: "region",
        startLine: 29,
        endLine: 36,
        selector: "Benchmark.fields",
        initialContent: goParse.replaceAll("\r\n", "\n").split("\n").slice(28, 36).join("\n"),
      },
    );

    assert.equal(doorShas[0], ORIGINAL_FIELDS_SHA);
    assert.notEqual(doorShas.at(-1), doorShas[0]);
    assert.equal(doorShas.at(-1), PROBED_DOOR_SECOND_CAPTURE);
    assert.equal(decoyShas.at(-1), doorShas.at(-1));
    assert.notEqual(doorShas.at(-1), sha256(staleWindow));
    assert.notEqual(doorShas.at(-1), sha256(oracle));
    assert.notEqual(uniqueFirst, null);
    assert.notEqual(doorShas.at(-1), sha256(uniqueFirst));

    for (const trace of traces) {
      assert.equal(trace.source.commit, GO_TOOLS_LOCKED_COMMIT);
      assert.equal(trace.source.repository, "https://go.googlesource.com/tools");
      assert.equal(trace.source.license, "BSD-3-Clause");
      assert.doesNotMatch(trace.name, /holdout/u);
      await assert.doesNotReject(() => runGrowInsideTrace(trace, cellsByName.get(trace.name)));
    }
  },
);
