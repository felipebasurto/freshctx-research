import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { scanProviderPayloadForCell } from "../docs/lab/multi-turn-trial/scan.mjs";
import { CELLS } from "../docs/lab/multi-turn-trial/pack.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Hermes 999703f imports `adapters/hermes/__init__.py` twice. The
 * `plugins.context_engine` loader selects the engine through `_EngineCollector`,
 * whose `register_hook` is a no-op. The general plugin loader imports a second
 * module for the enabled user plugin and that copy's `post_tool_call` fires.
 * The live Thinker host has `hosts/hermes/plugins/context_engine/freshctx`
 * symlinked (docs/lab/live-2026-08-22/commands.txt), so the serving engine and
 * the firing hook come from different module objects.
 */
const TWO_LOADER_PROBE = `
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(${JSON.stringify(ROOT)})

agent = types.ModuleType("agent")
compressor = types.ModuleType("agent.context_compressor")

class ContextCompressor:
    def __init__(self, model=None, api_key=None, **kwargs):
        self.model = model

compressor.ContextCompressor = ContextCompressor
agent.context_compressor = compressor
sys.modules["agent"] = agent
sys.modules["agent.context_compressor"] = compressor

def load(module_name):
    spec = importlib.util.spec_from_file_location(module_name, ROOT / "adapters/hermes/__init__.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

class EngineCollector:
    engine = None
    def register_context_engine(self, engine):
        self.engine = engine
    def register_hook(self, *args, **kwargs):
        pass

class PluginManagerCtx:
    hooks = {}
    def register_context_engine(self, engine):
        pass
    def register_hook(self, name, callback):
        self.hooks.setdefault(name, []).append(callback)

collector = EngineCollector()
load("plugins.context_engine.freshctx").register(collector)
manager = PluginManagerCtx()
load("hermes_plugins.freshctx").register(manager)

dest = Path(tempfile.mkdtemp(prefix="freshctx-pcr-0166-"))
try:
    work = dest / "docs/lab/multi-turn-trial/.work/hermes/freshctx-ts"
    (work / "src").mkdir(parents=True)
    fixture = (ROOT / "docs/lab/pi-trial-ts/fixture/src/settlement.ts").read_text()
    (work / "src/settlement.ts").write_text(fixture)
    executed_path = str(work / "src/settlement.ts")
    call_id = "call_t1"
    os.environ["FRESHCTX_CWD"] = str(work)
    engine = collector.engine
    engine._freshctx_state_file = dest / "state.json"

    for callback in manager.hooks["post_tool_call"]:
        callback(
            tool_name="read_file",
            args={"path": executed_path, "scope": "symbol", "selector": "settleDailyLedger"},
            result="{}",
            tool_call_id=call_id,
        )

    lines = fixture.split("\\n")
    read_result = json.dumps({
        "content": "\\n".join(f"{i + 1}|{line}" for i, line in enumerate(lines)),
        "total_lines": len(lines),
        "file_size": len(fixture.encode()),
    })
    persisted = {"path": str(dest / "src/settlement.ts"), "scope": "symbol", "selector": "settleDailyLedger"}
    messages = [
        {"role": "user", "content": "Lee el símbolo settleDailyLedger en src/settlement.ts"},
        {"role": "assistant", "content": "", "tool_calls": [
            {"id": call_id, "type": "function", "function": {"name": "read_file", "arguments": json.dumps(persisted)}},
        ]},
        {"role": "tool", "tool_call_id": call_id, "content": read_result},
    ]
    selected = engine.select_context(messages)
    print(json.dumps({"messages": selected if selected is not None else messages}))
finally:
    shutil.rmtree(dest)
`.trim();

test("PCR 0166: the post_tool_call store is shared across Hermes' two plugin loaders", () => {
  const result = spawnSync("python3", ["-c", TWO_LOADER_PROBE], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, FRESHCTX_NODE: process.execPath },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error?.code === "ENOENT") {
    test.skip("python3 unavailable");
    return;
  }
  assert.equal(result.status, 0, result.stderr);
  const scan = scanProviderPayloadForCell(result.stdout, CELLS[0]);
  assert.equal(scan.hasFreshCtxUnit, true, "executed fixture path reaches the serving engine's bridge");
  assert.equal(scan.resolution, "isolated-semantic-engine");
});

test("PCR 0166 door and lock blobs stay on hold", () => {
  const door = spawnSync("git", ["hash-object", "src/anchors.mjs"], { cwd: ROOT, encoding: "utf8" });
  const lock = spawnSync("git", ["hash-object", "bench/repos.lock.json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(door.status, 0, door.stderr);
  assert.equal(lock.status, 0, lock.stderr);
  assert.equal(door.stdout.trim(), "f8771c93894095348185ef3453a3c2498355b3c6");
  assert.equal(lock.stdout.trim(), "4a953591e4b175e9fd69f13d6012831b01116dce");
});
