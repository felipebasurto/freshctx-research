import copy
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load_engine_module(module_name="freshctx_hermes"):
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
        module_name, ROOT / "adapters" / "hermes" / "__init__.py"
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
    place the executed args and the tool_call_id meet (PCR 0165). Hermes
    deep-copies the registered engine per agent (agent_init), so the store
    cannot live on the instance."""

    def setUp(self):
        self.module = load_engine_module()
        self.engine = copy.deepcopy(self.module.FreshCtxContextEngine(model="stub"))
        self.engine._freshctx_state_file = Path("/tmp/freshctx-test-state.json")

    def _bridge_payloads(self):
        payloads = []

        def fake_run(argv, input, **kwargs):
            payloads.append(json.loads(input))
            return types.SimpleNamespace(returncode=0, stdout=json.dumps({"observedCalls": 1}))

        return payloads, fake_run

    def test_post_tool_call_records_read_args_by_call_id(self):
        record = self.module.record_executed_read_args
        record(
            tool_name="read_file",
            args={"path": "/work/src/settlement.ts", "scope": "symbol", "selector": "settleDailyLedger"},
            tool_call_id="call_1",
            result="{}",
            task_id="",
        )
        record(tool_name="terminal", args={"command": "ls"}, tool_call_id="call_2")
        record(tool_name="read_file", args={"path": "x"}, tool_call_id="")
        payloads, fake_run = self._bridge_payloads()
        with mock.patch.object(self.module.subprocess, "run", side_effect=fake_run):
            self.engine.select_context([{"role": "user", "content": "x"}])
        self.assertEqual(
            payloads[0]["executedReadArgsByCallId"],
            {"call_1": {"path": "/work/src/settlement.ts", "scope": "symbol", "selector": "settleDailyLedger"}},
        )

    def test_recorded_args_clear_after_a_successful_observe(self):
        self.module.record_executed_read_args(tool_name="read_file", args={"path": "a.ts"}, tool_call_id="call_1")
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
        self.assertIs(registered["post_tool_call"], self.module.record_executed_read_args)


class OneStorePerProcess(unittest.TestCase):
    """Hermes `plugins.context_engine` imports the plugin once to select the
    engine (its `_EngineCollector.register_hook` is a no-op) and the general
    plugin loader imports it again for the enabled user plugin, whose hook is
    the one that fires. The store must not be per module (PCR 0166)."""

    def test_hook_from_one_module_reaches_the_engine_from_another(self):
        engine_module = load_engine_module("plugins.context_engine.freshctx")
        hook_module = load_engine_module("hermes_plugins.freshctx")
        engine = engine_module.FreshCtxContextEngine(model="stub")
        engine._freshctx_state_file = Path("/tmp/freshctx-test-state.json")
        hook_module.record_executed_read_args(
            tool_name="read_file", args={"path": "/work/src/settlement.ts"}, tool_call_id="call_1"
        )
        payloads = []

        def fake_run(argv, input, **kwargs):
            payloads.append(json.loads(input))
            return types.SimpleNamespace(returncode=0, stdout=json.dumps({"observedCalls": 1}))

        with mock.patch.object(engine_module.subprocess, "run", side_effect=fake_run):
            engine.on_turn_complete([{"role": "user", "content": "x"}])
        self.assertEqual(payloads[0]["executedReadArgsByCallId"], {"call_1": {"path": "/work/src/settlement.ts"}})
        other = hook_module.FreshCtxContextEngine(model="stub")
        other._freshctx_state_file = Path("/tmp/freshctx-test-state.json")
        with mock.patch.object(hook_module.subprocess, "run", side_effect=fake_run):
            other._call_bridge("select", [])
        self.assertEqual(payloads[1]["executedReadArgsByCallId"], {}, "one observe clears every module copy")


if __name__ == "__main__":
    unittest.main()
