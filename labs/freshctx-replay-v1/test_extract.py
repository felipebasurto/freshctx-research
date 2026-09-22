import json
import unittest

from extract import parse_snippet, parse_view, read_only, script

ROOT = "/workspace/demo__demo__1.0"
P = ROOT + "/pkg/mod.py"


class FakeRepo:
    directory = "fake"

    def __init__(self, files):
        self.files = files

    def read(self, rel):
        return self.files.get(rel)


def numbered(lines, start=1):
    return "\n".join(f"{n:6d}\t{t}" for n, t in enumerate(lines, start))


def view(lines, start=1):
    return f"Here's the result of running `cat -n` on {P}:\n{numbered(lines, start)}\n"


def edited(lines, start):
    return (f"The file {P} has been edited. Here's the result of running `cat -n` on a snippet of {P}:\n"
            f"{numbered(lines, start)}\nReview the changes and make sure they are as expected. Edit the file again if necessary.")


def traj(*steps):
    msgs = [{"role": "system", "content": "s"},
            {"role": "user", "content": f"<uploaded_files>\n{ROOT}\n</uploaded_files>\nfix it"}]
    for k, (name, args, result) in enumerate(steps):
        cid = f"c{k}"
        msgs.append({"role": "assistant", "content": "", "tool_calls": [
            {"id": cid, "function": {"name": name, "arguments": json.dumps(args)}}]})
        msgs.append({"role": "tool", "tool_call_id": cid, "name": name, "content": result})
    msgs.append({"role": "assistant", "content": "done", "tool_calls": None})
    return msgs


FILE = "def a():\n    return 1\n\ndef b():\n    return 2\n"


class ReadOnly(unittest.TestCase):
    def test_plain_reads(self):
        self.assertTrue(read_only("cd /workspace/x && grep -n foo pkg/mod.py | head -5"))
        self.assertTrue(read_only("git diff pkg/mod.py"))

    def test_writers(self):
        for cmd in ["sed -i s/a/b/ pkg/mod.py", "cat a > pkg/mod.py", "python reproduce.py", "git stash",
                    "grep foo pkg/mod.py | tee out", "find . -name '*.pyc' -delete", "echo $(rm x)"]:
            self.assertFalse(read_only(cmd), cmd)


class Parsing(unittest.TestCase):
    def test_clipped_view_keeps_complete_lines_and_partial_prefix(self):
        content = (f"Here's the result of running `cat -n` on {P}:\n{numbered(['x = 1', 'y = 2'])}\n"
                   "     3\tz = <response clipped><NOTE>Due to the max output limit...</NOTE>\n")
        self.assertEqual(parse_view(content, P), (1, ["x = 1", "y = 2"], "z = "))

    def test_snippet_drops_padding_line(self):
        self.assertEqual(parse_snippet(edited(["    return 3", ""], 5)), (5, ["    return 3"]))


class Rebuild(unittest.TestCase):
    def test_base_commit_edit_and_verified_view(self):
        s, reason = script(traj(
            ("str_replace_editor", {"command": "view", "path": P, "view_range": [4, 5]}, view(["def b():", "    return 2"], 4)),
            ("str_replace_editor", {"command": "str_replace", "path": P, "old_str": "return 2", "new_str": "return 3"},
             edited(["def b():", "    return 3", ""], 4)),
            ("str_replace_editor", {"command": "view", "path": P}, view(FILE.replace("2", "3").split("\n"))),
        ), FakeRepo({"pkg/mod.py": FILE}))
        self.assertEqual(reason, "complete")
        ops = [e["op"] for e in s["events"]]
        self.assertEqual(ops, ["request", "write", "view", "request", "write", "snippet", "request", "view", "request"])
        self.assertEqual(s["events"][4]["text"], FILE.replace("return 2", "return 3"))

    def test_disagreeing_view_cuts(self):
        _, reason = script(traj(
            ("str_replace_editor", {"command": "view", "path": P, "view_range": [1, 1]}, view(["def other():"])),
        ), FakeRepo({"pkg/mod.py": FILE}))
        self.assertEqual(reason, "view_disagrees_with_rebuild")

    def test_shell_writer_naming_observed_file_cuts(self):
        _, reason = script(traj(
            ("str_replace_editor", {"command": "view", "path": P}, view(FILE.split("\n"))),
            ("execute_bash", {"command": "sed -i s/1/9/ pkg/mod.py"}, ""),
        ), FakeRepo({"pkg/mod.py": FILE}))
        self.assertEqual(reason, "shell_may_write_observed_file")

    def test_writer_named_before_load_blocks_base_commit(self):
        _, reason = script(traj(
            ("execute_bash", {"command": "python fix.py pkg/mod.py"}, ""),
            ("str_replace_editor", {"command": "view", "path": P}, view(FILE.split("\n"))),
        ), FakeRepo({"pkg/mod.py": FILE}))
        self.assertEqual(reason, "file_content_unknown")

    def test_ambiguous_replace_cuts(self):
        _, reason = script(traj(
            ("str_replace_editor", {"command": "view", "path": P}, view(FILE.split("\n"))),
            ("str_replace_editor", {"command": "str_replace", "path": P, "old_str": "return", "new_str": "yield"},
             edited(["x"], 1)),
        ), FakeRepo({"pkg/mod.py": FILE}))
        self.assertEqual(reason, "str_replace_not_unique_in_rebuild")


if __name__ == "__main__":
    unittest.main()
