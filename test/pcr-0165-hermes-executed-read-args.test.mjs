import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildReadToolCall,
  buildToolResultMessage,
  createHermesAdapter,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import { resolutionFromStringifiedPayload } from "../docs/lab/pi-trial-ts/resolution-from-stringified.mjs";
import { TARGET_FILE, TARGET_SYMBOL } from "../docs/lab/multi-turn-trial/pack.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ROOT, "docs/lab/pi-trial-ts/fixture", TARGET_FILE);
const CALL_ID = "call_00_destroot";

/**
 * Hermes `pre_tool_call` `modify` redirected the read to the `.work` fixture,
 * but the persisted `tool_calls[].function.arguments` keep the model's own
 * dest-root path. `read_file` returns line-numbered JSON with no path field.
 */
async function destRootTrial() {
  const dest = await mkdtemp(join(tmpdir(), "freshctx-pcr-0165-dest-"));
  const workspace = join(dest, "docs/lab/multi-turn-trial/.work/hermes/freshctx-ts");
  await mkdir(join(workspace, "src"), { recursive: true });
  const fixture = await readFile(FIXTURE, "utf8");
  await writeFile(join(workspace, TARGET_FILE), fixture);
  const persistedPath = join(dest, TARGET_FILE);
  const executedPath = join(workspace, TARGET_FILE);
  const hermesReadResult = JSON.stringify({
    content: fixture.split("\n").map((line, index) => `${index + 1}|${line}`).join("\n"),
    total_lines: fixture.split("\n").length,
    file_size: Buffer.byteLength(fixture),
  });
  const persisted = [
    { role: "user", content: `Lee el símbolo ${TARGET_SYMBOL} en ${TARGET_FILE}` },
    buildReadToolCall({
      toolCallId: CALL_ID,
      path: persistedPath,
      scope: "symbol",
      selector: TARGET_SYMBOL,
    }),
    buildToolResultMessage({ toolCallId: CALL_ID, content: hermesReadResult }),
    { role: "assistant", content: "SETTLE=ST0" },
    { role: "user", content: "No uses herramientas. ¿Cuál es ahora MARKER_SETTLE?" },
  ];
  const executedReadArgsByCallId = {
    [CALL_ID]: { path: executedPath, scope: "symbol", selector: TARGET_SYMBOL },
  };
  return { dest, workspace, fixture, persisted, executedReadArgsByCallId, executedPath };
}

function flipMarker(fixture, from, to) {
  return fixture.replace(`const MARKER_SETTLE = "${from}"`, `const MARKER_SETTLE = "${to}"`);
}

function scannedResolution(result) {
  return resolutionFromStringifiedPayload(JSON.stringify({ messages: result.messages }));
}

test("PCR 0165: executed read args close the Isolated Semantic Engine when persisted args miss the fixture", async () => {
  const trial = await destRootTrial();
  try {
    const stateFile = await createHermesStateFile("freshctx-pcr-0165-state-");
    const adapter = createHermesAdapter({ stateFile, budgetChars: 80_000 });
    const ctx = { cwd: trial.workspace };
    const t1 = trial.persisted.slice(0, 4);

    await adapter.onTurnComplete(structuredClone(t1), ctx, {
      executedReadArgsByCallId: trial.executedReadArgsByCallId,
    });
    await writeFile(join(trial.workspace, TARGET_FILE), flipMarker(trial.fixture, "ST0", "ST1"));

    const t2 = await adapter.onSelectContext(structuredClone(trial.persisted), ctx);
    assert.ok(t2, "select must not throw");
    assert.equal(t2.applied, true);
    assert.equal(t2.unresolved, 0, "the executed fixture path resolves under cwd");
    assert.equal(scannedResolution(t2), "isolated-semantic-engine");
    assert.match(t2.projectionText, /"ST1"/u, "live tail carries the flipped marker");
    assert.doesNotMatch(t2.projectionText, /"SW0"/u, "symbol isolation omits the sibling");
    assert.match(t2.projectionText, new RegExp(`path="${trial.executedPath}"`, "u"));
  } finally {
    await rm(trial.dest, { recursive: true, force: true });
  }
});

test("PCR 0165: bridge CLI persists executed read args so a later host process closes without them", async () => {
  const trial = await destRootTrial();
  try {
    const stateFile = join(trial.dest, "state", "session.json");
    const bridge = join(ROOT, "adapters/hermes/bridge.mjs");
    const run = (payload) => {
      const child = spawnSync(process.execPath, [bridge], { input: JSON.stringify(payload), encoding: "utf8" });
      assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout);
    };
    run({
      operation: "observe",
      cwd: trial.workspace,
      stateFile,
      messages: trial.persisted.slice(0, 4),
      executedReadArgsByCallId: trial.executedReadArgsByCallId,
    });
    await writeFile(join(trial.workspace, TARGET_FILE), flipMarker(trial.fixture, "ST0", "ST1"));

    const later = run({ operation: "select", cwd: trial.workspace, stateFile, messages: trial.persisted });
    assert.equal(later.applied, true);
    assert.equal(scannedResolution(later), "isolated-semantic-engine");
  } finally {
    await rm(trial.dest, { recursive: true, force: true });
  }
});

test("PCR 0165: without executed read args a missing persisted path stays unresolved, never guessed", async () => {
  const trial = await destRootTrial();
  try {
    const stateFile = await createHermesStateFile("freshctx-pcr-0165-closed-");
    const adapter = createHermesAdapter({ stateFile, budgetChars: 80_000 });
    const ctx = { cwd: trial.workspace };
    await adapter.onTurnComplete(structuredClone(trial.persisted.slice(0, 4)), ctx);
    const t2 = await adapter.onSelectContext(structuredClone(trial.persisted), ctx);
    assert.ok(t2);
    assert.equal(t2.unresolved, 1);
    assert.equal(scannedResolution(t2), "none");
    assert.doesNotMatch(t2.projectionText, /<freshctx-unit/u);
  } finally {
    await rm(trial.dest, { recursive: true, force: true });
  }
});

test("PCR 0165 door and lock blobs stay on hold", () => {
  const door = spawnSync("git", ["hash-object", "src/anchors.mjs"], { cwd: ROOT, encoding: "utf8" });
  const lock = spawnSync("git", ["hash-object", "bench/repos.lock.json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(door.status, 0, door.stderr);
  assert.equal(lock.status, 0, lock.stderr);
  assert.equal(door.stdout.trim(), "f8771c93894095348185ef3453a3c2498355b3c6");
  assert.equal(lock.stdout.trim(), "4a953591e4b175e9fd69f13d6012831b01116dce");
});
