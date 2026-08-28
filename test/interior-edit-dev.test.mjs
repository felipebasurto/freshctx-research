import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadInteriorEditDoorTrace } from "../bench/interior-edit-dev-lab.mjs";
import { finalCapture, runTrace } from "../bench/trace-runner.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("interior-edit door copies the v0.1 ParseFile.body failure class", async () => {
  const trace = await loadInteriorEditDoorTrace();
  assert.equal(trace.name, "go-tools/interior-edit/parse-file-body");
  assert.equal(trace.events[0].selector, "ParseFile.body");
  assert.equal(trace.events[0].startLine, 32);
  assert.equal(trace.events[0].endLine, 38);
});

test("live freshctx-region recall on the v0.1 ParseFile.body door", async () => {
  const trace = await loadInteriorEditDoorTrace();
  const region = await runTrace(trace, "freshctx-region");
  const file = await runTrace(trace, "freshctx-file");
  const corvus = await runTrace(trace, "corvus-file");
  const regionCapture = finalCapture(region);
  const fileCapture = finalCapture(file);
  const corvusCapture = finalCapture(corvus);
  const report = await readFile(join(ROOT, "bench/reports/holdout.md"), "utf8");
  const frozenZero = /go-tools[\s\S]*interior-edit[\s\S]*freshctx-region[\s\S]*0\.000/u.test(report)
    || report.includes("| go-tools | interior-edit |") && report.includes("0.000");

  assert.equal(fileCapture.metrics.requiredRecall, 1);
  assert.equal(corvusCapture.metrics.requiredRecall, 1);
  assert.equal(regionCapture.metrics.requiredRecall, 1);
  assert.equal(regionCapture.metrics.exactCurrentRate, 1);
  assert.ok(
    frozenZero || report.includes("interior-edit"),
    "frozen holdout.md must remain the historical artifact",
  );
});
