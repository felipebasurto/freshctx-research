import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ARMS,
  HOSTS,
  KIND,
  MODEL,
  PACK_ID,
  SUCCESS_METRIC,
  freshCtxOn,
  hostHowTo,
  listTaskCards,
  loadTaskCard,
  measuredSweScores,
  printColumnNames,
  redactSecretValue,
  resolveRepoRoot,
  validateArm,
  validateModel,
} from "../docs/lab/swe-host-trial/pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packDir = join(here, "../docs/lab/swe-host-trial");
const pcrPath = join(here, "../docs/lab/pcr/0138-swe-host-trial-scaffold.md");
const runPath = join(packDir, "run.mjs");

const SECRET_LEAK = /(?:sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._\-]{8,}|DEEPSEEK_API_KEY\s*=\s*\S+)/u;
const TREE_SITTER_NICKNAME = /\b(?:ts-engine|treesitter-engine|the TS parser)\b/iu;
const INVENTED_SWE_SCORE = /(?:Pass@1|SWE[- ]bench(?:\s+Pro)?(?:\s+score)?)\s*[=:]\s*[\d.]+/iu;

async function readPackTreeText() {
  const files = [
    "README.md",
    "PLAN.md",
    "BATTERY.md",
    "SCOPE.md",
    "pack.mjs",
    "run.mjs",
    "print-columns.mjs",
    "tasks/synthetic-mini-ledger.json",
    "fixture/mini-ledger/README.md",
    "fixture/mini-ledger/src/settle.mjs",
  ];
  const chunks = [];
  for (const rel of files) {
    chunks.push(await readFile(join(packDir, rel), "utf8"));
  }
  chunks.push(await readFile(pcrPath, "utf8"));
  return chunks.join("\n");
}

test("PCR 0138 pack is a host-eval scaffold, not a SWE-bench dump", () => {
  assert.equal(PACK_ID, "swe-host-trial-v0.1");
  assert.equal(KIND, "host-eval-scaffold");
  assert.equal(MODEL, "deepseek-v4-flash");
  assert.deepEqual(HOSTS, ["pi", "hermes"]);
  assert.deepEqual(ARMS, ["nothing", "freshctx"]);
  assert.equal(SUCCESS_METRIC, "host-request-bytes-and-resolution");
  assert.equal(measuredSweScores(), null);
});

test("PCR 0138 FreshCtx on/off is the only arm axis", () => {
  assert.equal(freshCtxOn("nothing"), false);
  assert.equal(freshCtxOn("freshctx"), true);
  assert.doesNotThrow(() => validateArm("nothing"));
  assert.doesNotThrow(() => validateArm("freshctx"));
  assert.throws(() => validateArm("freshctx-ts"), /nothing\|freshctx/u);
  assert.throws(() => validateArm("freshctx-no-ts"), /nothing\|freshctx/u);
});

test("PCR 0138 pins DeepSeek v4 flash and rejects other models", () => {
  assert.doesNotThrow(() => validateModel("deepseek-v4-flash"));
  assert.throws(() => validateModel("deepseek-v4-pro"), /deepseek-v4-flash/u);
  assert.throws(() => validateModel("gpt-4o"), /deepseek-v4-flash/u);
});

test("PCR 0138 task card is SWE-shaped and locally synthetic", () => {
  const cards = listTaskCards();
  assert.equal(cards.length, 1);
  assert.equal(cards[0], "synthetic-mini-ledger-001");
  const card = loadTaskCard("synthetic-mini-ledger-001");
  assert.equal(card.instance_id, "synthetic-mini-ledger-001");
  assert.equal(card.origin, "synthetic-local-fixture");
  assert.equal(card.notFromSweBench, true);
  assert.equal(card.repo, "docs/lab/swe-host-trial/fixture/mini-ledger");
  assert.equal(card.base_commit, null);
  assert.match(card.problem_statement, /settleDaily/u);
  assert.deepEqual(card.fail_to_pass, ["node --test test/settle.test.mjs"]);
  assert.deepEqual(card.pass_to_pass, []);
  assert.deepEqual(card.host_read, {
    path: "src/settle.mjs",
    scope: "symbol",
    selector: "settleDaily",
  });
  assert.equal(card.success_metric, SUCCESS_METRIC);
  assert.ok(card.success_metric_not.includes("pass@1"));
  assert.ok(card.success_metric_not.includes("swe-bench-score"));
});

test("PCR 0138 how-to covers Pi and Hermes FreshCtx on/off without pasting keys", () => {
  for (const host of HOSTS) {
    for (const arm of ARMS) {
      const guide = hostHowTo({ host, arm });
      assert.equal(guide.host, host);
      assert.equal(guide.arm, arm);
      assert.equal(guide.model, "deepseek-v4-flash");
      assert.equal(guide.freshCtx, arm === "freshctx");
      assert.equal(guide.neverPasteApiKey, true);
      assert.ok(guide.commands.some((line) => line.includes("deepseek-v4-flash")));
      assert.ok(guide.commands.every((line) => !SECRET_LEAK.test(line)));
      if (arm === "freshctx") {
        assert.ok(guide.commands.some((line) => /adapters\/(?:pi|hermes)/u.test(line)));
      } else {
        assert.ok(guide.commands.every((line) => !/install\.mjs|extension\.ts/u.test(line)));
      }
    }
  }
});

test("PCR 0138 print columns have no invented SWE score and scores stay null", () => {
  const columns = printColumnNames();
  assert.deepEqual(columns, [
    "host",
    "arm",
    "task",
    "turn",
    "request_bytes",
    "prompt_tokens",
    "resolution",
    "fail_to_pass",
  ]);
  assert.ok(!columns.includes("pass@1"));
  assert.ok(!columns.includes("swe_score"));
  assert.equal(measuredSweScores(), null);
});

test("PCR 0138 redactSecretValue never echoes API keys", () => {
  assert.equal(redactSecretValue("Bearer SECRETKEY"), "[redacted]");
  assert.equal(redactSecretValue("sk-abcdefghijklmnop"), "[redacted]");
  assert.equal(redactSecretValue("deepseek-v4-flash"), "deepseek-v4-flash");
});

test("PCR 0138 resolveRepoRoot finds both host adapters", () => {
  const root = resolveRepoRoot();
  assert.equal(root, join(here, ".."));
});

test("PCR 0138 docs stay honest about scope, keys, Tree-sitter, and scores", async () => {
  const text = await readPackTreeText();
  assert.match(text, /not a (?:full )?SWE-bench dump/iu);
  assert.match(text, /do not invent/iu);
  assert.match(text, /Never paste an API key/u);
  assert.match(text, /deepseek-v4-flash/u);
  assert.doesNotMatch(text, /deepseek-v4-pro/u);
  assert.doesNotMatch(text, SECRET_LEAK);
  assert.doesNotMatch(text, TREE_SITTER_NICKNAME);
  assert.doesNotMatch(text, INVENTED_SWE_SCORE);
  assert.doesNotMatch(text, /official table (?:is now|becomes|moves to)/iu);
  assert.match(text, /549\/0\/0\/549/u);
  assert.match(text, /Isolated Semantic Engine/u);
  assert.match(text, /Tree-sitter/u);
});

test("PCR 0138 run.mjs validate and print-columns stay dry and key-safe", () => {
  const validate = spawnSync(process.execPath, [runPath, "validate"], { encoding: "utf8" });
  assert.equal(validate.status, 0, validate.stderr);
  assert.match(validate.stdout, /swe-host-trial-v0\.1/u);
  assert.match(validate.stdout, /host-eval-scaffold/u);
  assert.doesNotMatch(validate.stdout + validate.stderr, SECRET_LEAK);

  const columns = spawnSync(process.execPath, [runPath, "print-columns"], { encoding: "utf8" });
  assert.equal(columns.status, 0, columns.stderr);
  assert.match(columns.stdout, /not measured/u);
  assert.doesNotMatch(columns.stdout, INVENTED_SWE_SCORE);

  const how = spawnSync(process.execPath, [runPath, "how-to", "--host=hermes", "--arm=freshctx"], {
    encoding: "utf8",
    env: { ...process.env, DEEPSEEK_API_KEY: "sk-SHOULD-NOT-PRINT", OPENAI_API_KEY: "sk-ALSO-HIDDEN" },
  });
  assert.equal(how.status, 0, how.stderr);
  assert.match(how.stdout, /hermes chat --provider openai --model deepseek-v4-flash/u);
  assert.doesNotMatch(how.stdout + how.stderr, /sk-SHOULD-NOT-PRINT|sk-ALSO-HIDDEN/u);
});

test("PCR 0138 pack directory has no dumped SWE-bench instances", async () => {
  const taskNames = await readdir(join(packDir, "tasks"));
  assert.deepEqual(taskNames, ["synthetic-mini-ledger.json"]);
  const card = JSON.parse(await readFile(join(packDir, "tasks/synthetic-mini-ledger.json"), "utf8"));
  assert.equal(card.notFromSweBench, true);
  assert.equal(card.base_commit, null);
});
