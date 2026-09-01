import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { runHermesHoldoutPack } from "../bench/hermes-holdout.mjs";
import { runHermesSmokePack } from "../bench/hermes-smoke.mjs";
import { runHoldoutPack } from "../bench/holdout.mjs";
import { runPiHoldoutPack } from "../bench/pi-holdout.mjs";
import { runPiSmokePack } from "../bench/pi-smoke.mjs";
import {
  TRACKED_REPORT_PATHS,
  repoRoot,
  shouldWriteTrackedReports,
} from "../bench/report-artifacts.mjs";
import {
  NESTED_HELPER_SHOWDOWN,
  runNestedHelperShowdown,
} from "../bench/generate-symbol-pack.mjs";

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

  await runPiSmokePack({ strictGates: true });
  await runHermesSmokePack({ strictGates: true });
  await runPiHoldoutPack();
  await runHermesHoldoutPack();
  await runHoldoutPack();

  const after = await snapshotTrackedReports();
  assertSnapshotsUnchanged(before, after);
});

test("programmatic nested-helper runs do not rewrite tracked telemetry", async () => {
  const paths = [
    "bench/packs/symbol-scope-dev-v0.1/reports/nested-helper-showdown.jsonl",
    "bench/packs/symbol-scope-dev-v0.1/reports/nested-helper-showdown.md",
  ];
  const before = await Promise.all(
    paths.map((relativePath) => readFile(join(repoRoot(), relativePath))),
  );

  const previousWriteReports = process.env.FRESHCTX_WRITE_REPORTS;
  delete process.env.FRESHCTX_WRITE_REPORTS;
  try {
    await runNestedHelperShowdown({ root: repoRoot() });
  } finally {
    if (previousWriteReports === undefined) {
      delete process.env.FRESHCTX_WRITE_REPORTS;
    } else {
      process.env.FRESHCTX_WRITE_REPORTS = previousWriteReports;
    }
  }

  const after = await Promise.all(
    paths.map((relativePath) => readFile(join(repoRoot(), relativePath))),
  );
  assert.deepEqual(after, before);
});

test("CLI-invoked nested-helper runs write reports outside the repository", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "freshctx-report-opt-in-"));
  const sourceTrace = join(repoRoot(), NESTED_HELPER_SHOWDOWN.smokeTrace);
  const stagedTrace = join(tempRoot, NESTED_HELPER_SHOWDOWN.smokeTrace);
  try {
    await mkdir(dirname(stagedTrace), { recursive: true });
    await copyFile(sourceTrace, stagedTrace);
    const result = await runNestedHelperShowdown({ root: tempRoot, invoked: true });
    await access(join(result.reportsDir, "nested-helper-showdown.jsonl"));
    await access(join(result.reportsDir, "nested-helper-showdown.md"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("git working tree stays clean on all tracked report paths after hygiene runners", () => {
  const diff = spawnSync("git", ["diff", "--exit-code", "--", ...TRACKED_REPORT_PATHS], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  assert.equal(diff.status, 0, diff.stdout || diff.stderr);
  const status = spawnSync("git", ["status", "--porcelain", "--", ...TRACKED_REPORT_PATHS], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  assert.equal(status.status, 0);
  assert.equal(status.stdout.trim(), "", `unexpected tracked report changes:\n${status.stdout}`);
});
