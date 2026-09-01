import assert from "node:assert/strict";
import test from "node:test";

import { hermesLaunchArgs } from "../docs/lab/hermes-trial-ts/launch-hermes.mjs";
import {
  cliQueryArgs,
  cliQueryArgvInvalidReason,
  hermesCliQueryFailedReason,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import { MODEL, PROMPT_T1 } from "../docs/lab/multi-turn-trial/pack.mjs";
import { t1ToolsForAssert } from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";

/** Dest 88dcf52f hermes.stderr.log: argparse printed this on the t1 spawn. */
const DEST_Q_ERROR = "hermes chat: error: argument -q/--query: expected one argument";

/** Persistent CLI launch argv from hermesLaunchArgs("cli") on dest 88dcf52f. */
const DEST_LAUNCH_ARGV = ["chat", "-q"];

/** t1 runCliQuery argv from cliQueryArgs before this leftover. */
const DEST_T1_QUERY_ARGV = [
  "chat",
  "-q",
  "--provider",
  "openai",
  "--model",
  MODEL,
  PROMPT_T1,
];

test("dest 88dcf52f CLI launch argv leaves -q without a query", () => {
  assert.deepEqual(DEST_LAUNCH_ARGV, ["chat", "-q"]);
  assert.equal(cliQueryArgvInvalidReason(DEST_LAUNCH_ARGV), DEST_Q_ERROR);
});

test("dest 88dcf52f t1 cliQueryArgs put a flag after -q", () => {
  assert.equal(DEST_T1_QUERY_ARGV[1], "-q");
  assert.equal(DEST_T1_QUERY_ARGV[2], "--provider");
  assert.equal(cliQueryArgvInvalidReason(DEST_T1_QUERY_ARGV), DEST_Q_ERROR);
});

test("cliQueryArgs puts the t1 prompt immediately after -q", () => {
  const args = cliQueryArgs({ message: PROMPT_T1 });
  const q = args.indexOf("-q");
  assert.ok(q >= 0, "cliQueryArgs must pass -q");
  assert.equal(args[q + 1], PROMPT_T1);
  assert.equal(cliQueryArgvInvalidReason(args), null);
  assert.notEqual(args[q + 1]?.startsWith("-"), true);
});

test("hermesLaunchArgs(cli) does not emit -q without a query", () => {
  const args = hermesLaunchArgs("cli");
  assert.equal(cliQueryArgvInvalidReason(args), null);
  const q = args.indexOf("-q");
  if (q >= 0) {
    assert.ok(args[q + 1] && !String(args[q + 1]).startsWith("-"));
  }
});

test("empty or flag-shaped -q message fail-closes", () => {
  assert.throws(() => cliQueryArgs({ message: "" }), /expected one argument|-q|--query/u);
  assert.throws(() => cliQueryArgs({ message: "--provider" }), /expected one argument|-q|--query/u);
  assert.throws(() => cliQueryArgs({}), /expected one argument|-q|--query/u);
});

test("CLI argparse death is not recorded as empty model tools", () => {
  assert.equal(hermesCliQueryFailedReason({ code: 2, stderr: `${DEST_Q_ERROR}\n${DEST_Q_ERROR}\n` }), DEST_Q_ERROR);
  assert.equal(
    t1ToolsForAssert({ eventTools: [], recordedTools: [] }).length,
    0,
    "empty recording is still empty; spawn failure must throw first",
  );
});
