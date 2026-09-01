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
  cliQueryArgs,
  cliQueryChannelReason,
  cliQueryCompanionPaths,
  cliStderrLogMissingReason,
  hermesCliQueryFailedReason,
  runCliQuery,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import {
  CLI_PROTOCOL_SPAWNS_PERSISTENT_CHILD,
  detectHermesProtocol,
  hermesLaunchArgs,
} from "../docs/lab/hermes-trial-ts/launch-hermes.mjs";
import { CHILD_STDIO } from "../docs/lab/hermes-trial-ts/launch-child.mjs";
import { MODEL, PROMPT_T1 } from "../docs/lab/multi-turn-trial/pack.mjs";

/** Dest f3f56e8e reconstructed t1 spawn from dest cliQueryArgs + PROMPT_T1. */
const DEST_T1_QUERY_ARGV = cliQueryArgs({ message: PROMPT_T1 });

/**
 * Hermes Agent `chat -q` help on NousResearch/hermes-agent (parser, not dest
 * guess). Piped stdio is a non-TTY: oneshot/quiet is implied.
 */
const HERMES_Q_NON_TTY_CONTRACT =
  "On a real TTY the prompt seeds an interactive session (submitted literally as the first turn); combined with --oneshot or -Q, or on a non-TTY, it answers and exits.";

async function withFakeHermes(scriptBody, fn) {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0153-"));
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

test("dest f3f56e8e t1 argv is post-0150; leftover is not argparse", () => {
  const q = DEST_T1_QUERY_ARGV.indexOf("-q");
  assert.ok(q >= 0);
  assert.equal(DEST_T1_QUERY_ARGV[q + 1], PROMPT_T1);
  assert.equal(DEST_T1_QUERY_ARGV.includes("--yolo"), false);
  assert.equal(DEST_T1_QUERY_ARGV.includes("--in"), false);
  assert.deepEqual(DEST_T1_QUERY_ARGV.slice(q + 2, q + 6), ["--provider", "openai", "--model", MODEL]);
  assert.equal(hermesCliQueryFailedReason({ code: 0, stderr: "" }), null);
  assert.notEqual(hermesCliQueryFailedReason({ code: 0, stderr: "" }), HERMES_Q_EXPECTED_ONE_ARGUMENT);
});

test("dest f3f56e8e t1-read.cli.stderr.log exists as 0 bytes; 0152 empty throw is not the leftover", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0153-dest-"));
  const logPath = join(dir, "t1-read.cli.stderr.log");
  await writeFile(logPath, "");
  await access(logPath);
  assert.equal((await stat(logPath)).size, 0);
  assert.equal(await cliStderrLogMissingReason(logPath), HERMES_CLI_STDERR_LOG_EMPTY);
  assert.notEqual(await cliStderrLogMissingReason(logPath), HERMES_CLI_STDERR_LOG_MISSING);
  assert.match(HERMES_CLI_STDERR_LOG_EMPTY, /CLI child persisted 0 bytes/u);
  assert.doesNotMatch(HERMES_CLI_STDERR_LOG_EMPTY, /EmptyStreamError/u);
  assert.doesNotMatch(HERMES_CLI_STDERR_LOG_EMPTY, /recorded no host tools/u);
});

test("launchChild stdio is pipes so Hermes -q is non-TTY oneshot (stderr may be 0)", () => {
  assert.deepEqual(CHILD_STDIO, ["pipe", "pipe", "pipe"]);
  assert.match(HERMES_Q_NON_TTY_CONTRACT, /non-TTY/u);
  assert.match(HERMES_Q_NON_TTY_CONTRACT, /answers and exits/u);
  assert.equal(detectHermesProtocol("Usage: hermes chat -q"), "cli");
});

test("empty stderr plus oneshot stdout is a query log, not HERMES_CLI_STDERR_LOG_EMPTY", () => {
  assert.equal(
    cliQueryChannelReason({ stderr: "", stdout: "SETTLE=ST1\n", hermesHomeLog: "" }),
    null,
  );
  assert.equal(
    cliQueryChannelReason({ stderr: "", stdout: "", hermesHomeLog: "" }),
    HERMES_CLI_STDERR_LOG_EMPTY,
  );
});

test("runCliQuery accepts piped -q stdout when stderr persist is 0 bytes", async () => {
  await withFakeHermes("process.stdout.write('SETTLE=ST1\\n'); process.exit(0);", async (dir) => {
    const logPath = join(dir, "t1-read.cli.stderr.log");
    const result = await runCliQuery({ message: PROMPT_T1, logPath, hermesHome: join(dir, "hermes-home") });
    assert.equal(result.reply, "SETTLE=ST1\n");
    await access(logPath);
    assert.equal((await stat(logPath)).size, 0);
    const paths = cliQueryCompanionPaths(logPath);
    assert.equal(await readFile(paths.stdoutLog, "utf8"), "SETTLE=ST1\n");
    const spawn = JSON.parse(await readFile(paths.spawnLog, "utf8"));
    assert.equal(spawn.stderrBytes, 0);
    assert.ok(spawn.stdoutBytes > 0);
    assert.deepEqual(spawn.args.slice(0, 3), ["chat", "-q", PROMPT_T1]);
  });
});

test("CLI protocol does not spawn a persistent hermes chat sibling on HERMES_HOME", () => {
  assert.equal(CLI_PROTOCOL_SPAWNS_PERSISTENT_CHILD, false);
  assert.deepEqual(hermesLaunchArgs("cli"), ["chat"]);
});

test("all-empty stdio is still 0152 empty persist, not empty model tools", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0153-assert-"));
  const logPath = join(dir, "t1-read.cli.stderr.log");
  await writeFile(logPath, "");
  assert.equal(cliQueryChannelReason({ stderr: "", stdout: "", hermesHomeLog: "" }), HERMES_CLI_STDERR_LOG_EMPTY);
  assert.equal(
    t1ToolsForAssert({ eventTools: [], recordedTools: [] }).length,
    0,
    "empty recording is still empty; all-channel silent must throw first",
  );
});
