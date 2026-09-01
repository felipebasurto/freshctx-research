import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { measuredSweScores as sweHostMeasuredSweScores } from "../docs/lab/swe-host-trial/pack.mjs";
import {
  ARMS,
  ASSERTS,
  BOARD_COLUMNS,
  HOSTS,
  KIND,
  MODEL,
  PACK_ID,
  SUCCESS_METRIC,
  SUCCESS_METRIC_NOT,
  measuredSweScores,
  validateArm,
} from "../docs/lab/success-board/pack.mjs";
import {
  loadSyntheticPack,
  scoreBoard,
  scoreCell,
  scoreTask,
} from "../docs/lab/success-board/board.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packDir = join(here, "../docs/lab/success-board");
const pcrPath = join(here, "../docs/lab/pcr/0141-success-board-fail-closed.md");
const runPath = join(packDir, "run.mjs");
const fixturePath = join(packDir, "fixture/synthetic-cells.json");

const SECRET_LEAK = /(?:sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._\-]{8,}|DEEPSEEK_API_KEY\s*=\s*\S+)/u;
const TREE_SITTER_NICKNAME = /\b(?:ts-engine|treesitter-engine|the TS parser)\b/iu;
const INVENTED_SWE_SCORE = /(?:Pass@1|SWE[- ]bench(?:\s+Pro)?(?:\s+score)?)\s*[=:]\s*[\d.]+/iu;
const COST_OR_TOKEN = /(?:cost_proxy|prompt_tokens|completion_tokens|usd|\$\d)/iu;

async function readBoardTreeText() {
  const files = ["README.md", "SCOPE.md", "pack.mjs", "board.mjs", "run.mjs", "fixture/synthetic-cells.json"];
  const chunks = [];
  for (const rel of files) {
    chunks.push(await readFile(join(packDir, rel), "utf8"));
  }
  chunks.push(await readFile(pcrPath, "utf8"));
  return chunks.join("\n");
}

test("PCR 0141 board is harness-only task pass/fail, not SWE Pass@1", () => {
  assert.equal(PACK_ID, "success-board-v0.1");
  assert.equal(KIND, "harness-only-success-board");
  assert.equal(MODEL, "deepseek-v4-flash");
  assert.deepEqual(HOSTS, ["pi", "hermes"]);
  assert.deepEqual(ARMS, ["nothing", "freshctx"]);
  assert.deepEqual(ASSERTS, ["exact_current_bytes", "stdout_current"]);
  assert.equal(SUCCESS_METRIC, "task-pass-fail-exact-current-and-stdout");
  assert.ok(SUCCESS_METRIC_NOT.includes("pass@1"));
  assert.ok(SUCCESS_METRIC_NOT.includes("swe-bench-score"));
  assert.ok(SUCCESS_METRIC_NOT.includes("cost"));
  assert.ok(SUCCESS_METRIC_NOT.includes("tokens"));
  assert.equal(measuredSweScores(), null);
  assert.equal(sweHostMeasuredSweScores(), null);
});

test("PCR 0141 compares nothing vs FreshCtx only and rejects a no-ts arm", () => {
  assert.doesNotThrow(() => validateArm("nothing"));
  assert.doesNotThrow(() => validateArm("freshctx"));
  assert.throws(() => validateArm("freshctx-no-ts"), /nothing\|freshctx/u);
  assert.throws(() => validateArm("freshctx-ts"), /nothing\|freshctx/u);
  assert.throws(() => validateArm("with-symbol"), /nothing\|freshctx/u);
});

test("PCR 0141 missing dump is fail, not skip-as-pass", () => {
  const missing = scoreCell({ missing: true });
  assert.equal(missing.verdict, "fail");
  assert.equal(missing.reason, "missing-dump");
  assert.notEqual(missing.verdict, "skip");
  assert.notEqual(missing.verdict, "pass");

  const absent = scoreCell(null);
  assert.equal(absent.verdict, "fail");
  assert.equal(absent.reason, "missing-dump");

  const incomplete = scoreCell({ turn: 2 });
  assert.equal(incomplete.verdict, "fail");
  assert.equal(incomplete.reason, "missing-dump");
});

test("PCR 0141 later-turn pass requires exact_current_bytes and stdout_current", () => {
  const pass = scoreCell({
    turn: 2,
    exact_current_bytes: "yes",
    stdout_current: "yes",
  });
  assert.equal(pass.verdict, "pass");
  assert.equal(pass.reason, "exact-current-and-stdout");

  const exactOnly = scoreCell({
    turn: 2,
    exact_current_bytes: true,
    stdout_current: false,
  });
  assert.equal(exactOnly.verdict, "fail");
  assert.equal(exactOnly.reason, "assert-failed");

  const stdoutOnly = scoreCell({
    turn: 2,
    exact_current_bytes: "no",
    stdout_current: "yes",
  });
  assert.equal(stdoutOnly.verdict, "fail");
  assert.equal(stdoutOnly.reason, "assert-failed");

  const turn1 = scoreCell({
    turn: 1,
    exact_current_bytes: "n/a",
    stdout_current: "n/a",
  });
  assert.equal(turn1.verdict, "n/a");
  assert.equal(turn1.reason, "asserts-not-applicable");
});

test("PCR 0141 task fail-closes when later dumps are missing or only n/a", () => {
  const passed = scoreTask([
    { turn: 1, exact_current_bytes: "n/a", stdout_current: "n/a" },
    { turn: 2, exact_current_bytes: "yes", stdout_current: "yes" },
  ]);
  assert.equal(passed.verdict, "pass");

  const missingLater = scoreTask([
    { turn: 1, exact_current_bytes: "n/a", stdout_current: "n/a" },
    { turn: 2, missing: true },
  ]);
  assert.equal(missingLater.verdict, "fail");
  assert.equal(missingLater.reason, "missing-dump");
  assert.notEqual(missingLater.verdict, "skip");

  const turn1Only = scoreTask([{ turn: 1, exact_current_bytes: "n/a", stdout_current: "n/a" }]);
  assert.equal(turn1Only.verdict, "fail");
  assert.equal(turn1Only.reason, "missing-dump");

  const assertFailed = scoreTask([
    { turn: 2, exact_current_bytes: "no", stdout_current: "no" },
  ]);
  assert.equal(assertFailed.verdict, "fail");
  assert.equal(assertFailed.reason, "assert-failed");
});

test("PCR 0141 synthetic pack scores nothing vs FreshCtx fail-closed", async () => {
  const pack = await loadSyntheticPack(fixturePath);
  assert.equal(pack.label, "synthetic");
  assert.equal(pack.liveHost, false);
  assert.equal(pack.notSweBench, true);
  assert.equal(pack.measuredSweScores, null);

  const board = scoreBoard(pack);
  assert.deepEqual(
    board.rows.map((row) => [row.host, row.arm, row.task, row.verdict, row.reason]),
    [
      ["pi", "nothing", "synthetic-mini-board-001", "fail", "assert-failed"],
      ["pi", "freshctx", "synthetic-mini-board-001", "pass", "exact-current-and-stdout"],
      ["hermes", "freshctx", "synthetic-mini-board-001", "fail", "missing-dump"],
    ],
  );
  assert.equal(board.measuredSweScores, null);
  assert.ok(!Object.hasOwn(board, "passAt1"));
});

test("PCR 0141 print columns stay pass/fail only: no cost, tokens, or invented SWE score", () => {
  assert.deepEqual(BOARD_COLUMNS, [
    "host",
    "arm",
    "task",
    "turn",
    "exact_current_bytes",
    "stdout_current",
    "verdict",
    "reason",
  ]);
  assert.ok(!BOARD_COLUMNS.includes("pass@1"));
  assert.ok(!BOARD_COLUMNS.includes("swe_score"));
  assert.ok(!BOARD_COLUMNS.includes("prompt_tokens"));
  assert.ok(!BOARD_COLUMNS.includes("cost_proxy_usd"));
  assert.equal(measuredSweScores(), null);
});

test("PCR 0141 docs stay honest about scope, Tree-sitter, official table, and scores", async () => {
  const text = await readBoardTreeText();
  assert.match(text, /fail-closed/iu);
  assert.match(text, /missing dump/iu);
  assert.match(text, /do not invent/iu);
  assert.match(text, /Never paste an API key/u);
  assert.match(text, /deepseek-v4-flash/u);
  assert.doesNotMatch(text, /deepseek-v4-pro/u);
  assert.doesNotMatch(text, SECRET_LEAK);
  assert.doesNotMatch(text, TREE_SITTER_NICKNAME);
  assert.doesNotMatch(text, INVENTED_SWE_SCORE);
  assert.doesNotMatch(text, COST_OR_TOKEN);
  assert.doesNotMatch(text, /official table (?:is now|becomes|moves to)/iu);
  assert.match(text, /549\/0\/0\/549/u);
  assert.match(text, /Isolated Semantic Engine/u);
  assert.match(text, /Tree-sitter/u);
  assert.match(text, /INDEX/u);
});

test("PCR 0141 run.mjs validate and print-board stay dry and key-safe", () => {
  const validate = spawnSync(process.execPath, [runPath, "validate"], { encoding: "utf8" });
  assert.equal(validate.status, 0, validate.stderr);
  assert.match(validate.stdout, /success-board-v0\.1/u);
  assert.match(validate.stdout, /harness-only-success-board/u);
  assert.doesNotMatch(validate.stdout + validate.stderr, SECRET_LEAK);
  assert.doesNotMatch(validate.stdout, INVENTED_SWE_SCORE);
  assert.doesNotMatch(validate.stdout, COST_OR_TOKEN);

  const printed = spawnSync(process.execPath, [runPath, "print-board"], { encoding: "utf8" });
  assert.equal(printed.status, 0, printed.stderr);
  assert.match(printed.stdout, /verdict/u);
  assert.match(printed.stdout, /missing-dump/u);
  assert.match(printed.stdout, /assert-failed/u);
  assert.doesNotMatch(printed.stdout, /not measured/u);
  assert.doesNotMatch(printed.stdout, INVENTED_SWE_SCORE);
  assert.doesNotMatch(printed.stdout, COST_OR_TOKEN);
  assert.doesNotMatch(printed.stdout + printed.stderr, SECRET_LEAK);
});

test("PCR 0141 door and lock blobs stay on hold", () => {
  const door = spawnSync("git", ["hash-object", "src/anchors.mjs"], { encoding: "utf8" });
  const lock = spawnSync("git", ["hash-object", "bench/repos.lock.json"], { encoding: "utf8" });
  assert.equal(door.status, 0, door.stderr);
  assert.equal(lock.status, 0, lock.stderr);
  assert.equal(door.stdout.trim(), "f8771c93894095348185ef3453a3c2498355b3c6");
  assert.equal(lock.stdout.trim(), "4a953591e4b175e9fd69f13d6012831b01116dce");
});
