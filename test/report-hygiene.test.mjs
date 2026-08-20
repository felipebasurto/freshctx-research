import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  TRACKED_REPORT_PATHS,
  repoRoot,
  shouldWriteTrackedReports,
} from "../bench/report-artifacts.mjs";

async function snapshotTrackedReports() {
  const root = repoRoot();
  const snapshots = new Map();
  for (const relPath of TRACKED_REPORT_PATHS) {
    snapshots.set(relPath, await readFile(join(root, relPath)));
  }
  return snapshots;
}

function assertSnapshotsUnchanged(before, after) {
  for (const relPath of TRACKED_REPORT_PATHS) {
    assert.deepEqual(
      after.get(relPath),
      before.get(relPath),
      `tracked report mutated during unit test: ${relPath}`,
    );
  }
}

test("shouldWriteTrackedReports defaults to no writes outside CLI entrypoints", () => {
  assert.equal(shouldWriteTrackedReports(), false);
  assert.equal(shouldWriteTrackedReports({ skipReportWrite: true }), false);
  assert.equal(shouldWriteTrackedReports({ invoked: true }), true);
});

test("adapter and holdout pack runners do not rewrite tracked reports", async () => {
  const before = await snapshotTrackedReports();

  const { runPiSmokePack } = await import("../bench/pi-smoke.mjs");
  const { runHermesSmokePack } = await import("../bench/hermes-smoke.mjs");
  const { runPiHoldoutPack } = await import("../bench/pi-holdout.mjs");
  const { runHermesHoldoutPack } = await import("../bench/hermes-holdout.mjs");
  const { runHoldoutPack } = await import("../bench/holdout.mjs");

  await runPiSmokePack({ strictGates: true });
  await runHermesSmokePack({ strictGates: true });
  await runPiHoldoutPack();
  await runHermesHoldoutPack();
  await runHoldoutPack();

  const after = await snapshotTrackedReports();
  assertSnapshotsUnchanged(before, after);
});

test("git working tree stays clean on tracked report markdown after hygiene runners", () => {
  const reportMarkdownPaths = TRACKED_REPORT_PATHS.filter((path) => path.endsWith(".md"));
  const diff = spawnSync("git", ["diff", "--exit-code", "--", ...reportMarkdownPaths], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  assert.equal(diff.status, 0, diff.stdout || diff.stderr);
  const status = spawnSync("git", ["status", "--porcelain", "--", ...reportMarkdownPaths], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  assert.equal(status.status, 0);
  assert.equal(status.stdout.trim(), "", `unexpected tracked report changes:\n${status.stdout}`);
});
