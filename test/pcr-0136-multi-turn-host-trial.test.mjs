import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { CELLS as TWO_TURN_CELLS } from "../docs/lab/pi-trial-ts/pack.mjs";
import { exportFunctionBlock } from "../docs/lab/pi-trial-ts/live.mjs";
import {
  ARMS,
  CELLS,
  HOSTS,
  LOOKALIKE_MARKER,
  LOOKALIKE_SYMBOL,
  MARKER_SEQUENCE,
  MARKER_V0,
  MARKER_V1,
  MARKER_V2,
  MODEL,
  MUTATE_FLIPS,
  PROMPT_T1,
  PROMPT_T2,
  SIBLING_MARKER,
  TARGET_FILE,
  TARGET_SYMBOL,
  expectedMarkerForCell,
  fixtureRoot,
  freshCtxEnvForArm,
  hostReadToolArgs,
  parseHostArg,
  priorMarkersForCell,
  promptForCell,
  resolveRepoRoot,
  validateArm,
  validateHost,
} from "../docs/lab/multi-turn-trial/pack.mjs";
import {
  currentSettleMarker,
  mutate,
  reset,
} from "../docs/lab/multi-turn-trial/live.mjs";
import {
  COLUMN_NAMES,
  formatCaptureRow,
  scanProviderPayloadForCell,
  stdoutMatchesMarker,
} from "../docs/lab/multi-turn-trial/scan.mjs";
import {
  assertFlashOnlyModel,
  hermesLaunchSpec,
  launchSpecForHost,
  piLaunchSpec,
} from "../docs/lab/multi-turn-trial/launch.mjs";
import { parseAutoRpcArgs } from "../docs/lab/multi-turn-trial/auto-rpc.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packDir = join(here, "../docs/lab/multi-turn-trial");
const fixturePath = join(here, "../docs/lab/pi-trial-ts/fixture/src/settlement.ts");

async function readPackSources() {
  const names = await readdir(packDir);
  const texts = [];
  for (const name of names) {
    if (name === ".work" || name === ".gitignore") continue;
    texts.push(await readFile(join(packDir, name), "utf8"));
  }
  texts.push(await readFile(join(here, "../docs/lab/pcr/0136-multi-turn-host-trial.md"), "utf8"));
  return texts.join("\n");
}

test("PCR 0136 pack extends past the 2-turn cells with three arms and two hosts", () => {
  assert.deepEqual(ARMS, ["nothing", "freshctx-no-ts", "freshctx-ts"]);
  assert.deepEqual(HOSTS, ["pi", "hermes"]);
  assert.equal(TWO_TURN_CELLS.length, 2);
  assert.ok(CELLS.length > 2);
  assert.equal(CELLS.length, 4);
  assert.equal(CELLS[0].id, "t1-read");
  assert.equal(CELLS[1].id, "t2-settle");
  assert.equal(CELLS[1].mutate, "flip-settle");
  assert.equal(CELLS[2].id, "t3-settle");
  assert.equal(CELLS[2].mutate, "flip-settle-2");
  assert.equal(CELLS[3].id, "t4-unchanged");
  assert.equal(CELLS[3].mutate, null);
  assert.ok(CELLS.at(-1).turn > 2);
  assert.deepEqual(MARKER_SEQUENCE, [MARKER_V0, MARKER_V1, MARKER_V2]);
  assert.deepEqual(MUTATE_FLIPS["flip-settle"], { from: MARKER_V0, to: MARKER_V1 });
  assert.deepEqual(MUTATE_FLIPS["flip-settle-2"], { from: MARKER_V1, to: MARKER_V2 });
});

test("PCR 0136 prompts stay identical across arms and later quote turns", () => {
  assert.equal(promptForCell(CELLS[0]), PROMPT_T1);
  assert.equal(promptForCell(CELLS[1]), PROMPT_T2);
  assert.equal(promptForCell(CELLS[2]), PROMPT_T2);
  assert.equal(promptForCell(CELLS[3]), PROMPT_T2);
  assert.match(PROMPT_T1, /scope=symbol/u);
  assert.match(PROMPT_T1, new RegExp(TARGET_SYMBOL, "u"));
  assert.doesNotMatch(PROMPT_T2, /scope=symbol/u);
  assert.equal(expectedMarkerForCell(CELLS[2]), MARKER_V2);
  assert.deepEqual(priorMarkersForCell(CELLS[2]), [MARKER_V0, MARKER_V1]);
});

test("PCR 0136 model stays deepseek-v4-flash and Isolated Semantic Engine stays a harness env knob", () => {
  assert.equal(MODEL, "deepseek-v4-flash");
  assert.doesNotMatch(MODEL, /pro/u);
  assert.doesNotThrow(() => assertFlashOnlyModel());
  assert.throws(() => assertFlashOnlyModel("deepseek-v4-pro"), /deepseek-v4-flash/u);
  assert.deepEqual(freshCtxEnvForArm("nothing"), {});
  assert.deepEqual(freshCtxEnvForArm("freshctx-ts"), {});
  assert.deepEqual(freshCtxEnvForArm("freshctx-no-ts"), { FRESHCTX_ISOLATED_SEMANTIC_ENGINE: "off" });
  assert.deepEqual(hostReadToolArgs(), {
    path: TARGET_FILE,
    scope: "symbol",
    selector: TARGET_SYMBOL,
  });
  assert.equal(resolveRepoRoot(), dirname(here));
});

test("PCR 0136 launch specs reuse Pi and Hermes 2-turn launch patterns", () => {
  const pi = piLaunchSpec("freshctx-no-ts", { dumpDir: "/tmp/multi-turn-pi" });
  assert.equal(pi.host, "pi");
  assert.equal(pi.model, MODEL);
  assert.equal(pi.env.FRESHCTX_ISOLATED_SEMANTIC_ENGINE, "off");
  assert.equal(pi.env.PI_TRIAL_FORCE_HOST_READ, "1");
  assert.ok(pi.args.includes("deepseek-v4-flash"));
  assert.ok(pi.args.includes("--mode"));
  assert.ok(pi.args.includes("rpc"));
  assert.match(pi.args.join(" "), /dump-request\.ts/u);
  assert.match(pi.forceHostReadExtension, /force-host-read\.ts$/u);

  const hermes = hermesLaunchSpec("freshctx-no-ts", {
    proxyBaseUrl: "http://127.0.0.1:9/v1",
    dumpDir: "/tmp/multi-turn-hermes",
    hermesHome: "/tmp/multi-turn-home",
  });
  assert.equal(hermes.host, "hermes");
  assert.equal(hermes.model, MODEL);
  assert.equal(hermes.env.FRESHCTX_ISOLATED_SEMANTIC_ENGINE, "off");
  assert.equal(hermes.env.OPENAI_MODEL, MODEL);
  assert.equal(hermes.env.OPENAI_BASE_URL, "http://127.0.0.1:9/v1");
  assert.equal(typeof hermes.launch, "function");
  assert.equal(launchSpecForHost("pi", "nothing").host, "pi");
  assert.equal(launchSpecForHost("hermes", "nothing").host, "hermes");
  assert.throws(() => validateHost("cursor"), /pi\|hermes/u);
  assert.throws(() => validateArm("with-symbol"), /nothing/u);
  assert.deepEqual(parseHostArg("both"), ["pi", "hermes"]);
  assert.deepEqual(parseAutoRpcArgs(["--host=hermes", "--arm=freshctx-ts"]), {
    hosts: ["hermes"],
    arm: "freshctx-ts",
  });
});

test("PCR 0136 sequential flips change only settleDailyLedger ST0 to ST1 to ST2", async () => {
  await reset("pi", "nothing", fixtureRoot());
  const path = join(packDir, ".work/pi/nothing", TARGET_FILE);
  const before = await readFile(path, "utf8");
  assert.equal(currentSettleMarker(before), MARKER_V0);
  assert.equal(
    before.match(new RegExp(MARKER_V0, "gu"))?.length ?? 0,
    1,
  );
  assert.equal(before.includes(MARKER_V1), false);
  assert.equal(before.includes(MARKER_V2), false);

  await mutate("pi", "nothing", "flip-settle");
  const mid = await readFile(path, "utf8");
  assert.equal(currentSettleMarker(mid), MARKER_V1);
  assert.doesNotMatch(exportFunctionBlock(mid, TARGET_SYMBOL), new RegExp(MARKER_V0, "u"));
  assert.match(exportFunctionBlock(mid, LOOKALIKE_SYMBOL), new RegExp(`"${LOOKALIKE_MARKER}"`, "u"));
  assert.match(mid, new RegExp(SIBLING_MARKER, "u"));

  await mutate("pi", "nothing", "flip-settle-2");
  const after = await readFile(path, "utf8");
  assert.equal(currentSettleMarker(after), MARKER_V2);
  assert.equal(after.match(new RegExp(MARKER_V2, "gu"))?.length ?? 0, 1);
  assert.equal(after.includes(MARKER_V0), false);
  assert.equal(after.includes(MARKER_V1), false);
  assert.match(exportFunctionBlock(after, LOOKALIKE_SYMBOL), new RegExp(`"${LOOKALIKE_MARKER}"`, "u"));
  assert.match(exportFunctionBlock(after, "settleWeeklyLedger"), new RegExp(SIBLING_MARKER, "u"));
});

test("PCR 0136 flip-settle-2 before flip-settle fails closed", async () => {
  await reset("hermes", "freshctx-ts", fixtureRoot());
  await assert.rejects(
    () => mutate("hermes", "freshctx-ts", "flip-settle-2"),
    /ST1/u,
  );
  const path = join(packDir, ".work/hermes/freshctx-ts", TARGET_FILE);
  const source = await readFile(path, "utf8");
  assert.equal(currentSettleMarker(source), MARKER_V0);
  await assert.rejects(
    () => mutate("hermes", "freshctx-ts", "flip-sibling"),
    /unknown mutate/u,
  );
});

test("PCR 0136 scan scores later-turn current ST2 and stale ST1 without inventing live bytes", () => {
  const t3 = CELLS[2];
  const current = scanProviderPayloadForCell(
    JSON.stringify({
      messages: [
        {
          content: `<freshctx-unit resolution="isolated-semantic-engine">${MARKER_V2}</freshctx-unit>`,
        },
      ],
    }),
    t3,
  );
  assert.equal(current.exactCurrentBytes, true);
  assert.equal(current.stalePriorBytes, false);
  assert.equal(current.siblingBytesInRequest, false);
  assert.equal(current.resolution, "isolated-semantic-engine");
  assert.equal(current.expectedMarker, MARKER_V2);

  const stale = scanProviderPayloadForCell(
    JSON.stringify({ messages: [{ content: `old ${MARKER_V1} sibling ${SIBLING_MARKER}` }] }),
    t3,
  );
  assert.equal(stale.exactCurrentBytes, false);
  assert.equal(stale.stalePriorBytes, true);
  assert.deepEqual(stale.staleMarkers, [MARKER_V1]);
  assert.equal(stale.siblingBytesInRequest, true);
  assert.equal(stdoutMatchesMarker("SETTLE=ST2", MARKER_V2), true);
  assert.equal(stdoutMatchesMarker("SETTLE=ST1", MARKER_V2), false);
  assert.deepEqual(
    formatCaptureRow({
      host: "hermes",
      arm: "nothing",
      turn: 3,
      cell: { missing: true },
    }),
    ["hermes", "nothing", 3, "—", "—", "—", "—", "—", "—", "—"],
  );
  assert.deepEqual(COLUMN_NAMES[0], "host");
  assert.ok(COLUMN_NAMES.includes("stale_prior_bytes"));
  assert.ok(COLUMN_NAMES.includes("exact_current_bytes"));
});

test("PCR 0136 leftover sources never paste keys, call Tree-sitter a sidecar, or invent live scores", async () => {
  const source = await readPackSources();
  assert.doesNotMatch(source, /\bsidecar\b/iu);
  assert.doesNotMatch(source, /sk-[A-Za-z0-9]{8,}/u);
  assert.doesNotMatch(source, /DEEPSEEK_API_KEY\s*=\s*['"][^'"]+['"]/u);
  assert.doesNotMatch(source, /OPENAI_API_KEY\s*=\s*['"][^'"]+['"]/u);
  assert.doesNotMatch(source, /AUTORESEARCH_SCORE\s*[:=]\s*\d/u);
  assert.match(source, /Do not invent/u);
  assert.match(source, /549\/0\/0\/549/u);
  const report = await readFile(join(packDir, "REPORT.md"), "utf8");
  assert.match(report, /Pending a real host run/u);
  assert.doesNotMatch(report, /request_bytes` is \d+/u);
});

test("PCR 0136 door and lock blobs stay on hold", () => {
  const root = resolveRepoRoot();
  const door = spawnSync("git", ["hash-object", "src/anchors.mjs"], { cwd: root, encoding: "utf8" });
  const lock = spawnSync("git", ["hash-object", "bench/repos.lock.json"], { cwd: root, encoding: "utf8" });
  assert.equal(door.status, 0, door.stderr);
  assert.equal(lock.status, 0, lock.stderr);
  assert.equal(door.stdout.trim(), "f8771c93894095348185ef3453a3c2498355b3c6");
  assert.equal(lock.stdout.trim(), "4a953591e4b175e9fd69f13d6012831b01116dce");
});
