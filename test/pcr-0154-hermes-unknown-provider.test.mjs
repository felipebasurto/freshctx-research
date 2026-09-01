import assert from "node:assert/strict";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { t1ToolsForAssert } from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  HERMES_CLI_PROVIDER,
  HERMES_CLI_REJECTED_PROVIDER,
  HERMES_CLI_STDERR_LOG_EMPTY,
  HERMES_CLI_UNKNOWN_PROVIDER,
  HERMES_Q_EXPECTED_ONE_ARGUMENT,
  cliQueryArgs,
  cliQueryChannelReason,
  cliQueryProviderInvalidReason,
  hermesCliQueryFailedReason,
  runCliQuery,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import { hermesConfigYaml } from "../docs/lab/hermes-trial-ts/launch-hermes.mjs";
import { MODEL, PROMPT_T1 } from "../docs/lab/multi-turn-trial/pack.mjs";

/**
 * Dest 51fab717 spawn.json argv (do not invent). PCR 0153 empty-stderr path
 * did not throw: stdout 308, stderr 0, code 0.
 */
const DEST_T1_QUERY_ARGV = [
  "chat",
  "-q",
  PROMPT_T1,
  "--provider",
  "openai",
  "--model",
  MODEL,
];

/** Dest t1-read.cli.stdout.log unique lines (do not invent). */
const DEST_T1_STDOUT = [
  "Query: Lee el símbolo settleDailyLedger...",
  "Unknown provider 'openai'. Check 'hermes model' for available providers, or run 'hermes doctor' to diagnose config issues.",
  "Goodbye!",
].join("\n");

const DEST_SPAWN = {
  code: 0,
  stdoutBytes: 308,
  stderrBytes: 0,
  hermesHomeBytes: 3559,
};

async function withFakeHermes(scriptBody, fn) {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0154-"));
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

test("dest 51fab717 t1 spawn still passed --provider openai; leftover is not argparse", () => {
  const q = DEST_T1_QUERY_ARGV.indexOf("-q");
  assert.ok(q >= 0);
  assert.equal(DEST_T1_QUERY_ARGV[q + 1], PROMPT_T1);
  assert.deepEqual(DEST_T1_QUERY_ARGV.slice(q + 2, q + 6), ["--provider", "openai", "--model", MODEL]);
  assert.equal(cliQueryProviderInvalidReason(DEST_T1_QUERY_ARGV), HERMES_CLI_UNKNOWN_PROVIDER);
  assert.equal(hermesCliQueryFailedReason({ code: 0, stderr: "" }), null);
  assert.notEqual(hermesCliQueryFailedReason({ code: 0, stderr: "" }), HERMES_Q_EXPECTED_ONE_ARGUMENT);
});

test("dest 51fab717 stdout is Unknown provider openai + Goodbye; 0153 empty-stderr path did not throw", () => {
  assert.match(DEST_T1_STDOUT, /Unknown provider 'openai'/u);
  assert.match(DEST_T1_STDOUT, /hermes model/u);
  assert.match(DEST_T1_STDOUT, /hermes doctor/u);
  assert.match(DEST_T1_STDOUT, /Goodbye!/u);
  assert.equal(DEST_SPAWN.code, 0);
  assert.equal(DEST_SPAWN.stdoutBytes, 308);
  assert.equal(DEST_SPAWN.stderrBytes, 0);
  assert.equal(DEST_SPAWN.hermesHomeBytes, 3559);
  assert.equal(
    cliQueryChannelReason({ stderr: "", stdout: DEST_T1_STDOUT }),
    null,
    "0153 oneshot stdout has bytes; empty-stderr path must not throw",
  );
  assert.notEqual(cliQueryChannelReason({ stderr: "", stdout: DEST_T1_STDOUT }), HERMES_CLI_STDERR_LOG_EMPTY);
});

test("dest 51fab717 exit 0 + stdout Unknown provider is a CLI reject, not empty model tools", () => {
  assert.equal(
    hermesCliQueryFailedReason({
      code: DEST_SPAWN.code,
      stderr: "",
      stdout: DEST_T1_STDOUT,
    }),
    HERMES_CLI_UNKNOWN_PROVIDER,
  );
  assert.doesNotMatch(HERMES_CLI_UNKNOWN_PROVIDER, /recorded no host tools/u);
  assert.equal(
    t1ToolsForAssert({ eventTools: [], recordedTools: [] }).length,
    0,
    "empty recording is still empty; unknown provider must throw first",
  );
});

test("cliQueryArgs fail-closes --provider openai; Hermes CLI dump-proxy name is openai-api", () => {
  const args = cliQueryArgs({ message: PROMPT_T1 });
  const q = args.indexOf("-q");
  assert.equal(args[q + 1], PROMPT_T1);
  assert.equal(args.includes(HERMES_CLI_REJECTED_PROVIDER), false);
  assert.deepEqual(args.slice(q + 2, q + 6), ["--provider", HERMES_CLI_PROVIDER, "--model", MODEL]);
  assert.equal(HERMES_CLI_PROVIDER, "openai-api");
  assert.equal(HERMES_CLI_REJECTED_PROVIDER, "openai");
  assert.equal(cliQueryProviderInvalidReason(args), null);
  assert.equal(
    cliQueryProviderInvalidReason(["chat", "-q", PROMPT_T1, "--provider", "openai", "--model", MODEL]),
    HERMES_CLI_UNKNOWN_PROVIDER,
  );
});

test("isolated HERMES_HOME config uses openai-api, not rejected openai", () => {
  const yaml = hermesConfigYaml({});
  assert.match(yaml, /provider:\s*openai-api/u);
  assert.doesNotMatch(yaml, /^provider:\s*openai\s*$/mu);
});

test("runCliQuery throws dest Unknown provider, not empty host tools", async () => {
  const script = `
process.stdout.write(${JSON.stringify(DEST_T1_STDOUT)});
process.exit(0);
`;
  await withFakeHermes(script, async (dir) => {
    const logPath = join(dir, "t1-read.cli.stderr.log");
    await assert.rejects(
      () => runCliQuery({ message: PROMPT_T1, logPath, hermesHome: join(dir, "hermes-home") }),
      (error) => {
        assert.equal(String(error.message), HERMES_CLI_UNKNOWN_PROVIDER);
        assert.doesNotMatch(String(error.message), /recorded no host tools/u);
        assert.doesNotMatch(String(error.message), /CLI child persisted 0 bytes/u);
        return true;
      },
    );
    await access(logPath);
  });
});
