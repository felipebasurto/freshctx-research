import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { t1ToolsForAssert } from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  HERMES_CLI_STDERR_LOG_MISSING,
  cliStderrLogMissingReason,
  runCliQuery,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import { launchChild } from "../docs/lab/hermes-trial-ts/launch-child.mjs";
import { detectHermesProtocol } from "../docs/lab/hermes-trial-ts/launch-hermes.mjs";
import { MODEL, PROMPT_T1 } from "../docs/lab/multi-turn-trial/pack.mjs";

/** Dest 1caaab4d hermes-home/logs: SQLite warning only. No argparse. No EmptyStreamError. */
const DEST_HERMES_HOME_STDERR = "SQLite WAL-reset\n";

/** Dest 1caaab4d reconstructed t1 spawn (frozen dest leftover, not live cliQueryArgs). */
const DEST_T1_QUERY_ARGV = ["chat", "-q", PROMPT_T1, "--provider", "openai", "--model", MODEL];

async function withFakeHermes(stderrText, fn) {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0151-"));
  const bin = join(dir, "hermes");
  await writeFile(
    bin,
    `#!/usr/bin/env node\nprocess.stderr.write(${JSON.stringify(stderrText)});\nprocess.exit(0);\n`,
    { mode: 0o755 },
  );
  const prev = process.env.HERMES_BIN;
  process.env.HERMES_BIN = bin;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.HERMES_BIN;
    else process.env.HERMES_BIN = prev;
  }
}

test("dest 1caaab4d detectHermesProtocol is cli so hermes.stderr.log is not the t1 query log", () => {
  assert.equal(detectHermesProtocol("Usage: hermes chat -q"), "cli");
  assert.equal(detectHermesProtocol("chat -q"), "cli");
});

test("dest 1caaab4d t1 argv is post-0150 (-q then prompt); leftover is not argparse", () => {
  const q = DEST_T1_QUERY_ARGV.indexOf("-q");
  assert.ok(q >= 0);
  assert.equal(DEST_T1_QUERY_ARGV[q + 1], PROMPT_T1);
  assert.ok(PROMPT_T1.includes("settleDailyLedger"));
  assert.equal(DEST_T1_QUERY_ARGV.includes("--yolo"), false);
  assert.equal(DEST_T1_QUERY_ARGV.includes("--in"), false);
  assert.deepEqual(DEST_T1_QUERY_ARGV.slice(q + 2, q + 6), ["--provider", "openai", "--model", MODEL]);
});

test("await child.exit without stop() persists logPath (dest t1-read.cli.stderr.log hole)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0151-exit-"));
  const logPath = join(dir, "t1-read.cli.stderr.log");
  const child = launchChild({
    command: process.execPath,
    args: ["-e", `process.stderr.write(${JSON.stringify(DEST_HERMES_HOME_STDERR)})`],
    logPath,
  });
  await child.exit;
  const text = await readFile(logPath, "utf8");
  assert.match(text, /SQLite WAL-reset/u);
});

test("runCliQuery persists t1-read.cli.stderr.log after child.exit", async () => {
  await withFakeHermes(DEST_HERMES_HOME_STDERR, async (dir) => {
    const logPath = join(dir, "t1-read.cli.stderr.log");
    await runCliQuery({ message: PROMPT_T1, logPath });
    const text = await readFile(logPath, "utf8");
    assert.match(text, /SQLite WAL-reset/u);
    assert.equal(await cliStderrLogMissingReason(logPath), null);
  });
});

test("runCliQuery without logPath fail-closes; dest log was absent", async () => {
  await withFakeHermes(DEST_HERMES_HOME_STDERR, async () => {
    await assert.rejects(
      () => runCliQuery({ message: PROMPT_T1 }),
      (error) => {
        assert.match(String(error.message), /t1-read\.cli\.stderr\.log missing|logPath/u);
        assert.doesNotMatch(String(error.message), /recorded no host tools/u);
        return true;
      },
    );
  });
});

test("absent CLI stderr is a recording miss, not empty model tools", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0151-miss-"));
  const logPath = join(dir, "t1-read.cli.stderr.log");
  await assert.rejects(() => access(logPath), { code: "ENOENT" });
  assert.equal(await cliStderrLogMissingReason(logPath), HERMES_CLI_STDERR_LOG_MISSING);
  assert.equal(await cliStderrLogMissingReason(""), HERMES_CLI_STDERR_LOG_MISSING);
  assert.equal(
    t1ToolsForAssert({ eventTools: [], recordedTools: [] }).length,
    0,
    "empty recording is still empty; missing cli stderr must throw first",
  );
});
