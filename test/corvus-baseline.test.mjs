import assert from "node:assert/strict";
import test from "node:test";

import { createBaseline } from "../bench/baselines.mjs";
import { CorvusSyncedFileSet, syncMarker } from "../bench/corvus.mjs";
import { sha256 } from "../src/hash.mjs";
import { finalCapture, runTrace } from "../bench/trace-runner.mjs";

function occurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function fileTrace({ initial, mutated, deleted = false }) {
  const initialSha = sha256(initial);
  const events = [
    { type: "read", path: "src/a.ts", scope: "file" },
    {
      type: "capture-request",
      task: "inspect a",
      budgetChars: 12_000,
      requiredUnits: [{ path: "src/a.ts", sha256: initialSha }],
    },
  ];
  if (deleted) {
    events.push({ type: "delete-file", path: "src/a.ts" });
    events.push({
      type: "capture-request",
      task: "inspect a",
      budgetChars: 12_000,
      requiredUnits: [],
    });
  } else {
    events.push({
      type: "replace-exact",
      path: "src/a.ts",
      expected: initial.trimEnd(),
      replacement: mutated.trimEnd(),
    });
    events.push({
      type: "capture-request",
      task: "inspect a",
      budgetChars: 12_000,
      requiredUnits: [{ path: "src/a.ts", sha256: sha256(mutated) }],
    });
  }
  return {
    schemaVersion: 1,
    name: "synthetic/corvus-lifecycle",
    source: {
      repository: "https://example.com/synthetic.git",
      commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    initialFiles: { "src/a.ts": initial },
    events,
  };
}

test("sync_file registers a path and emits only the paper marker", () => {
  const synced = new CorvusSyncedFileSet();
  const marker = synced.syncFile("src/a.ts");
  assert.equal(marker, syncMarker("src/a.ts"));
  assert.equal(marker, "sync: src/a.ts");
  assert.ok(synced.paths.has("src/a.ts"));
});

test("CORVUS baseline masks historical reads and keeps one current whole file", async () => {
  const initial = "export const mode = 'v1';\n";
  const mutated = "export const mode = 'v2';\n";
  const result = await runTrace(fileTrace({ initial, mutated }), "corvus-file");
  const first = result.captures[0];
  const second = finalCapture(result);

  assert.match(first.payloadText, /^sync: src\/a\.ts/u);
  assert.equal(occurrences(first.payloadText, initial), 1);
  assert.equal(occurrences(second.payloadText, initial), 0);
  assert.equal(occurrences(second.payloadText, mutated), 1);
  assert.equal(second.metrics.staleBytes, 0);
  assert.equal(second.metrics.duplicateUnits, 0);
  assert.equal(second.metrics.requiredRecall, 1);
});

test("CORVUS baseline omits a deleted file without last-known content", async () => {
  const initial = "export const doomed = true;\n";
  const result = await runTrace(fileTrace({ initial, mutated: initial, deleted: true }), "corvus-file");
  const afterDelete = finalCapture(result);

  assert.equal(occurrences(afterDelete.payloadText, initial), 0);
  assert.doesNotMatch(afterDelete.payloadText, /\[corvus-file path="src\/a\.ts"\]/u);
  assert.equal(afterDelete.metrics.staleBytes, 0);
});

test("createBaseline keeps the corvus-file id", () => {
  assert.equal(createBaseline("corvus-file").name, "corvus-file");
});
