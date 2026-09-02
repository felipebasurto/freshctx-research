import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  HERMES_TRIAL_PROTOCOL_ENV,
  detectHermesProtocol,
  hermesProtocolFromEnv,
  launchHermes,
} from "../docs/lab/hermes-trial-ts/launch-hermes.mjs";
import {
  FRESHCTX_ENGINE_REGISTERED_LINE,
  assertFreshCtxEngineRegistered,
  freshctxEngineMissingReason,
} from "../docs/lab/hermes-trial-ts/hermes-queries.mjs";
import { CELLS } from "../docs/lab/multi-turn-trial/pack.mjs";
import { scanProviderPayloadForCell } from "../docs/lab/multi-turn-trial/scan.mjs";

const ROOT = new URL("..", import.meta.url);

/** `hermes --help` at locked host 999703f (measured on this Cloud Agent). */
const HERMES_999703F_HELP = `usage: hermes [-h] [--version] [-z PROMPT] [--usage-file PATH] [-m MODEL]
              [--ignore-user-config] [--ignore-rules] [--safe-mode] [--tui]
              {chat,model,moa,plugins,acp,profile,completion,dashboard,serve}
    acp                 Run Hermes Agent as an ACP (Agent Client Protocol)
  --tui                 Launch the modern TUI instead of the classic REPL
`;

/** HERMES_HOME/logs/agent.log lines measured on 999703f, dest layout. */
const AGENT_LOG_REGISTERED = [
  "2026-09-02 22:06:00,654 INFO hermes_cli.plugin_capabilities: capability_check plugin=context_engine/freshctx capability=tools.override decision=deny checked_by=plugin_capability_granted evidence=not granted",
  "2026-09-02 22:06:00,703 INFO hermes_cli.plugins: Plugin 'freshctx' registered context engine: freshctx",
  "2026-09-02 22:06:00,707 WARNING hermes_cli.plugins: Plugin 'freshctx' tried to register a context engine, but one is already registered. Only one context engine plugin is allowed.",
].join("\n");

const AGENT_LOG_NOT_FOUND = [
  "2026-09-02 22:31:46,898 INFO hermes_cli.plugins: HERMES_SAFE_MODE=1 — plugin discovery skipped",
  "2026-09-02 22:31:49,007 WARNING run_agent: Context engine 'freshctx' not found — falling back to built-in compressor",
].join("\n");

const ENVELOPE_NO_UNIT =
  '{"input":[{"role":"user","content":"<freshctx turn=\\"0\\" selected=\\"0\\" unresolved=\\"1\\" budget-omitted=\\"0\\">The following code is the current workspace state.</freshctx>"}]}';

async function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("PCR 0167: HERMES_TRIAL_PROTOCOL=cli wins over the 999703f --help acp detection", async () => {
  assert.equal(HERMES_TRIAL_PROTOCOL_ENV, "HERMES_TRIAL_PROTOCOL");
  assert.equal(detectHermesProtocol(HERMES_999703F_HELP), "acp", "999703f help lists acp");
  assert.equal(hermesProtocolFromEnv({}), null);
  assert.equal(hermesProtocolFromEnv({ HERMES_TRIAL_PROTOCOL: "" }), null);
  assert.equal(hermesProtocolFromEnv({ HERMES_TRIAL_PROTOCOL: "cli" }), "cli");
  assert.throws(() => hermesProtocolFromEnv({ HERMES_TRIAL_PROTOCOL: "rpc" }), /HERMES_TRIAL_PROTOCOL/u);

  const dir = await mkdtemp(join(tmpdir(), "pcr-0167-"));
  const bin = join(dir, "hermes");
  await writeFile(
    bin,
    `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(HERMES_999703F_HELP)});\n`,
    { mode: 0o755 },
  );
  const work = join(dir, "work");
  await withEnv({ HERMES_BIN: bin, HERMES_TRIAL_PROTOCOL: "cli" }, async () => {
    const launched = await launchHermes({
      arm: "nothing",
      cwd: work,
      workspace: work,
      hermesHome: join(dir, "hermes-home"),
      proxyBaseUrl: "http://127.0.0.1:9/v1",
      dumpDir: join(dir, "dump"),
    });
    assert.equal(launched.protocol, "cli");
    assert.equal(launched.proc, null, "cli protocol spawns no persistent child");
    assert.equal(launched.args.at(-1), "chat");
  });
});

test("PCR 0167: freshctx arm fails closed when Hermes never registered the FreshCtx engine", () => {
  assert.equal(FRESHCTX_ENGINE_REGISTERED_LINE, "registered context engine: freshctx");
  assert.equal(freshctxEngineMissingReason(AGENT_LOG_REGISTERED), null);

  const notFound = freshctxEngineMissingReason(AGENT_LOG_NOT_FOUND);
  assert.match(notFound, /FreshCtx context engine not registered in Hermes/u);
  assert.match(notFound, /Context engine 'freshctx' not found/u);

  const silent = freshctxEngineMissingReason("");
  assert.match(silent, /no context engine line in HERMES_HOME logs/u);

  assert.doesNotThrow(() => assertFreshCtxEngineRegistered(AGENT_LOG_REGISTERED, { arm: "freshctx-ts" }));
  assert.doesNotThrow(() => assertFreshCtxEngineRegistered(AGENT_LOG_NOT_FOUND, { arm: "nothing" }));
  assert.throws(
    () => assertFreshCtxEngineRegistered(AGENT_LOG_NOT_FOUND, { arm: "freshctx-ts" }),
    (error) =>
      error instanceof Error
      && /arm=freshctx-ts/u.test(error.message)
      && /Context engine 'freshctx' not found/u.test(error.message),
  );
});

test("PCR 0167: scan separates an envelope without units from no envelope", () => {
  const withEnvelope = scanProviderPayloadForCell(ENVELOPE_NO_UNIT, CELLS[0]);
  assert.equal(withEnvelope.hasFreshCtxEnvelope, true);
  assert.equal(withEnvelope.hasFreshCtxUnit, false);
  assert.equal(withEnvelope.resolution, "none");

  const without = scanProviderPayloadForCell('{"input":[{"role":"user","content":"SETTLE=..."}]}', CELLS[0]);
  assert.equal(without.hasFreshCtxEnvelope, false);
  assert.equal(without.hasFreshCtxUnit, false);
  assert.equal(without.resolution, "none");
});

test("PCR 0167 door and lock blobs stay on hold", () => {
  const cwd = ROOT;
  const door = spawnSync("git", ["hash-object", "src/anchors.mjs"], { cwd, encoding: "utf8" });
  const lock = spawnSync("git", ["hash-object", "bench/repos.lock.json"], { cwd, encoding: "utf8" });
  assert.equal(door.status, 0, door.stderr);
  assert.equal(lock.status, 0, lock.stderr);
  assert.equal(door.stdout.trim(), "f8771c93894095348185ef3453a3c2498355b3c6");
  assert.equal(lock.stdout.trim(), "4a953591e4b175e9fd69f13d6012831b01116dce");
});
