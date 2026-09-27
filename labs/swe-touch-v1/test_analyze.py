"""Checks analyze.py on synthetic Harbor trial directories (no dataset, no model).

    python3 test_analyze.py
"""

import json
import math
import tempfile
import unittest
from pathlib import Path

import analyze

DIFF = ("diff --git a/pkg/m.py b/pkg/m.py\n--- a/pkg/m.py\n+++ b/pkg/m.py\n@@ -10,3 +10,5 @@ def f():\n"
        "     a = 1\n+    if a > 2:\n+        a = 2\n     return a\n")


def trial(root: Path, arm: str, task: str, *, resolved=True, error=None, commands=(), touch=(), fc=(), submission=""):
    directory = root / "jobs" / f"swe-touch-v1__main__{arm.replace('+', '_')}" / f"{task}__abc"
    agent = directory / "agent"
    agent.mkdir(parents=True)
    result = {"task_name": task, "exception_info": {"exception_type": error} if error else None,
              "verifier_result": None if error else {"rewards": {"reward": 1.0 if resolved else 0.0}}}
    (directory / "result.json").write_text(json.dumps(result))
    messages = []
    for index, (command, output, code) in enumerate(commands):
        call = f"c{index}"
        messages.append({"role": "assistant", "content": "", "extra": {
            "actions": [{"command": command, "tool_call_id": call}],
            "response": {"model": "deepseek-flash", "usage": {"prompt_tokens": 1000, "prompt_cache_hit_tokens": 800,
                                                               "prompt_cache_miss_tokens": 200, "completion_tokens": 50}}}})
        messages.append({"role": "tool", "tool_call_id": call, "content": "", "extra": {"raw_output": output, "returncode": code}})
    trajectory = {"info": {"exit_status": "Submitted", "submission": submission}, "messages": messages}
    (agent / "mini-swe-agent.trajectory.json").write_text(json.dumps(trajectory))
    (agent / "swe_touch_interventions.jsonl").write_text("".join(json.dumps(row) + "\n" for row in touch))
    (agent / "freshctx.jsonl").write_text("".join(json.dumps(row) + "\n" for row in fc))


class StatisticsTests(unittest.TestCase):
    def test_mcnemar_exact(self):
        pairs = [(True, False)] * 5 + [(False, True)] + [(True, True)] * 10
        result = analyze.mcnemar_one_sided(pairs)
        self.assertEqual((result["first_only"], result["second_only"]), (5, 1))
        self.assertAlmostEqual(result["p_one_sided"], 7 / 64)
        self.assertEqual(analyze.mcnemar_one_sided([(True, True)])["p_one_sided"], 1.0)

    def test_newcombe_contains_the_difference_and_is_symmetric(self):
        pairs = [(True, True)] * 40 + [(True, False)] * 8 + [(False, True)] * 3 + [(False, False)] * 49
        ci = analyze.newcombe_paired(pairs)
        self.assertAlmostEqual(ci["difference"], 0.05)
        self.assertLess(ci["lower"], 0.05)
        self.assertGreater(ci["upper"], 0.05)
        flipped = analyze.newcombe_paired([(y, x) for x, y in pairs])
        self.assertAlmostEqual(flipped["lower"], -ci["upper"])
        self.assertAlmostEqual(flipped["upper"], -ci["lower"])
        same = analyze.newcombe_paired([(True, True)] * 50 + [(False, False)] * 50)
        self.assertEqual(same["difference"], 0)
        self.assertTrue(same["lower"] < 0 < same["upper"])


class EndToEndTests(unittest.TestCase):
    def test_report_decision_measures_and_gate(self):
        with tempfile.TemporaryDirectory() as base:
            root = Path(base)
            (root / "plan.json").write_text(json.dumps({"phase": "main", "arms": {a: {"trials": 12} for a in analyze.ARMS}}))
            applied = [{"event_type": "swe_touch_intervention", "patch_applied": True, "command_index": 1, "intervention_index": 1}]
            commands = [("nl -ba pkg/m.py | sed -n '1,20p'", "...", 0),
                        ("nl -ba pkg/m.py | sed -n '8,14p'", "...", 0),
                        ("sed -i 's/a = 1/a = 3/' pkg/m.py", "", 0),
                        ("python3 -c \"p='pkg/m.py';s=open(p).read();s.replace('x','y')\"", "Traceback: nope", 1)]
            for index in range(12):
                task = f"t{index:02d}"
                trial(root, "V", task, resolved=index < 9)
                trial(root, "V+FC", task, resolved=index < 9)
                trial(root, "S", task, resolved=index < 4, commands=commands, touch=applied,
                      fc=[{"event": "coverage", "intervention_index": 1, "covered": "full"}])
                trial(root, "S+FC", task, resolved=index < 9, commands=commands, touch=applied,
                      submission="+    if a > 2:\n+        a = 2\n",
                      fc=[{"event": "coverage", "intervention_index": 1, "covered": "full" if index < 8 else "none"},
                          {"event": "command", "status": "observed"}, {"event": "command", "status": "skipped", "reason": "mismatch"},
                          {"event": "request", "projection_bytes": 900, "unavailable_markers": 0}])
                trial(root, "S+N", task, resolved=index < 8, commands=commands[:1], touch=applied,
                      error="EnvironmentStartTimeoutError" if index == 11 else None)
            rows = analyze.load(root, {f"t{i:02d}": DIFF for i in range(12)})
            report = analyze.analyze(rows)
        arms = report["arms"]
        self.assertEqual(arms["S+FC"]["resolved"], 9)
        self.assertEqual(arms["S+N"]["infra_errors"], 1)
        self.assertEqual(report["tests"]["H1 S+FC>S"]["first_only"], 5)
        self.assertAlmostEqual(report["tests"]["H1 S+FC>S"]["p_one_sided"], 1 / 32)
        self.assertEqual(report["tests"]["H2 S+FC>S+N"]["pairs"], 11)
        self.assertEqual(report["decision"], {"recovers_silent_edit_loss": True, "h2": "a diff notice is enough here"})
        self.assertEqual(report["tests"]["H3 V+FC vs V"]["verdict"], "inconclusive")
        fc = arms["S+FC"]
        self.assertEqual(fc["coverage_round1"], {"full": 8, "none": 4})
        self.assertEqual(fc["reads_observed_share"], 0.5)
        self.assertEqual(fc["final_keeps_user_code"], {"all": 12})
        self.assertEqual(fc["reinspected_strict"], {"True": 12})
        self.assertEqual(arms["S+N"]["reinspected_loose"], {"False": 12})
        self.assertEqual(fc["stale_edit_failures"], 12)
        self.assertEqual(fc["steps_after_edit_mean"], 3)
        self.assertAlmostEqual(fc["cache_hit_share"], 0.8)
        self.assertAlmostEqual(fc["cost_usd"], 12 * 4 * (800 * 0.014 + 200 * 0.44 + 50 * 1.32) / 1e6)
        self.assertEqual(fc["served_models"], {"deepseek-flash": 48})
        gate = analyze.gate(report, {arm: 192 for arm in analyze.ARMS}, 150.0)
        self.assertAlmostEqual(gate["coverage_full_round1"], 8 / 12)
        self.assertFalse(gate["stop"])
        self.assertTrue(analyze.gate(report, {arm: 10**6 for arm in analyze.ARMS}, 150.0)["stop"])
        self.assertTrue(math.isclose(gate["infra_error_rate"], 1 / 60))


if __name__ == "__main__":
    unittest.main()
