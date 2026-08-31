import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseEvaluateArgs, runEvaluateBenchmark } from "../autoresearch/evaluate.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("evaluate CLI binds --pack and defaults to no pack flag", () => {
  assert.deepEqual(parseEvaluateArgs(["node", "evaluate.mjs", "--pack=symbol-scope-dev-v0.1"]), {
    pack: "symbol-scope-dev-v0.1",
  });
  assert.deepEqual(parseEvaluateArgs(["node", "evaluate.mjs"]), {});
});

test("evaluate CLI binds additive --report and --report-path", () => {
  assert.deepEqual(parseEvaluateArgs(["node", "evaluate.mjs", "--report"]), {
    report: true,
  });
  assert.deepEqual(parseEvaluateArgs(["node", "evaluate.mjs", "--report-path=out/evaluate-corvus-table.md"]), {
    report: true,
    reportPath: "out/evaluate-corvus-table.md",
  });
  assert.throws(() => parseEvaluateArgs(["node", "evaluate.mjs", "--report-path"]), /--report-path requires a file path/);
});

test("evaluate --pack runs that pack instead of the synthetic fixture", async () => {
  const result = await runEvaluateBenchmark({
    pack: "symbol-scope-dev-v0.1",
    root: ROOT,
  });
  assert.notEqual(result.label, "synthetic");
  assert.equal(result.packId, "symbol-scope-dev-v0.1");
  assert.ok(result.tracesExecuted > 0);
  assert.ok(Object.values(result.hardGates).every(Boolean));
});

test("evaluate without --pack runs the physical empirical board", async () => {
  const result = await runEvaluateBenchmark({ root: ROOT });
  assert.notEqual(result.label, "synthetic");
  assert.notEqual(result.pack?.id, "auth-region-after-interior-edit");
  assert.equal(result.verdict, "PASS");
  assert.equal(Object.hasOwn(result, "score"), false);
});

test("evaluate refuses an unknown pack instead of falling back to synthetic", async () => {
  await assert.rejects(
    () => runEvaluateBenchmark({ pack: "does-not-exist", root: ROOT }),
    /unknown pack|no traces/i,
  );
});

test("evaluate-pack routing stays off the holdout protocol writer", async () => {
  const source = await readFile(join(ROOT, "bench/evaluate-pack.mjs"), "utf8");
  assert.equal(source.includes("holdout-protocol"), false);
  assert.equal(source.includes("runPack("), false);
});

async function writeRecallMissPack(root, packId) {
  const tracked = "export const tracked = 1;\n";
  const required = "export const REQUIRED_GOLD_SENTINEL = 1;\n";
  const tracesDir = join(root, "bench/packs", packId, "traces");
  await mkdir(tracesDir, { recursive: true });
  const trace = {
    schemaVersion: 1,
    name: `${packId}/interior-edit/recall-miss`,
    source: { repository: "synthetic://recall-miss", commit: "0".repeat(40), license: "MIT" },
    initialFiles: {
      "src/tracked.ts": tracked,
      "src/required.ts": required,
    },
    events: [
      {
        type: "read",
        path: "src/tracked.ts",
        scope: "file",
        startLine: 1,
        endLine: 1,
        selector: "src/tracked.ts::file",
      },
      {
        type: "capture-request",
        task: "recall miss",
        budgetChars: 4000,
        requiredUnits: [
          {
            path: "src/required.ts",
            selector: "src/required.ts::file",
            sha256: createHash("sha256").update(required).digest("hex"),
          },
        ],
      },
    ],
  };
  await writeFile(join(tracesDir, "recall-miss.json"), `${JSON.stringify(trace, null, 2)}\n`);
}

test("on-disk pack pass requires required-current recall", async () => {
  const packId = "recall-miss-dev-v0.1";
  const root = join(tmpdir(), `freshctx-recall-miss-${process.pid}`);
  await rm(root, { recursive: true, force: true });
  await writeRecallMissPack(root, packId);
  try {
    const result = await runEvaluateBenchmark({ pack: packId, root });
    assert.equal(result.runs[0].staleBytes, 0);
    assert.ok(result.runs[0].requiredRecall < 1);
    assert.equal(result.runs[0].verdict, "fail");
    assert.equal(result.runs[0].reason, "required-recall");
    assert.equal(result.hardGates.fullRequiredRecall, false);
    assert.equal(result.hardGates.allCellsPassed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
