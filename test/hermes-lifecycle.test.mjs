import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildReadToolCall,
  buildToolResultMessage,
  createHermesAdapter,
  createHermesStateFile,
} from "../adapters/hermes/replay.mjs";
import { loadState } from "../adapters/hermes/bridge.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const LIFECYCLE_PROBE = `
import importlib.util
import json
import os
import sys
import tempfile
import types
from pathlib import Path

agent_pkg = types.ModuleType("agent")
compressor_mod = types.ModuleType("agent.context_compressor")

class ContextCompressor:
    def __init__(self, model, api_key, **kwargs):
        self.model = model
        self.api_key = api_key
        self._session_id = ""

    def on_session_start(self, session_id, **kwargs):
        raise RuntimeError("parent on_session_start failed")

compressor_mod.ContextCompressor = ContextCompressor
agent_pkg.context_compressor = compressor_mod
sys.modules["agent"] = agent_pkg
sys.modules["agent.context_compressor"] = compressor_mod

adapter_path = Path(${JSON.stringify(ROOT)}).joinpath("adapters/hermes/__init__.py")
spec = importlib.util.spec_from_file_location("freshctx_hermes_adapter", adapter_path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

tmpdir = Path(tempfile.mkdtemp(prefix="freshctx-hermes-lifecycle-"))
hermes_home = tmpdir / "hermes-home"
state_root = hermes_home / "artifacts" / "freshctx-state"
workspace = tmpdir / "workspace"
workspace.mkdir(parents=True, exist_ok=True)
os.environ.pop("FRESHCTX_STATE_DIR", None)
os.environ["HERMES_HOME"] = str(hermes_home)
os.environ["TERMINAL_CWD"] = str(workspace)
os.environ["DEEPSEEK_API_KEY"] = "dummy-key-for-test"

stale = "ALPHA_OLD_MARKER_7f3a\\n"
current = "ALPHA_OLD_MARKER_7f3a\\nALPHA_NEW_MARKER_9c2b\\n"
alpha_path = workspace / "alpha.txt"
alpha_path.write_text(stale, encoding="utf8")

engine = mod.FreshCtxContextEngine()
session_id = "live-a-append-session"
engine.on_session_start(session_id, hermes_home=str(hermes_home))

state_file = engine._freshctx_state_file
assert state_file is not None, "state file path not set"
assert state_file.exists(), "state file not created on on_session_start"
assert state_file.parent == state_root, (state_file.parent, state_root)

turn_one = [
    {
        "role": "assistant",
        "content": "",
        "tool_calls": [{
            "id": "call-read-alpha",
            "type": "function",
            "function": {
                "name": "read_file",
                "arguments": json.dumps({"path": "alpha.txt"}),
            },
        }],
    },
    {
        "role": "tool",
        "tool_call_id": "call-read-alpha",
        "content": stale,
    },
    {"role": "user", "content": "append a line to alpha.txt"},
]

engine.on_turn_complete(turn_one)
state = json.loads(state_file.read_text(encoding="utf8"))
assert state.get("tracked", {}).get("call-read-alpha", {}).get("path") == "alpha.txt"

alpha_path.write_text(current, encoding="utf8")
selected = engine.select_context(
    turn_one,
    incoming_message={"role": "user", "content": "what is in alpha.txt now?"},
    budget_tokens=128000,
)
assert isinstance(selected, list), "select_context no-op'd"
payload = json.dumps(selected)
assert "ALPHA_OLD_MARKER_7f3a" in payload
assert "ALPHA_NEW_MARKER_9c2b" in payload
assert payload.count("ALPHA_NEW_MARKER_9c2b") == 1

lazy = mod.FreshCtxContextEngine()
lazy._freshctx_session_id = session_id
lazy_select = lazy.select_context(turn_one, budget_tokens=128000)
assert isinstance(lazy_select, list), "lazy select_context no-op'd without on_session_start"

print("OK")
`.trim();

test("Hermes adapter lifecycle persists observe state and select rewrites stale reads", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "freshctx-hermes-lifecycle-"));
  const stale = "ALPHA_OLD_MARKER_7f3a\n";
  const current = "ALPHA_OLD_MARKER_7f3a\nALPHA_NEW_MARKER_9c2b\n";
  await writeFile(join(workspace, "alpha.txt"), stale);

  const stateFile = await createHermesStateFile();
  const adapter = createHermesAdapter({ stateFile });
  const turnOne = [
    buildReadToolCall({ toolCallId: "call-read-alpha", path: "alpha.txt" }),
    buildToolResultMessage({ toolCallId: "call-read-alpha", content: stale }),
    { role: "user", content: "append a line to alpha.txt" },
  ];

  await adapter.onTurnComplete(structuredClone(turnOne), { cwd: workspace });
  const observed = await loadState(stateFile);
  assert.equal(observed.tracked?.["call-read-alpha"]?.path, "alpha.txt");

  await writeFile(join(workspace, "alpha.txt"), current);
  const selectResult = await adapter.onSelectContext(structuredClone(turnOne), { cwd: workspace }, {
    incomingMessage: { role: "user", content: "what is in alpha.txt now?" },
  });

  assert.ok(Array.isArray(selectResult.messages), "select_context returned no messages");
  const payload = JSON.stringify(selectResult.messages);
  assert.match(payload, /ALPHA_NEW_MARKER_9c2b/u);
  assert.equal(payload.split("ALPHA_NEW_MARKER_9c2b").length - 1, 1);
});

test("FreshCtxContextEngine on_session_start survives parent failure and lazy select works", () => {
  const result = spawnSync("python3", ["-c", LIFECYCLE_PROBE], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: "dummy-key-for-test",
    },
  });

  if (result.error?.code === "ENOENT") {
    test.skip("python3 unavailable");
    return;
  }

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || "Hermes lifecycle probe failed",
  );
  assert.match(result.stdout, /OK/u);
});

test("FreshCtxContextEngine on_session_start creates artifacts/freshctx-state session file", async () => {
  const hermesHome = await mkdtemp(join(tmpdir(), "freshctx-hermes-home-"));
  const probe = `
import importlib.util
import os
import sys
import types
from pathlib import Path

agent_pkg = types.ModuleType("agent")
compressor_mod = types.ModuleType("agent.context_compressor")

class ContextCompressor:
    def __init__(self, model, api_key, **kwargs):
        pass

    def on_session_start(self, session_id, **kwargs):
        pass

compressor_mod.ContextCompressor = ContextCompressor
agent_pkg.context_compressor = compressor_mod
sys.modules["agent"] = agent_pkg
sys.modules["agent.context_compressor"] = compressor_mod

adapter_path = Path(${JSON.stringify(join(ROOT, "adapters/hermes/__init__.py"))})
spec = importlib.util.spec_from_file_location("freshctx_hermes_adapter", adapter_path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

engine = mod.FreshCtxContextEngine(model="test", api_key="dummy")
engine.on_session_start("session-1", hermes_home=${JSON.stringify(hermesHome)})
path = engine._freshctx_state_file
assert path is not None
assert path.exists()
assert "artifacts" in path.parts and "freshctx-state" in path.parts
print(str(path))
`.trim();

  const result = spawnSync("python3", ["-c", probe], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") {
    test.skip("python3 unavailable");
    return;
  }
  assert.equal(result.status, 0, result.stderr);
  const statePath = result.stdout.trim();
  const info = await stat(statePath);
  assert.ok(info.isFile());
  const body = await readFile(statePath, "utf8");
  assert.match(body, /"calls"/u);
});
