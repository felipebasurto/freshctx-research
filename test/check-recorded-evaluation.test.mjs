import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  compareRecordedEvaluation,
  parseEvaluateOutput,
  parseReadmeRecordedEvaluation,
} from "../scripts/check-recorded-evaluation.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function read(relativePath) {
  return readFile(join(ROOT, relativePath), "utf8");
}

const FIXTURE =
  "EVALUATE_VERDICT=PASS\n{\n  \"comparison\": {\n    \"payloadBytes\": { \"candidate\": 1, \"baseline\": 2 },\n    \"oracleRetention\": { \"hits\": 3, \"requiredCount\": 4 }\n  }\n}\n";

test("parseEvaluateOutput reads payload bytes and oracle retention after the verdict line", () => {
  assert.deepEqual(parseEvaluateOutput(FIXTURE), { candidate: 1, baseline: 2, hits: 3, required: 4 });
});

test("parseEvaluateOutput throws when no EVALUATE_VERDICT line is present", () => {
  assert.throws(() => parseEvaluateOutput("hello"));
});

test("parseReadmeRecordedEvaluation pins the README Recorded evaluation table shape", async () => {
  const recorded = parseReadmeRecordedEvaluation(await read("README.md"));
  for (const key of ["candidate", "baseline", "hits", "required"]) {
    assert.ok(Number.isInteger(recorded[key]), `${key} is not an integer`);
  }
});

test("compareRecordedEvaluation names the mismatching field", () => {
  const mismatches = compareRecordedEvaluation(
    { candidate: 1, baseline: 2, hits: 3, required: 4 },
    { candidate: 9, baseline: 2, hits: 3, required: 4 },
  );
  assert.equal(mismatches.length, 1);
  assert.match(mismatches[0], /candidate/);
});

test("compareRecordedEvaluation returns no mismatches for identical records", () => {
  const record = { candidate: 1, baseline: 2, hits: 3, required: 4 };
  assert.deepEqual(compareRecordedEvaluation(record, record), []);
});
