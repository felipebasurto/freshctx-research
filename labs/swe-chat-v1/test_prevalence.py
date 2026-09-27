"""Synthetic sessions for prevalence.py (no dataset needed).  python3 test_prevalence.py"""

import json
import unittest

import prevalence


def use(sid, turn, call, tool, path=None, command=None, **payload):
    return {"session_id": sid, "turn_number": turn, "turn_type": "tool_use", "tool_name": tool, "tool_call_id": call,
            "file_path": path, "command": command, "tool_input_json": json.dumps(payload), "agent": AGENT[sid]}


def result(sid, turn, call, content):
    return {"session_id": sid, "turn_number": turn, "turn_type": "tool_result", "tool_call_id": call,
            "content": content, "agent": AGENT[sid]}


def numbered(lines, start=1):
    return "\n".join(f"{start + i:6d}→{line}" for i, line in enumerate(lines))


AGENT = {"cc": "Claude Code", "gm": "Gemini CLI", "cx": "Codex"}
V1 = ["def f():", "    return 1", "", "def g():", "    return 2"]
V2 = ["def f():", "    return 10", "", "def g():", "    return 2"]

ROWS = [
    # Claude Code: read, external change, notice, then an edit without re-reading that fails.
    use("cc", 0, "a", "Read", "/r/app.py"), result("cc", 1, "a", numbered(V1)),
    {"session_id": "cc", "turn_number": 2, "turn_type": "system_injected", "agent": "Claude Code",
     "content": "<system-reminder>Note: /r/app.py was modified, either by the user or by a linter. Here are the relevant changes</system-reminder>"},
    use("cc", 3, "b", "Edit", "/r/app.py", old_string="return 1"), result("cc", 4, "b", "<tool_use_error>String to replace not found in file.</tool_use_error>"),
    use("cc", 5, "c", "Read", "/r/app.py"), result("cc", 6, "c", numbered(V2)),
    # Gemini: read twice with nothing in between, content changed -> clean external change.
    use("gm", 0, "a", "read_file", "src/app.py"), result("gm", 1, "a", "\n".join(V1)),
    use("gm", 2, "b", "read_file", "src/app.py"), result("gm", 3, "b", "\n".join(V2)),
    # Codex: shell reads with a shell command in between (ambiguous), then an agent edit (not comparable).
    use("cx", 0, "a", "shell", command="nl -ba app.py | sed -n '1,5p'"), result("cx", 1, "a", "\n".join(f"{i:6d}\t{l}" for i, l in enumerate(V1, 1))),
    use("cx", 2, "b", "shell", command="pytest -q"), result("cx", 3, "b", "1 passed"),
    use("cx", 4, "c", "shell", command="cat app.py"), result("cx", 5, "c", "\n".join(V2)),
    use("cx", 6, "d", "apply_patch", "app.py"), result("cx", 7, "d", "Done"),
    use("cx", 8, "e", "shell", command="cat app.py"), result("cx", 9, "e", "\n".join(V1)),
]


class PrevalenceTests(unittest.TestCase):
    def test_detectors(self):
        report = prevalence.analyze(ROWS, [{"agent": "Claude Code", "human_modified": 3}, {"agent": "Codex"}])
        cc, gm, cx = report["Claude Code"], report["Gemini CLI"], report["Codex"]
        self.assertEqual(cc["counts"]["claude_code_notices"], 1)
        self.assertEqual(cc["after_notice"], {"edited without re-reading": 1})
        self.assertEqual(cc["counts"]["stale_edit_failures_after_unread_change"], 1)
        self.assertEqual(cc["counts"]["edits"], 1)
        self.assertEqual(cc["sessions_with_human_lines"], 1)
        self.assertEqual(gm["counts"]["external_change_clean"], 1)
        self.assertEqual(gm["sessions_with_clean_external_change"], 1)
        self.assertEqual(cx["counts"].get("external_change_clean", 0), 0)
        self.assertEqual(cx["counts"]["change_with_shell_between"], 1)
        self.assertEqual(cx["counts"]["rereads_comparable"], 1)  # the read after the agent's own edit is not compared
        self.assertEqual(cx["sessions_with_human_lines"], 0)

    def test_line_parsing(self):
        self.assertEqual(prevalence.lines_of(numbered(["a", "b"], 10), None), {10: "a", 11: "b"})
        self.assertEqual(prevalence.lines_of("x\ny\n", 5), {5: "x", 6: "y"})
        cut = prevalence.lines_of("line\n" * 2500, None)  # 12,500 chars: the last line may be cut
        self.assertEqual(len(cut), 2500)
        self.assertEqual(len(prevalence.lines_of(("line\n" * 2500)[:10_003], None)), 2000)


if __name__ == "__main__":
    unittest.main()
