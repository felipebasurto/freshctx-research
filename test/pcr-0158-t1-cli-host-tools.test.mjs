import assert from "node:assert/strict";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  FORCE_HOST_READ_TOOLS_LOG,
  assertT1HostReadTools,
  readDumpFunctionCallTools,
  readRecordedHostReadTools,
  t1HostReadToolsInvalidReason,
  t1ToolsForAssert,
  toolsFromHermesCliStdout,
  toolsFromResponsesFunctionCalls,
} from "../docs/lab/hermes-trial-ts/auto-rpc-host-read.mjs";
import {
  HERMES_CLI_PROVIDER,
  cliQueryArgs,
  runCliQuery,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import { MODEL, PROMPT_T1, TARGET_FILE, TARGET_SYMBOL } from "../docs/lab/multi-turn-trial/pack.mjs";

const DEST_SHA = "cbad126534f087a05ff1bd3dfc5d8190d6ad1c4c";
const DEST_LEFTOVER_HEAD = "0369525a";
const DEST_ROOT = "/workspace/freshctx-measure-cbad1265-multiturn";
const DEST_WORK_SETTLEMENT =
  "docs/lab/multi-turn-trial/.work/hermes/nothing/src/settlement.ts";
const DEST_T1_STDOUT_BYTES = 1793;
const DEST_T1_EXIT = 0;
const DEST_TOOL_CALLS = 8;
const DEST_AUTO_RPC_THROW =
  "Error: t1-read recorded no host tools (arm=nothing): []";
const DEST_SETTLE = "SETTLE=NOT_FOUND";
const DEST_FIND_MISS = "Path not found: src";
const DEST_DUMP002_TOOL_COUNT = 29;
const OFFICIAL_TAP = "549/0/0/549";
const DOOR_BLOB = "f8771c93894095348185ef3453a3c2498355b3c6";
const LOCK_BLOB = "4a953591e4b175e9fd69f13d6012831b01116dce";

/**
 * Dest leftover used `hermes chat -q` (not `-Q`). Hermes CLI prints
 * `[tool] name` spinner lines (NousResearch/hermes-agent quiet-mode leak).
 * Named dest tools only: find / pwd / grep. Do not invent the other 5.
 */
const DEST_T1_STDOUT = [
  `[tool] find ${TARGET_FILE}`,
  DEST_FIND_MISS,
  "[tool] pwd",
  `[tool] grep ${TARGET_SYMBOL}`,
  DEST_SETTLE,
].join("\n");

function destDump002Tools() {
  const names = ["read_file", "search_files"];
  while (names.length < DEST_DUMP002_TOOL_COUNT) {
    names.push(`dest_schema_${names.length}`);
  }
  return names.map((name) => ({
    type: "function",
    name,
    description: name,
    parameters: { type: "object", properties: {} },
  }));
}

function destDump002() {
  return {
    model: MODEL,
    instructions: "You are a coding agent.",
    input: [{ role: "user", content: [{ type: "input_text", text: PROMPT_T1 }] }],
    tools: destDump002Tools(),
    store: false,
    stream: true,
  };
}

async function withFakeHermes(scriptBody, fn) {
  const dir = await mkdtemp(join(tmpdir(), "pcr-0158-"));
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

test("dest cbad1265 leftover is live t1 recorder [], not 0157 SSE", () => {
  assert.equal(DEST_SHA, "cbad126534f087a05ff1bd3dfc5d8190d6ad1c4c");
  assert.equal(DEST_LEFTOVER_HEAD, "0369525a");
  assert.equal(DEST_ROOT, "/workspace/freshctx-measure-cbad1265-multiturn");
  assert.equal(DEST_WORK_SETTLEMENT, "docs/lab/multi-turn-trial/.work/hermes/nothing/src/settlement.ts");
  assert.equal(DEST_T1_STDOUT_BYTES, 1793);
  assert.equal(DEST_T1_EXIT, 0);
  assert.equal(DEST_TOOL_CALLS, 8);
  assert.equal(DEST_SETTLE, "SETTLE=NOT_FOUND");
  assert.equal(DEST_FIND_MISS, "Path not found: src");
  assert.equal(
    DEST_AUTO_RPC_THROW,
    "Error: t1-read recorded no host tools (arm=nothing): []",
  );
  assert.equal(HERMES_CLI_PROVIDER, "openai-api");
  const live = cliQueryArgs({ message: PROMPT_T1 });
  assert.deepEqual(live.slice(live.indexOf("-q") + 2, live.indexOf("-q") + 6), [
    "--provider",
    "openai-api",
    "--model",
    MODEL,
  ]);
  assert.equal(OFFICIAL_TAP, "549/0/0/549");
  assert.equal(DOOR_BLOB, "f8771c93894095348185ef3453a3c2498355b3c6");
  assert.equal(LOCK_BLOB, "4a953591e4b175e9fd69f13d6012831b01116dce");
});

test("CLI events=[] + missing jsonl is silent [] unless stdout/dump function_calls feed t1", async () => {
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0158-jsonl-"));
  await assert.rejects(() => access(join(dumpDir, FORCE_HOST_READ_TOOLS_LOG)));
  const recorded = await readRecordedHostReadTools(dumpDir);
  assert.deepEqual(recorded, []);
  assert.equal(t1ToolsForAssert({ eventTools: [], recordedTools: [] }).length, 0);
  assert.equal(
    t1HostReadToolsInvalidReason(t1ToolsForAssert({ eventTools: [], recordedTools: [] })),
    "t1-read recorded no host tools",
  );
});

test("dump 002.json tools (29) are advertised schema, not a recorded host-read list", async () => {
  const dump = destDump002();
  assert.equal(dump.tools.length, DEST_DUMP002_TOOL_COUNT);
  assert.equal(dump.tools.some((tool) => tool.name === "read_file"), true);
  assert.equal(dump.tools.some((tool) => tool.name === "search_files"), true);
  assert.equal(toolsFromResponsesFunctionCalls(dump).length, 0);
  assert.equal(toolsFromResponsesFunctionCalls(JSON.stringify(dump)).length, 0);
  const dumpDir = await mkdtemp(join(tmpdir(), "pcr-0158-dump002-"));
  await writeFile(join(dumpDir, "002.json"), `${JSON.stringify(dump)}\n`);
  const dumpTools = await readDumpFunctionCallTools(dumpDir, ["002.json"]);
  assert.deepEqual(dumpTools, []);
  assert.equal(
    t1ToolsForAssert({ eventTools: [], recordedTools: [], dumpTools }).length,
    0,
    "schema tools must not become host-read tools",
  );
});

test("Responses input function_call items are executed tools; tools array is not", () => {
  const executed = {
    model: MODEL,
    input: [
      { role: "user", content: [{ type: "input_text", text: PROMPT_T1 }] },
      {
        type: "function_call",
        call_id: "call_find",
        name: "find",
        arguments: JSON.stringify({ path: "src" }),
      },
      {
        type: "function_call_output",
        call_id: "call_find",
        output: DEST_FIND_MISS,
      },
    ],
    tools: destDump002Tools(),
    stream: true,
  };
  const tools = toolsFromResponsesFunctionCalls(executed);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].toolName, "find");
  assert.equal(tools[0].args.path, "src");
  assert.equal(executed.tools.length, DEST_DUMP002_TOOL_COUNT);
});

test("dest-shaped CLI stdout find/pwd/grep feeds t1; leftover find not silent []", () => {
  const cliTools = toolsFromHermesCliStdout(DEST_T1_STDOUT);
  assert.deepEqual(cliTools.map((tool) => tool.toolName), ["find", "pwd", "grep"]);
  assert.match(cliTools[0].args.raw ?? "", /settlement\.ts/u);
  assert.match(DEST_T1_STDOUT, /Path not found: src/u);
  assert.match(DEST_T1_STDOUT, /SETTLE=NOT_FOUND/u);
  const tools = t1ToolsForAssert({
    eventTools: [],
    recordedTools: [],
    cliTools,
    dumpTools: [],
  });
  assert.deepEqual(tools, cliTools);
  assert.throws(
    () => assertT1HostReadTools(tools, { arm: "nothing" }),
    (error) =>
      error instanceof Error
      && /leftover find/u.test(error.message)
      && !/recorded no host tools/u.test(error.message)
      && error.message.includes('"toolName":"find"'),
  );
});

test("runCliQuery returns dest stdout tools; t1 fail-closes leftover find", async () => {
  const script = `
process.stdout.write(${JSON.stringify(DEST_T1_STDOUT)});
process.exit(0);
`;
  await withFakeHermes(script, async (dir) => {
    const logPath = join(dir, "t1-read.cli.stderr.log");
    const query = await runCliQuery({
      message: PROMPT_T1,
      logPath,
      hermesHome: join(dir, "hermes-home"),
    });
    assert.equal(query.code, 0);
    assert.equal(query.reply, DEST_T1_STDOUT);
    assert.deepEqual(query.tools.map((tool) => tool.toolName), ["find", "pwd", "grep"]);
    const tools = t1ToolsForAssert({
      eventTools: [],
      recordedTools: [],
      cliTools: query.tools,
    });
    assert.throws(
      () => assertT1HostReadTools(tools, { arm: "nothing" }),
      /leftover find/u,
    );
    await access(logPath);
  });
});
