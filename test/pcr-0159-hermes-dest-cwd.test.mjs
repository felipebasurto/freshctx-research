import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertT1HostReadTools,
  t1HostReadToolsInvalidReason,
} from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  HERMES_CLI_PROVIDER,
  cliQueryArgs,
  runCliQuery,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import {
  hermesConfigYaml,
  hermesEnvForArm,
  hermesLaunchArgs,
} from "../docs/lab/hermes-trial-ts/launch-hermes.mjs";
import { hermesLaunchSpec } from "../docs/lab/multi-turn-trial/launch.mjs";
import { MODEL, PROMPT_T1, TARGET_FILE } from "../docs/lab/multi-turn-trial/pack.mjs";
import {
  destRootFromWorkCwd,
  isAllowedTrialTreePath,
} from "../docs/lab/pi-trial-ts/pack.mjs";

const DEST_SHA = "ee0e254f7168efb5b0558501a52f84fc60a945e9";
const DEST_ROOT = "/workspace/freshctx-measure-ee0e254f-multiturn";
const DEST_WORK = `${DEST_ROOT}/docs/lab/multi-turn-trial/.work/hermes/nothing`;
const DEST_WORK_SETTLEMENT = `${DEST_WORK}/${TARGET_FILE}`;
const DEST_HOST_CLONE = "/home/box/projects/freshctx/repos/hosts/hermes";
const DEST_HOST_REPOS = "/home/box/projects/freshctx/repos";
const DEST_HOST_FRESHCTX = "/home/box/projects/freshctx/repos/freshctx";
const DEST_T1_MESSAGES = 22;
const DEST_T1_TOOL_CALLS = 20;
const DEST_SETTLE =
  "SETTLE=NOT_FOUND (no existe src/settlement.ts ni el símbolo settleDailyLedger en los árboles disponibles)";
const DEST_AUTO_RPC_THROW =
  "Error: t1-read unexpected tool search_files (arm=nothing)";
const OFFICIAL_TAP = "549/0/0/549";
const DOOR_BLOB = "f8771c93894095348185ef3453a3c2498355b3c6";
const LOCK_BLOB = "4a953591e4b175e9fd69f13d6012831b01116dce";

function destT1Tools() {
  return [
    { toolCallId: "call_search_host", toolName: "search_files", args: { path: DEST_HOST_CLONE } },
    { toolCallId: "call_term_repos", toolName: "terminal", args: { path: DEST_HOST_REPOS } },
    { toolCallId: "call_search_freshctx", toolName: "search_files", args: { path: DEST_HOST_FRESHCTX } },
  ];
}

async function withFakeHermes(scriptBody, fn) {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0159-"));
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

test("dest ee0e254f leftover is host-clone search_files, not silent []", () => {
  assert.equal(DEST_SHA, "ee0e254f7168efb5b0558501a52f84fc60a945e9");
  assert.equal(DEST_ROOT, "/workspace/freshctx-measure-ee0e254f-multiturn");
  assert.equal(DEST_WORK.endsWith("/.work/hermes/nothing"), true);
  assert.equal(DEST_WORK_SETTLEMENT.endsWith(`/${TARGET_FILE}`), true);
  assert.equal(DEST_HOST_CLONE, "/home/box/projects/freshctx/repos/hosts/hermes");
  assert.equal(DEST_T1_MESSAGES, 22);
  assert.equal(DEST_T1_TOOL_CALLS, 20);
  assert.match(DEST_SETTLE, /SETTLE=NOT_FOUND/u);
  assert.match(DEST_SETTLE, /no existe src\/settlement\.ts/u);
  assert.equal(
    DEST_AUTO_RPC_THROW,
    "Error: t1-read unexpected tool search_files (arm=nothing)",
  );
  assert.doesNotMatch(DEST_AUTO_RPC_THROW, /recorded no host tools/u);
  assert.equal(OFFICIAL_TAP, "549/0/0/549");
  assert.equal(DOOR_BLOB, "f8771c93894095348185ef3453a3c2498355b3c6");
  assert.equal(LOCK_BLOB, "4a953591e4b175e9fd69f13d6012831b01116dce");
  assert.equal(HERMES_CLI_PROVIDER, "openai-api");
});

test("launch spec binds Hermes native cwd to dest work, not host clone", () => {
  const args = cliQueryArgs({ message: PROMPT_T1, workspace: DEST_WORK });
  const inAt = args.indexOf("--in");
  assert.ok(inAt >= 0, "cliQueryArgs must pass Hermes --in");
  assert.equal(args[inAt + 1], DEST_WORK);
  assert.equal(args.includes(DEST_HOST_CLONE), false);
  assert.ok(inAt < args.indexOf("chat"), "--in is a global flag before chat");
  const q = args.indexOf("-q");
  assert.equal(args[q + 1], PROMPT_T1);
  assert.deepEqual(args.slice(q + 2, q + 6), ["--provider", "openai-api", "--model", MODEL]);

  const yaml = hermesConfigYaml({ cwd: DEST_WORK });
  assert.match(yaml, /terminal:\s*\n\s+cwd:\s+/u);
  assert.match(yaml, new RegExp(DEST_WORK.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(yaml, /hosts\/hermes/u);

  const env = hermesEnvForArm({
    arm: "nothing",
    proxyBaseUrl: "http://127.0.0.1:9/v1",
    dumpDir: "/tmp/pcr-0159-dump",
    hermesHome: "/tmp/pcr-0159-home",
    workspace: DEST_WORK,
  });
  assert.equal(env.FRESHCTX_CWD, DEST_WORK);
  assert.equal(env.HERMES_TRIAL_WORKSPACE, DEST_WORK);
  assert.equal(env.TERMINAL_CWD, DEST_WORK);

  const launchArgs = hermesLaunchArgs("cli", { workspace: DEST_WORK });
  assert.deepEqual(launchArgs.slice(0, 2), ["--in", DEST_WORK]);
  assert.equal(launchArgs.at(-1), "chat");

  const spec = hermesLaunchSpec("nothing", {
    proxyBaseUrl: "http://127.0.0.1:9/v1",
    dumpDir: "/tmp/pcr-0159-dump",
    hermesHome: "/tmp/pcr-0159-home",
    workspace: DEST_WORK,
  });
  assert.equal(spec.env.TERMINAL_CWD, DEST_WORK);
  assert.equal(spec.env.HERMES_TRIAL_WORKSPACE, DEST_WORK);
});

test("host-clone search_files fail-closes leftover that names the wrong tree", () => {
  const tools = destT1Tools();
  const reason = t1HostReadToolsInvalidReason(tools, { workspace: DEST_WORK, destRoot: DEST_ROOT });
  assert.match(reason, /wrong tree/u);
  assert.match(reason, /hosts\/hermes/u);
  assert.doesNotMatch(reason, /unexpected tool search_files$/u);
  assert.doesNotMatch(reason, /recorded no host tools/u);
  assert.throws(
    () => assertT1HostReadTools(tools, { arm: "nothing", workspace: DEST_WORK, destRoot: DEST_ROOT }),
    (error) =>
      error instanceof Error
      && /leftover search_files of wrong tree/u.test(error.message)
      && error.message.includes(DEST_HOST_CLONE)
      && !/recorded no host tools/u.test(error.message),
  );
});

test("dest-work and dest-root trees are allowed; host clone is not", async () => {
  const dest = await mkdtemp(join(tmpdir(), "pcr-0159-dest-"));
  const work = join(dest, "docs/lab/multi-turn-trial/.work/hermes/nothing");
  await mkdir(join(work, "src"), { recursive: true });
  await writeFile(join(work, TARGET_FILE), "export function settleDailyLedger() { return \"ST0\"; }\n");
  await access(join(work, TARGET_FILE));

  assert.equal(destRootFromWorkCwd(work), dest);
  assert.equal(isAllowedTrialTreePath(work, { workspace: work }), true);
  assert.equal(isAllowedTrialTreePath(join(work, TARGET_FILE), { workspace: work }), true);
  assert.equal(isAllowedTrialTreePath(dest, { workspace: work }), true);
  assert.equal(isAllowedTrialTreePath(DEST_HOST_CLONE, { workspace: work, destRoot: dest }), false);
  assert.equal(isAllowedTrialTreePath(DEST_HOST_REPOS, { workspace: work, destRoot: dest }), false);
  assert.equal(isAllowedTrialTreePath(DEST_HOST_FRESHCTX, { workspace: work, destRoot: dest }), false);

  const destSearch = [{ toolName: "search_files", args: { path: work } }];
  assert.doesNotMatch(
    t1HostReadToolsInvalidReason(destSearch, { workspace: work, destRoot: dest }) ?? "",
    /wrong tree/u,
  );
  assert.match(
    t1HostReadToolsInvalidReason(destSearch, { workspace: work, destRoot: dest }),
    /unexpected tool search_files|dest-root search_files/u,
  );
});

test("runCliQuery passes --in dest work so Hermes file tools are not host-clone bound", async () => {
  const script = `
process.stdout.write(JSON.stringify(process.argv.slice(2)));
process.exit(0);
`;
  await withFakeHermes(script, async (dir) => {
    const work = join(dir, "docs/lab/multi-turn-trial/.work/hermes/nothing");
    await mkdir(join(work, "src"), { recursive: true });
    await writeFile(join(work, TARGET_FILE), "export function settleDailyLedger() { return \"ST0\"; }\n");
    const logPath = join(dir, "t1-read.cli.stderr.log");
    const query = await runCliQuery({
      cwd: work,
      message: PROMPT_T1,
      logPath,
      hermesHome: join(dir, "hermes-home"),
    });
    const argv = JSON.parse(query.stdout);
    const inAt = argv.indexOf("--in");
    assert.ok(inAt >= 0);
    assert.equal(argv[inAt + 1], work);
    assert.equal(argv.includes(DEST_HOST_CLONE), false);
    await access(join(work, TARGET_FILE));
  });
});
