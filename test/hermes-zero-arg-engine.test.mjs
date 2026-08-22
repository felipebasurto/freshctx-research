import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const ZERO_ARG_PROBE = `
import importlib.util
import os
import sys
import types
from pathlib import Path

agent_pkg = types.ModuleType("agent")
compressor_mod = types.ModuleType("agent.context_compressor")

class ContextCompressor:
    def __init__(self, model, api_key, **kwargs):
        self.model = model
        self.api_key = api_key
        self.kwargs = kwargs

compressor_mod.ContextCompressor = ContextCompressor
agent_pkg.context_compressor = compressor_mod
sys.modules["agent"] = agent_pkg
sys.modules["agent.context_compressor"] = compressor_mod

adapter_path = Path(${JSON.stringify(ROOT)}).joinpath("adapters/hermes/__init__.py")
spec = importlib.util.spec_from_file_location("freshctx_hermes_adapter", adapter_path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

for key in ("HERMES_MODEL", "OPENAI_MODEL", "OPENAI_BASE_URL", "HERMES_BASE_URL"):
    os.environ.pop(key, None)
os.environ["DEEPSEEK_API_KEY"] = "dummy-key-for-test"

engine = mod.FreshCtxContextEngine()
assert engine.model == "deepseek-chat", engine.model
assert engine.api_key == "dummy-key-for-test", engine.api_key
assert "base_url" not in engine.kwargs

os.environ["HERMES_MODEL"] = "hermes-model-from-env"
engine_env_model = mod.FreshCtxContextEngine()
assert engine_env_model.model == "hermes-model-from-env", engine_env_model.model

os.environ.pop("HERMES_MODEL", None)
os.environ["OPENAI_BASE_URL"] = "https://example.test/v1"
engine_base = mod.FreshCtxContextEngine()
assert engine_base.kwargs.get("base_url") == "https://example.test/v1", engine_base.kwargs

print("OK")
`.trim();

test("FreshCtxContextEngine() accepts zero args with env defaults", () => {
  const result = spawnSync("python3", ["-c", ZERO_ARG_PROBE], {
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
    result.stderr || result.stdout || "FreshCtxContextEngine zero-arg probe failed",
  );
  assert.match(result.stdout, /OK/u);
});
