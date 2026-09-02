import importlib.util
import json
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


class ExecutedReadArgsReachTheBridge(unittest.TestCase):
    """Hermes `pre_tool_call` `modify` rewrites the executed args only; the
    persisted `tool_calls` keep the model's path. `post_tool_call` is the one
    place the executed args and the tool_call_id meet (PCR 0165)."""

    def setUp(self):
        self.module = load_engine_module()
        self.engine = self.module.FreshCtxContextEngine(model="stub")
        self.engine._freshctx_state_file = Path("/tmp/freshctx-test-state.json")

    def _bridge_payloads(self):
        payloads = []

        def fake_run(argv, input, **kwargs):
            payloads.append(json.loads(input))
            return types.SimpleNamespace(returncode=0, stdout=json.dumps({"observedCalls": 1}))

        return payloads, fake_run

    def test_post_tool_call_records_read_args_by_call_id(self):
        self.engine.on_post_tool_call(
            tool_name="read_file",
            args={"path": "/work/src/settlement.ts", "scope": "symbol", "selector": "settleDailyLedger"},
            tool_call_id="call_1",
            result="{}",
            task_id="",
        )
        self.engine.on_post_tool_call(tool_name="terminal", args={"command": "ls"}, tool_call_id="call_2")
        self.engine.on_post_tool_call(tool_name="read_file", args={"path": "x"}, tool_call_id="")
        payloads, fake_run = self._bridge_payloads()
        with mock.patch.object(self.module.subprocess, "run", side_effect=fake_run):
            self.engine.on_turn_complete([{"role": "user", "content": "x"}])
        self.assertEqual(
            payloads[0]["executedReadArgsByCallId"],
            {"call_1": {"path": "/work/src/settlement.ts", "scope": "symbol", "selector": "settleDailyLedger"}},
        )

    def test_recorded_args_clear_after_a_successful_observe(self):
        self.engine.on_post_tool_call(tool_name="read_file", args={"path": "a.ts"}, tool_call_id="call_1")
        payloads, fake_run = self._bridge_payloads()
        with mock.patch.object(self.module.subprocess, "run", side_effect=fake_run):
            self.engine.on_turn_complete([{"role": "user", "content": "x"}])
            self.engine.on_turn_complete([{"role": "user", "content": "y"}])
        self.assertEqual(payloads[0]["executedReadArgsByCallId"], {"call_1": {"path": "a.ts"}})
        self.assertEqual(payloads[1]["executedReadArgsByCallId"], {})

    def test_register_wires_the_post_tool_call_hook(self):
        registered = {}

        class Ctx:
            def register_context_engine(self, engine):
                registered["engine"] = engine

            def register_hook(self, name, callback):
                registered[name] = callback

        self.module.register(Ctx())
        self.assertIs(
            registered["post_tool_call"].__self__, registered["engine"],
            "the hook must feed the engine instance Hermes selected",
        )


if __name__ == "__main__":
    unittest.main()
