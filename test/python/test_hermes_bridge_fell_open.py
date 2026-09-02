import json
import subprocess
import types
import unittest
from pathlib import Path
from unittest import mock

from test_hermes_engine import load_engine_module


class BridgeFallOpenLeavesALogLine(unittest.TestCase):
    """`_call_bridge` returns None on a non-zero exit, a timeout, an OSError, or
    a missing state file, and Hermes then sends its own request unchanged. On
    dest 5030c56d that fall-open left no trace: eight numbered provider dumps
    without a FreshCtx unit, a registered engine, exit 0 (PCR 0168). Every
    fall-open path must say why in the Hermes log."""

    def setUp(self):
        self.module = load_engine_module()
        self.engine = self.module.FreshCtxContextEngine(model="stub")
        self.engine._freshctx_state_file = Path("/tmp/freshctx-test-state.json")
        self.messages = [{"role": "user", "content": "x"}]

    def test_non_zero_exit_logs_operation_code_and_stderr(self):
        failed = types.SimpleNamespace(
            returncode=1,
            stdout="",
            stderr="Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'web-tree-sitter'",
        )
        with mock.patch.object(self.module.subprocess, "run", return_value=failed):
            with self.assertLogs(self.module.logger, level="WARNING") as captured:
                self.assertIsNone(self.engine.select_context(self.messages))
        line = "\n".join(captured.output)
        self.assertIn("FreshCtx bridge select fell open", line)
        self.assertIn("exit 1", line)
        self.assertIn("ERR_MODULE_NOT_FOUND", line)

    def test_timeout_logs(self):
        with mock.patch.object(
            self.module.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired(cmd="node", timeout=15.0),
        ):
            with self.assertLogs(self.module.logger, level="WARNING") as captured:
                self.assertIsNone(self.engine.on_turn_complete(self.messages))
        self.assertIn("FreshCtx bridge observe fell open", "\n".join(captured.output))
        self.assertIn("TimeoutExpired", "\n".join(captured.output))

    def test_missing_node_logs(self):
        with mock.patch.object(
            self.module.subprocess, "run", side_effect=FileNotFoundError(2, "No such file", "node")
        ):
            with self.assertLogs(self.module.logger, level="WARNING") as captured:
                self.assertIsNone(self.engine.select_context(self.messages))
        self.assertIn("No such file", "\n".join(captured.output))

    def test_missing_state_file_logs(self):
        engine = self.module.FreshCtxContextEngine(model="stub")
        with mock.patch.object(self.module.subprocess, "run") as run:
            with self.assertLogs(self.module.logger, level="WARNING") as captured:
                self.assertIsNone(engine.select_context(self.messages))
        run.assert_not_called()
        self.assertIn("on_session_start", "\n".join(captured.output))

    def test_non_json_stdout_logs(self):
        garbled = types.SimpleNamespace(returncode=0, stdout="not json", stderr="")
        with mock.patch.object(self.module.subprocess, "run", return_value=garbled):
            with self.assertLogs(self.module.logger, level="WARNING") as captured:
                self.assertIsNone(self.engine.select_context(self.messages))
        self.assertIn("FreshCtx bridge select fell open", "\n".join(captured.output))

    def test_success_stays_quiet_at_warning(self):
        ok = types.SimpleNamespace(
            returncode=0,
            stdout=json.dumps({"applied": True, "messages": self.messages, "selected": 1, "unresolved": 0}),
            stderr="",
        )
        with mock.patch.object(self.module.subprocess, "run", return_value=ok):
            with self.assertNoLogs(self.module.logger, level="WARNING"):
                self.assertEqual(self.engine.select_context(self.messages), self.messages)
