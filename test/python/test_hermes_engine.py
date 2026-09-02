import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load_engine_module():
    # Hermes is not installed in CI; provide the base class the plugin subclasses.
    agent = types.ModuleType("agent")
    compressor = types.ModuleType("agent.context_compressor")

    class ContextCompressor:  # minimal stand-in for Hermes' class
        def __init__(self, model=None, api_key=None, **kwargs):
            self.model = model

    compressor.ContextCompressor = ContextCompressor
    agent.context_compressor = compressor
    sys.modules["agent"] = agent
    sys.modules["agent.context_compressor"] = compressor
    spec = importlib.util.spec_from_file_location(
        "freshctx_hermes", ROOT / "adapters" / "hermes" / "__init__.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SelectContextAppliedGate(unittest.TestCase):
    def setUp(self):
        self.module = load_engine_module()
        self.engine = self.module.FreshCtxContextEngine(model="stub")
        self.engine._freshctx_state_file = Path("/tmp/freshctx-test-state.json")

    def test_applied_false_returns_none(self):
        with mock.patch.object(
            self.engine, "_call_bridge",
            return_value={"applied": False, "messages": [{"role": "user", "content": "pruned"}]},
        ):
            self.assertIsNone(self.engine.select_context([{"role": "user", "content": "x"}]))

    def test_applied_true_returns_messages(self):
        messages = [{"role": "user", "content": "kept"}]
        with mock.patch.object(
            self.engine, "_call_bridge", return_value={"applied": True, "messages": messages}
        ):
            self.assertEqual(self.engine.select_context([{"role": "user", "content": "x"}]), messages)

    def test_bridge_failure_returns_none(self):
        with mock.patch.object(self.engine, "_call_bridge", return_value=None):
            self.assertIsNone(self.engine.select_context([{"role": "user", "content": "x"}]))


if __name__ == "__main__":
    unittest.main()
