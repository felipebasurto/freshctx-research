import assert from "node:assert/strict";
import test from "node:test";

import { runCtxBench } from "../bench/ctxbench.mjs";

test("CtxBench repeats one exact request payload without a model", async () => {
  const result = await runCtxBench({ warmups: 1, repetitions: 5 });

  assert.ok(Object.values(result.hardGates).every(Boolean));
  assert.equal(result.payload.deterministicHashAgreement, 1);
  assert.equal(result.correctness.staleBytes, 0);
  assert.equal(result.correctness.currentCopies, 1);
  assert.ok(result.latencyMs.totalMs.p95 >= 0);
  assert.ok(result.payload.bytes > result.payload.projectionBytes);
});
