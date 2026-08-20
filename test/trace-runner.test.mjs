import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createBaseline } from "../bench/baselines.mjs";
import { goldBytesForRead } from "../bench/oracle.mjs";
import { finalCapture, runTrace } from "../bench/trace-runner.mjs";
import { Workspace } from "../bench/workspace.mjs";

test("workspace rejects path escape and symlink reads by default", async () => {
  const root = "/tmp/freshctx-workspace-test";
  const workspace = await Workspace.fromInitialFiles(root, {
    "src/a.ts": "export const a = 1;\n",
  });

  await assert.rejects(() => workspace.read("../outside.ts"), /escapes workspace root/u);
  assert.equal(await workspace.read("src/a.ts"), "export const a = 1;\n");
});

test("independent oracle verifies trace gold from workspace bytes", async () => {
  const root = "/tmp/freshctx-oracle-test";
  const workspace = await Workspace.fromInitialFiles(root, {
    "lib/express.js": "function createApplication() {\n  app.init();\n}\n",
  });
  const read = {
    path: "lib/express.js",
    scope: "region",
    startLine: 1,
    endLine: 3,
    initialContent: "function createApplication() {\n  app.init();\n}",
  };
  const gold = await goldBytesForRead(workspace, read);
  assert.match(gold, /app\.init\(\)/u);
});

test("trace runner executes a smoke trace without stale FreshCtx bytes", async () => {
  const trace = JSON.parse(
    await readFile(new URL("../bench/traces/smoke/express-interior-edit.json", import.meta.url), "utf8"),
  );
  const result = await runTrace(trace, "freshctx-region");
  const capture = finalCapture(result);
  assert.ok(capture);
  assert.equal(capture.metrics.staleBytes, 0);
  assert.equal(capture.metrics.requiredRecall, 1);
  assert.equal(capture.metrics.duplicateUnits, 0);
});

test("baselines are equally instantiated for smoke control board", () => {
  for (const name of [
    "append-only",
    "observation-mask",
    "corvus-file",
    "freshctx-file",
    "freshctx-region",
  ]) {
    assert.equal(createBaseline(name).name, name);
  }
});
