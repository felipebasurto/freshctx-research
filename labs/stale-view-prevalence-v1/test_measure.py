import json
import unittest
from collections import Counter

from measure import analyse, changes_lines

PATH = "/workspace/repo/app.py"
FILE = "def f():\n    return 1\n\ndef g():\n    return 2"


def view(content_lines, start=1):
    body = "\n".join(f"{n:6}\t{line}" for n, line in enumerate(content_lines, start))
    return f"Here's the result of running `cat -n` on {PATH}:\n{body}\n"


class Trace:
    def __init__(self):
        self.messages = [{"role": "system", "content": "", "tool_calls": None}]
        self.calls = 0

    def tool(self, name, args, content):
        self.calls += 1
        call_id = f"c{self.calls}"
        self.messages.append({"role": "assistant", "content": "", "tool_calls": [
            {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]})
        self.messages.append({"role": "tool", "name": name, "tool_call_id": call_id, "content": content})
        return self

    def view(self):
        return self.tool("str_replace_editor", {"command": "view", "path": PATH}, view(FILE.split("\n")))

    def replace(self, old, new, ok=True):
        content = f"The file {PATH} has been edited. Here's the result..." if ok else "ERROR:\nNo replacement was performed"
        return self.tool("str_replace_editor", {"command": "str_replace", "path": PATH, "old_str": old, "new_str": new}, content)

    def bash(self, command):
        return self.tool("execute_bash", {"command": command}, "")

    def run(self):
        self.messages.append({"role": "assistant", "content": "done", "tool_calls": None})
        stats = Counter()
        stats["hist_stale_requests_per_traj"] = Counter()
        validation = {"rereads_covering_stale": 0, "reread_differs": 0, "reread_identical": 0, "spot_check": []}
        analyse("t", self.messages, stats, validation)
        return stats, validation


class ChangesLines(unittest.TestCase):
    def test_changed_line_counts(self):
        self.assertTrue(changes_lines(FILE, "return 1", "return 3"))

    def test_pure_append_does_not_count(self):
        self.assertFalse(changes_lines(FILE, "    return 2", "    return 2\n\ndef h():\n    return 4"))

    def test_insert_before_shifts_displayed_lines(self):
        self.assertTrue(changes_lines(FILE, "def f():", "import os\ndef f():"))

    def test_absent_old_str_does_not_count(self):
        self.assertFalse(changes_lines(FILE, "return 9", "return 3"))


class Windows(unittest.TestCase):
    def test_edit_after_view_makes_later_requests_stale(self):
        stats, _ = Trace().view().replace("return 1", "return 3").run()
        self.assertEqual(stats["reads_ever_stale"], 1)
        self.assertEqual(stats["requests_with_stale"], 1)
        self.assertEqual(stats["trajectories_final_request_stale"], 1)

    def test_failed_edit_does_not_count(self):
        stats, _ = Trace().view().replace("return 1", "return 3", ok=False).run()
        self.assertEqual(stats["reads_ever_stale"], 0)

    def test_possible_restore_before_edit_disqualifies_read(self):
        stats, _ = Trace().view().bash("git stash").replace("return 1", "return 3").run()
        self.assertEqual(stats["reads_ever_stale"], 0)

    def test_command_naming_file_before_edit_disqualifies_read(self):
        stats, _ = Trace().view().bash("sed -i s/1/5/ app.py").replace("return 1", "return 3").run()
        self.assertEqual(stats["reads_ever_stale"], 0)

    def test_unrelated_edit_first_disqualifies_read(self):
        stats, _ = Trace().view().replace("    return 2", "    return 2\n# end").replace("return 1", "return 3").run()
        self.assertEqual(stats["reads_ever_stale"], 0)

    def test_possible_restore_closes_window(self):
        stats, _ = Trace().view().replace("return 1", "return 3").bash("git checkout app.py").run()
        self.assertEqual(stats["reads_ever_stale"], 1)
        self.assertEqual(stats["requests_with_stale"], 1)
        self.assertEqual(stats["trajectories_final_request_stale"], 0)

    def test_unrelated_command_keeps_window_open(self):
        stats, _ = Trace().view().replace("return 1", "return 3").bash("python -m pytest -q").run()
        self.assertEqual(stats["requests_with_stale"], 2)

    def test_reread_inside_window_is_checked(self):
        trace = Trace().view().replace("return 1", "return 3")
        trace.tool("str_replace_editor", {"command": "view", "path": PATH},
                   view(FILE.replace("return 1", "return 3").split("\n")))
        _, validation = trace.run()
        self.assertEqual(validation["rereads_covering_stale"], 1)
        self.assertEqual(validation["reread_differs"], 1)


if __name__ == "__main__":
    unittest.main()
