import assert from "node:assert/strict";
import { access, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { t1ToolsForAssert } from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  HERMES_CLI_STDERR_LOG_EMPTY,
  HERMES_CLI_STDERR_LOG_MISSING,
  HERMES_Q_EXPECTED_ONE_ARGUMENT,
  cliStderrLogMissingReason,
  hermesCliQueryFailedReason,
  runCliQuery,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import { launchChild } from "../docs/lab/hermes-trial-ts/launch-child.mjs";
import { MODEL, PROMPT_T1 } from "../docs/lab/multi-turn-trial/pack.mjs";

/** Dest 91b97f80 reconstructed t1 spawn (frozen dest leftover, not live cliQueryArgs). */
const DEST_T1_QUERY_ARGV = ["chat", "-q", PROMPT_T1, "--provider", "openai", "--model", MODEL];

async function withFakeHermes(scriptBody, fn) {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0152-"));
  const bin = join(dir, "hermes");
  await writeFile(bin, `#!/usr/bin/env node\n${scriptBody}\n`, { mode: 0o755 });
  const prev = process.env.HERMES_BIN;
  process.env.HERMES_BIN = bin;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.HERMES_BIN;
    else process.env.HERMES_BIN = prev;
  }
}

test("dest 91b97f80 t1 argv is post-0150; leftover is not argparse", () => {
  const q = DEST_T1_QUERY_ARGV.indexOf("-q");
  assert.ok(q >= 0);
  assert.equal(DEST_T1_QUERY_ARGV[q + 1], PROMPT_T1);
  assert.equal(DEST_T1_QUERY_ARGV.includes("--yolo"), false);
  assert.equal(DEST_T1_QUERY_ARGV.includes("--in"), false);
  assert.deepEqual(DEST_T1_QUERY_ARGV.slice(q + 2, q + 6), ["--provider", "openai", "--model", MODEL]);
  assert.equal(hermesCliQueryFailedReason({ code: 0, stderr: "" }), null);
  assert.notEqual(hermesCliQueryFailedReason({ code: 0, stderr: "" }), HERMES_Q_EXPECTED_ONE_ARGUMENT);
});

test("dest 91b97f80 t1-read.cli.stderr.log exists as 0 bytes (not ABSENT)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0152-dest-"));
  const logPath = join(dir, "t1-read.cli.stderr.log");
  await writeFile(logPath, "");
  await access(logPath);
  assert.equal((await stat(logPath)).size, 0);
  assert.equal(await cliStderrLogMissingReason(logPath), HERMES_CLI_STDERR_LOG_EMPTY);
  assert.notEqual(await cliStderrLogMissingReason(logPath), HERMES_CLI_STDERR_LOG_MISSING);
  assert.doesNotMatch(HERMES_CLI_STDERR_LOG_EMPTY, /EmptyStreamError/u);
  assert.doesNotMatch(HERMES_CLI_STDERR_LOG_EMPTY, /recorded no host tools/u);
});

test("0151 persist on silent exit writes 0-byte t1-read.cli.stderr.log", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0152-persist-"));
  const logPath = join(dir, "t1-read.cli.stderr.log");
  const child = launchChild({
    command: process.execPath,
    args: ["-e", "process.exit(0)"],
    logPath,
  });
  const result = await child.exit;
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  await access(logPath);
  assert.equal((await stat(logPath)).size, 0);
  assert.equal(await readFile(logPath, "utf8"), "");
});

test("runCliQuery throws empty persist, not missing and not empty model tools", async () => {
  await withFakeHermes("process.exit(0);", async (dir) => {
    const logPath = join(dir, "t1-read.cli.stderr.log");
    await assert.rejects(
      () => runCliQuery({ message: PROMPT_T1, logPath }),
      (error) => {
        assert.equal(String(error.message), HERMES_CLI_STDERR_LOG_EMPTY);
        assert.doesNotMatch(String(error.message), /t1-read\.cli\.stderr\.log missing/u);
        assert.doesNotMatch(String(error.message), /recorded no host tools/u);
        assert.doesNotMatch(String(error.message), /EmptyStreamError/u);
        assert.doesNotMatch(String(error.message), /expected one argument/u);
        return true;
      },
    );
    await access(logPath);
    assert.equal((await stat(logPath)).size, 0);
  });
});

test("empty persist is a recording miss, not empty model tools", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0152-assert-"));
  const logPath = join(dir, "t1-read.cli.stderr.log");
  await writeFile(logPath, "");
  assert.equal(await cliStderrLogMissingReason(logPath), HERMES_CLI_STDERR_LOG_EMPTY);
  assert.equal(
    t1ToolsForAssert({ eventTools: [], recordedTools: [] }).length,
    0,
    "empty recording is still empty; empty cli stderr must throw first",
  );
});
